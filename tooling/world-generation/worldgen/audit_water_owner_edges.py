"""Prepare physical wet ownership-edge probes and same-owner raster fallback."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('water_dir', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--all-owner-edges', action='store_true',
                        help='Export unfiltered potential owner edges for runtime tide/season union selection')
    args = parser.parse_args()
    meta = json.loads((args.water_dir / 'water-meta.json').read_text())
    spec = meta['surface']
    profiles = np.fromfile(args.water_dir / meta['crossSections']['file'], dtype='<f4').reshape(-1, 3)
    if not args.all_owner_edges:
        support = np.asarray(Image.open(args.water_dir / spec['supportFile']), dtype=np.uint32)
        surface = np.asarray(Image.open(args.water_dir / spec['file']), dtype=np.uint32)
        access = np.asarray(Image.open(args.water_dir / spec['accessFile']), dtype=np.uint32)
        heights = (spec['minM'] + (surface[:, :, 0] * 256 + surface[:, :, 1]) / 65535 * (spec['maxM'] - spec['minM'])).astype(np.float32)
        depths = (surface[:, :, 2] * .1 + spec['depthMinM']).astype(np.float32)

    def raster(x, z):
        gx, gz = np.clip(np.array([x, z]) / spec['metresPerPixel'], 0, spec['size'] - 1)
        nx, nz = np.floor(np.array([gx, gz]) + .5).astype(int)
        owner = support[nz, nx, 1:]
        ix, iz = int(gx), int(gz)
        total = height = depth = required = 0.
        for dx, dz in ((0, 0), (1, 0), (0, 1), (1, 1)):
            cx, cz = min(ix + dx, spec['size'] - 1), min(iz + dz, spec['size'] - 1)
            if not np.array_equal(support[cz, cx, 1:], owner):
                continue
            weight = (gx - ix if dx else 1 - gx + ix) * (gz - iz if dz else 1 - gz + iz)
            total += weight
            height += heights[cz, cx] * weight
            depth += depths[cz, cx] * weight
            required += (access[cz, cx, 0] * 256 + access[cz, cx, 1]) * weight
        wet = bool(total and support[nz, nx, 0] == 255 and depth / total > .004
                   and spec['accessMinOffsetM'] + required / total / 65535 * spec['accessSpanM'] <= 0)
        return {'wet': wet, 'height': float(height / total) if total else 0.}

    cases = []
    for ribbon in meta['ribbons']:
        points = ribbon['points']
        for i, point in enumerate(points):
            p = np.array([point['x'], point['z']])
            before, after = points[max(0, i - 1)], points[min(i + 1, len(points) - 1)]
            incoming = p - [before['x'], before['z']]
            outgoing = np.array([after['x'], after['z']]) - p
            a, b = np.linalg.norm(incoming), np.linalg.norm(outgoing)
            incoming = incoming / a if a else outgoing / max(b, 1e-9)
            outgoing = outgoing / b if b else incoming
            direction = incoming + outgoing
            normal = np.array([-direction[1], direction[0]]) / max(np.linalg.norm(direction), 1e-9)
            if np.linalg.norm(normal) < 1e-6:
                normal = np.array([-outgoing[1], outgoing[0]])
            if 'crossSectionNormalX' in point:
                normal = np.array([point['crossSectionNormalX'], point['crossSectionNormalZ']])
            for side, kind in enumerate(point['boundaryKinds']):
                if kind != 'reach-owner':
                    continue
                sample = profiles[point['crossSectionStart'] + (point['crossSectionCount'] - 1 if side else 0)]
                if not args.all_owner_edges and (sample[2] > 0 or point['y'] - sample[1] <= .004):
                    continue
                sign = 1 if side else -1
                edge = (p + normal * sample[0]).astype(np.float32).astype(float)
                inside, outside = edge - normal * sign * .01, edge + normal * sign * .01
                case = {'id': ribbon['id'], 'point': i, 'side': side, 'height': point['y'],
                        'inside': inside.tolist(), 'outside': outside.tolist()}
                if not args.all_owner_edges:
                    case['raster'] = raster(*outside)
                cases.append(case)
    output = {'schemaVersion': 2, 'selection': 'all-owner-edges',
              'waterMetaSha256': hashlib.sha256((args.water_dir / 'water-meta.json').read_bytes()).hexdigest(),
              'cases': cases} if args.all_owner_edges else cases
    args.out.write_text(json.dumps(output, separators=(',', ':')))
    print(json.dumps({'cases': len(cases), 'out': str(args.out)}))


if __name__ == '__main__':
    main()
