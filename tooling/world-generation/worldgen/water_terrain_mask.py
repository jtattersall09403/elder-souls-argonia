"""Native vertex protection mask for the separate adaptive terrain exporter."""

import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
from .compile_chunks import DEFAULT_HEIGHTS
from .scale import RAW_METRES_PER_SAMPLE
from .water_cross_sections import load_water_metadata


def moving_shore_mask(gap, support, season, tide, stage=None):
    from .water_stage import stage_range
    stage = stage_range(stage)
    return ((support == 255) & (gap >= -stage['drySeasonAmplitudeM'] * season - stage['lowTideAmplitudeM'] * tide - .10)
            & (gap <= stage['seasonalAmplitudeM'] * season + stage['tidalAmplitudeM'] * tide + .10))


def interval_hull(first, second):
    """Conservative envelope for every zipper diagonal, including bends."""
    points = sorted(set(tuple(point) for point in (*first, *second)))
    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    def half(sequence):
        hull = []
        for point in sequence:
            while len(hull) >= 2 and cross(hull[-2], hull[-1], point) <= 0:
                hull.pop()
            hull.append(point)
        return hull
    return [np.asarray(point) for point in half(points)[:-1] + half(points[::-1])[:-1]]


def ribbon_vertex_mask(shape, ribbons, metres_per_pixel):
    result = np.zeros(shape, bool)
    for ribbon in ribbons:
        points = ribbon['points']
        edges = []
        for i, point in enumerate(points):
            xy = np.array([point['z'], point['x']]) / metres_per_pixel
            before, after = points[max(0, i - 1)], points[min(len(points) - 1, i + 1)]
            incoming = xy - np.array([before['z'], before['x']]) / metres_per_pixel
            outgoing = np.array([after['z'], after['x']]) / metres_per_pixel - xy
            a, b = np.linalg.norm(incoming), np.linalg.norm(outgoing)
            incoming = incoming / a if a else outgoing / max(b, 1e-9)
            outgoing = outgoing / b if b else incoming
            direction = incoming + outgoing
            normal = np.array([direction[1], -direction[0]]) / max(np.linalg.norm(direction), 1e-9)
            if np.linalg.norm(normal) < 1e-6:
                normal = np.array([outgoing[1], -outgoing[0]])
            if 'crossSectionNormalX' in point:
                normal = np.array([point['crossSectionNormalZ'], point['crossSectionNormalX']])
            section = point.get('crossSection')
            offsets = ([section[0]['offsetM'], section[-1]['offsetM']] if section else
                       [-point['halfWidthM'], point['halfWidthM']])
            edges.append([xy + normal * offset / metres_per_pixel for offset in offsets])
        for first, second in zip(edges, edges[1:]):
            hull = interval_hull(first, second)
            for a, b, c in ((hull[0], hull[i], hull[i + 1]) for i in range(1, len(hull) - 1)):
                low = np.maximum(np.floor(np.minimum(np.minimum(a, b), c)).astype(int), 0)
                high = np.minimum(np.ceil(np.maximum(np.maximum(a, b), c)).astype(int), np.array(shape) - 1)
                if np.any(high < low):
                    continue
                y, x = np.mgrid[low[0]:high[0] + 1, low[1]:high[1] + 1]
                det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
                if abs(det) < 1e-12:
                    continue
                u = ((b[1] - c[1]) * (y - c[0]) + (c[0] - b[0]) * (x - c[1])) / det
                v = ((c[1] - a[1]) * (y - c[0]) + (a[0] - c[0]) * (x - c[1])) / det
                result[low[0]:high[0] + 1, low[1]:high[1] + 1] |= (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
            # Subpixel strips can contain no lattice vertex; mark the four
            # corners of every centre-line sample's cell as well.
            for point in (*first, *second):
                cell = np.clip(np.floor(point).astype(int), 0, np.array(shape) - 2)
                result[cell[0]:cell[0] + 2, cell[1]:cell[1] + 2] = True
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('water_dir', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    meta = load_water_metadata(args.water_dir, endpoints_only=True)
    ground = np.load(DEFAULT_HEIGHTS).copy()
    overlay = json.loads((args.water_dir / 'water-bed-overlay.json').read_text())
    for index, height, _ in overlay['changes']:
        ground.flat[index] = height
    spec = meta['surface']
    texture = np.asarray(Image.open(args.water_dir / spec['file']), dtype=np.uint32)
    surface = spec['minM'] + (texture[:, :, 0] * 256 + texture[:, :, 1]) / 65535 * (spec['maxM'] - spec['minM'])
    support = np.asarray(Image.open(args.water_dir / spec['supportFile']))[:, :, 0]
    factor = spec['metresPerPixel'] / RAW_METRES_PER_SAMPLE
    nearest_surface = ndimage.affine_transform(surface, np.eye(2) / factor, output_shape=ground.shape, order=0, mode='nearest')
    native_support = ndimage.affine_transform(support, np.eye(2) / factor, output_shape=ground.shape, order=0, mode='nearest')
    shore = np.asarray(Image.open(args.water_dir / spec['shoreFile']))
    access = np.asarray(Image.open(args.water_dir / spec['accessFile']))
    season = ndimage.affine_transform(shore[:, :, 1].astype(np.float32) / 255, np.eye(2) / factor,
                                     output_shape=ground.shape, order=0, mode='nearest')
    tide = ndimage.affine_transform(access[:, :, 2].astype(np.float32) / 255, np.eye(2) / factor,
                                   output_shape=ground.shape, order=0, mode='nearest')
    # Protect actual moving shore, not every submerged ocean vertex within
    # the global freshwater season range. Fully submerged interiors may
    # retain adaptive LOD; use the bounds that built this water bundle.
    gap = ground - nearest_surface
    protect = moving_shore_mask(gap, native_support, season, tide, meta.get("stageRange"))
    protect |= ribbon_vertex_mask(ground.shape, meta['ribbons'], RAW_METRES_PER_SAMPLE)
    topology = json.loads((args.water_dir / spec['terrainTopologyFile']).read_text())
    for index in topology['flippedCells']:
        row, col = divmod(index, ground.shape[1] - 1)
        protect[row:row + 2, col:col + 2] = True
    protect = ndimage.binary_dilation(protect, iterations=2)
    np.save(args.out, protect)
    print(json.dumps({'gridSize': len(protect), 'protectedNativeVertexCount': int(protect.sum()),
                      'fraction': float(protect.mean()), 'file': str(args.out)}))


if __name__ == '__main__':
    main()
