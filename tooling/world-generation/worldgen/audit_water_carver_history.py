"""Replay original deterministic terrain generation, recording actual carve deltas."""
import argparse, hashlib, json, time
from pathlib import Path
import numpy as np
from scipy import ndimage
from worldgen import refine_province as refine, fluvial
from worldgen.compile_chunks import DEFAULT_HEIGHTS
from worldgen.condition import base_terrain
from worldgen.scale import RAW_M

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--heights', type=Path, default=DEFAULT_HEIGHTS)
    parser.add_argument('--lanes', type=Path, default=refine.REPO_ROOT / 'apps/world-studio/public/province/waterways-natural.json')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    start = time.monotonic()
    directory = args.heights.parent.parent
    h = refine.deterrace(base_terrain(directory / 'heightfield-f32.npy'))
    hydro = np.load(directory / 'hydrology-pass1.npz')
    up = lambda a: np.repeat(np.repeat(a, refine.STEP, 0), refine.STEP, 1)[:h.shape[0], :h.shape[1]]
    rivers = up(hydro['rivers'])
    regions = up(hydro['regions'])
    rng = np.random.default_rng(refine.SEED)
    records = {}
    summary = {}

    def capture(name, before, after):
        delta = np.maximum(0, before - after).astype(np.float32)
        records[name] = delta
        summary[name] = {'modifiedSamples': int(np.count_nonzero(delta)), 'atLeast5cmSamples': int(np.sum(delta >= 0.05)), 'maximumDepthM': float(delta.max())}
        print(json.dumps({'stage': name, **summary[name], 'seconds': round(time.monotonic() - start)}), flush=True)
    before = h.copy()
    h, channel_dist = refine.carve_channels(h, rivers)
    capture('initialChannels', before, h)
    h += refine.detail_noise(h.shape, regions, channel_dist, rng)
    del channel_dist
    before = h.copy()
    h = refine.impose_blackrose_lake(h, (0, 0), rivers, rng)
    capture('blackroseLakeFeeders', before, h)
    before = h.copy()
    h, _, _ = refine.resolve_portages(h, (0, 0), rng, lanes_path=args.lanes)
    capture('portages', before, h)
    hs = ndimage.gaussian_filter(h, 2.5)
    band = np.clip(1 - np.abs(h - 0.2) / 1.4, 0, 1)
    h = (h * (1 - 0.7 * band) + hs * (0.7 * band)).astype(np.float32)
    del hs, band
    records['prefluvialGround'] = h.copy()
    riv = rivers > 0
    accum = up(hydro['accum_km2'])
    salinity = up(hydro['salinity'])
    wet = ((up(hydro['wetlands']) > 0.5) | np.isin(regions, (6, 7, 8, 13))).astype(np.float32)
    area = np.where(riv, np.maximum(accum, 0.02), 0).astype(np.float32)
    hs = ndimage.gaussian_filter(h, 10)
    gy, gx = np.gradient(hs, RAW_M)
    steep = np.hypot(gy, gx) > fluvial.STEEP_SLOPE
    ambient = ndimage.gaussian_filter(h, 25)
    del hs, gy, gx
    records['ambient'] = ambient
    records['steep'] = steep
    rng = np.random.default_rng(refine.SEED ^ 139)
    before = h.copy()
    h = fluvial._carve_channels(h, riv, area, steep, ambient)
    capture('continuumChannels', before, h)
    before = h.copy()
    h = fluvial._rivulets(h, riv, accum, wet, ambient)
    capture('rivulets', before, h)
    h = fluvial._levees_and_floodplain(h, riv, area, steep)
    before = h.copy()
    h, _ = fluvial._oxbows(h, riv, area, steep, rng)
    capture('oxbows', before, h)
    before = h.copy()
    h = fluvial._wetland_compaction(h, wet, riv)
    capture('wetlandCompaction', before, h)
    before = h.copy()
    h = fluvial._deepen_wetland_pools(h, riv, wet)
    capture('wetlandPools', before, h)
    before = h.copy()
    h, _ = fluvial._delta(h, riv, area, salinity, rng)
    capture('deltas', before, h)
    before = h.copy()
    h, _ = fluvial._condition_bed(h, hydro['rivers'], hydro['flow_to'], hydro['filled'], refine.STEP)
    capture('bedConditioning', before, h)
    original = np.load(args.heights.parent / 'refined-height-ungraded-f32.npy')
    difference = np.abs(h - original)
    summary['reconstruction'] = {'exact': bool(np.array_equal(h, original)), 'differentSamples': int(np.count_nonzero(difference)), 'maximumDifferenceM': float(difference.max())}
    print(json.dumps(summary['reconstruction']), flush=True)
    if not np.array_equal(h, original):
        raise ValueError('Carver replay differs from saved ungraded terrain; footprints are not authoritative')
    records['routeGradingDelta'] = np.load(args.heights) - original
    records['ungradedSourceSha256'] = hashlib.sha256((args.heights.parent / 'refined-height-ungraded-f32.npy').read_bytes()).hexdigest()
    records['terrainSourceSha256'] = hashlib.sha256(args.heights.read_bytes()).hexdigest()
    np.savez_compressed(args.out.with_suffix('.npz'), **records)
    args.out.with_suffix('.json').write_text(json.dumps({'schemaVersion': 1, 'terrainSourceSha256': str(records['terrainSourceSha256']), 'ungradedSourceSha256': str(records['ungradedSourceSha256']), 'lanesSha256': hashlib.sha256(args.lanes.read_bytes()).hexdigest(), 'scope': 'Exact natural carve deltas plus subsequent route grading; not a bankfull target or peak coverage proof', 'stages': summary}, indent=2) + '\n')
if __name__ == '__main__':
    main()
