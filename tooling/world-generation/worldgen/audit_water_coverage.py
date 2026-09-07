"""Tile-streamed authored-target screen against captured native water fields.

No expensive per-point mesh queries, no terrain changes and no map publication.
Reports every supplied footprint family and explicitly leaves flowing geometry
unverified. Extend this audit with actual geometry; do not equate proxy wetness
or a partial footprint archive with province-wide acceptance.
"""

import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from .water_coverage import COVERAGE_CLASSES, screen_field_tile, require_compiled_stage
from .water_stage import stage_range


def audit_targets(fields, targets, stage=None, tile_size=256, channel_coverage=None):
    if tile_size < 1:
        raise ValueError('Tile size must be positive')
    stage = stage_range(stage)
    names = ('ground2', 'w2', 'access2', 'season2', 'tidal2', 'support_kind2')
    arrays = [np.asarray(fields[k]) for k in names]
    shape = arrays[0].shape
    if len(shape) != 2 or any(a.shape != shape for a in arrays):
        raise ValueError('Audit requires matching two-dimensional native fields')
    if not targets or any(m.shape != shape or m.dtype != np.bool_ for m in targets.values()):
        raise ValueError('Targets must be boolean masks on the native field grid')
    bodies = fields.get('bodies2')
    if bodies is not None and (bodies.shape != shape or bodies.dtype.kind not in 'ui'):
        raise ValueError('Body indices must use the same native integer grid')
    groups = {name: {} for name in targets}
    result = {name: {'nativeVertices': 0, 'standingFieldWet': dict(low=0, base=0, maximum=0),
                     'maximumClasses': dict.fromkeys(COVERAGE_CLASSES, 0)} for name in targets}
    if channel_coverage is not None:
        if any(v.shape != shape for v in channel_coverage):
            raise ValueError('Channel coverage must use the same native grid')
        for row in result.values():
            row['exportedChannelGeometryVertices'] = 0
            row['channelMeshWet'] = dict(low=0, base=0, maximum=0)
            row['channelOrStandingFieldWet'] = dict(low=0, base=0, maximum=0)
            row['maximumUnresolvedAfterSuppliedGeometry'] = 0
    for y in range(0, shape[0], tile_size):
        for x in range(0, shape[1], tile_size):
            tile = np.s_[y:y + tile_size, x:x + tile_size]
            if not any(mask[tile].any() for mask in targets.values()):
                continue
            bits, classes = screen_field_tile(*(a[tile] for a in arrays), stage=stage)
            for name, mask in targets.items():
                chosen = mask[tile]
                row = result[name]
                row['nativeVertices'] += int(chosen.sum())
                for bit, label in enumerate(('low', 'base', 'maximum')):
                    row['standingFieldWet'][label] += int(np.count_nonzero(bits[chosen] & (1 << bit)))
                    if channel_coverage is not None:
                        mesh_bits = channel_coverage[1][tile][chosen]
                        row['channelMeshWet'][label] += int(np.count_nonzero(mesh_bits & (1 << bit)))
                        row['channelOrStandingFieldWet'][label] += int(np.count_nonzero((bits[chosen] | mesh_bits) & (1 << bit)))
                if channel_coverage is not None:
                    row['exportedChannelGeometryVertices'] += int(np.count_nonzero(channel_coverage[0][tile][chosen]))
                counts = np.bincount(classes[chosen], minlength=len(COVERAGE_CLASSES))
                for label, count in zip(COVERAGE_CLASSES, counts):
                    row['maximumClasses'][label] += int(count)
                unresolved = chosen & (classes != 1)
                if channel_coverage is not None:
                    unresolved &= (channel_coverage[1][tile] & 4) == 0
                    row['maximumUnresolvedAfterSuppliedGeometry'] += int(unresolved.sum())
                if bodies is not None:
                    yy, xx = np.nonzero(unresolved)
                    codes = bodies[tile][yy, xx].astype(np.int64) * len(COVERAGE_CLASSES) + classes[yy, xx]
                    unique, inverse, totals = np.unique(codes, return_inverse=True, return_counts=True)
                    first = np.full(len(unique), shape[0] * shape[1], np.int64)
                    np.minimum.at(first, inverse, (yy + y) * shape[1] + xx + x)
                    for code, count, sample in zip(unique, totals, first):
                        old_count, old_sample = groups[name].get(int(code), (0, int(sample)))
                        groups[name][int(code)] = (old_count + int(count), min(old_sample, int(sample)))
    if bodies is not None:
        for name, grouped in groups.items():
            result[name]['problemGroups'] = [
                {'bodyIndex': code // len(COVERAGE_CLASSES),
                 'classification': COVERAGE_CLASSES[code % len(COVERAGE_CLASSES)],
                 'nativeVertices': count, 'representativeNativeVertex': list(divmod(first, shape[1]))}
                for code, (count, first) in sorted(grouped.items())]
    return {'schemaVersion': 1, 'status': 'field-screen-not-mesh-or-map-acceptance',
            'scope': 'All vertices of supplied footprint families only; families may overlap',
            'problemGroupScope': 'Field shortfalls/unverified samples not covered by supplied channel meshes',
            'gridShape': list(shape), 'stageRange': stage, 'footprints': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fields', type=Path, required=True)
    parser.add_argument('--targets', type=Path, required=True)
    parser.add_argument('--ground', type=Path, required=True, help='Native terrain NPY underlying these fields')
    parser.add_argument('--bed-overlay', type=Path, help='Exact correction overlay used to produce these fields')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--tile-size', type=int, default=256)
    parser.add_argument('--stage-range', type=Path, help='JSON containing the four explicit stage bounds')
    parser.add_argument('--field-stage-range', type=Path,
                        help='Captured fields\' compiled bounds; defaults to the original stage range')
    parser.add_argument('--channel-mesh', type=Path, help='Directory from export_water_audit_mesh.cjs')
    parser.add_argument('--channel-result', type=Path, help='Save sampled target mask and channel coverage for reuse')
    args = parser.parse_args()
    if args.channel_result and not args.channel_mesh:
        parser.error('--channel-result requires --channel-mesh')
    stage = json.loads(args.stage_range.read_text()) if args.stage_range else None
    compiled_stage = json.loads(args.field_stage_range.read_text()) if args.field_stage_range else None
    stage = require_compiled_stage(stage, compiled_stage)
    captured = np.load(args.fields)
    fields = {key: captured[key] for key in ('w2', 'access2', 'season2', 'tidal2', 'support_kind2')}
    if 'bodies2' in captured:
        fields['bodies2'] = captured['bodies2']
    fields['ground2'] = np.load(args.ground)
    if args.bed_overlay:
        for index, height, _ in json.loads(args.bed_overlay.read_text())['changes']:
            fields['ground2'].flat[index] = height
    archive = np.load(args.targets)
    targets = {}
    for key in archive.files:
        value = archive[key]
        if value.dtype == np.bool_:
            targets[key] = value
    channel_coverage, mesh_manifest = None, None
    if args.channel_mesh:
        from .water_mesh_coverage import audit_mesh_archive
        union = np.logical_or.reduce(list(targets.values()))
        channel_coverage, mesh_manifest = audit_mesh_archive(args.channel_mesh, fields['ground2'], union, stage)
    report = audit_targets(fields, targets, stage, args.tile_size, channel_coverage)
    if mesh_manifest is not None:
        report['channelMeshEvidence'] = {
            'recordCount': len(mesh_manifest['recordIds']), 'inputSha256': mesh_manifest['inputSha256'],
            'scope': mesh_manifest['status'], 'completeProvinceGeometryVerified': False,
            'declaredGeometryScope': mesh_manifest.get('declaredGeometryScope', 'selected-records'),
            'note': 'Omitted records remain unverified; standing-field classifications are independent of channel overlap.'}
        if args.channel_result:
            np.savez_compressed(args.channel_result, schemaVersion=np.array(1),
                                scope='sampled-native-targets-not-final-rendered-coverage',
                                sampled=union, present=channel_coverage[0], stage_bits=channel_coverage[1],
                                stageRange=json.dumps(stage),
                                meshManifestSha256=hashlib.sha256((args.channel_mesh / 'manifest.json').read_bytes()).hexdigest())
            report['channelVertexEvidence'] = str(args.channel_result)
    report['capturedFieldStageRange'] = stage_range(compiled_stage)
    report['freshStageFieldsVerified'] = False
    report['inputs'] = {}
    for path in (args.fields, args.targets, args.ground, args.bed_overlay, args.field_stage_range,
                 args.channel_mesh / 'manifest.json' if args.channel_mesh else None):
        if path is not None:
            with path.open('rb') as handle:
                report['inputs'][str(path)] = hashlib.file_digest(handle, 'sha256').hexdigest()
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    # Full groups belong in the report; do not dump thousands of entries into
    # the agent context merely to confirm a successful province pass.
    print(json.dumps({**report, 'footprints': {
        name: {**{k: v for k, v in row.items() if k != 'problemGroups'},
               'problemGroupCount': len(row.get('problemGroups', []))}
        for name, row in report['footprints'].items()}}), flush=True)


if __name__ == '__main__':
    main()
