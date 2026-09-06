import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
import { ChannelRibbonSampler } from '../../../packages/game-core/src/water/channelRibbons';
import { PackedCrossSections } from '../../../packages/game-core/src/water/packedCrossSections';
import { NativeWaterGround } from '../../../packages/game-core/src/water/nativeWaterGround';
import { gunzipSync } from 'node:zlib';

// Explicit read-only geometry diagnostic, not part of normal workspace gates.
it.skipIf(!process.env.WATER_EDGE_CASES)('classifies compiled wet owner-boundary handoffs', () => {
  const directory = process.env.WATER_COMPILED_ASSETS!;
  const meta = JSON.parse(readFileSync(resolve(directory, 'water-meta.json'), 'utf8'));
  const binary = readFileSync(resolve(directory, meta.crossSections.file));
  new PackedCrossSections(meta.crossSections,
    binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), meta.ribbons);
  const groundBytes = process.env.WATER_NATIVE_GROUND
    ? gunzipSync(readFileSync(process.env.WATER_NATIVE_GROUND)) : undefined;
  const ground = groundBytes ? new NativeWaterGround(groundBytes.buffer.slice(
    groundBytes.byteOffset, groundBytes.byteOffset + groundBytes.byteLength)) : undefined;
  const sampler = new ChannelRibbonSampler(meta.ribbons, 32, ground);
  const cases = JSON.parse(readFileSync(process.env.WATER_EDGE_CASES!, 'utf8'));
  const counts: Record<string, number> = {};
  const failures: unknown[] = [];
  const wet = (sample: ReturnType<typeof sampler.sample>) => sample
    && sample.height - sample.groundHeight! > .004 && (sample.floodAccessOffsetM ?? -Infinity) <= 0;
  let maxJumpM = 0;
  for (const row of cases) {
    const inside = sampler.sample(row.inside[0], row.inside[1]);
    const outside = sampler.sample(row.outside[0], row.outside[1]);
    let kind: string;
    if (!wet(inside) || Math.abs(inside!.height - row.height) > .05) kind = 'not-visible-original-edge';
    else if (wet(outside) && Math.abs(outside!.height - inside!.height) <= .05) kind = 'native-continuous';
    else if (row.raster.wet && Math.abs(row.raster.height - inside!.height) <= .05) kind = 'standing-continuous';
    else {
      kind = wet(outside) || row.raster.wet ? 'wet-different-head' : 'open-wet-edge';
      const jump = wet(outside) ? Math.abs(outside!.height - inside!.height) : 0;
      maxJumpM = Math.max(maxJumpM, jump);
      failures.push({ ...row, kind, inside, outside, jump });
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  failures.sort((a: any, b: any) => b.jump - a.jump);
  const report = { cases: cases.length, counts, maxJumpM, failures };
  writeFileSync('/tmp/water-owner-edge-report.json', JSON.stringify(report));
  console.log(JSON.stringify({ cases: cases.length, counts, maxJumpM }));
  expect(cases.length).toBeGreaterThan(0);
}, 120000);
