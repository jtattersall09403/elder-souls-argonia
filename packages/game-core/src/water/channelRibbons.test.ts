import { describe, expect, it } from 'vitest';
import { buildChannelRibbonMeshData, ChannelRibbonSampler, type ChannelRibbonRecord } from './channelRibbons';
import { WaterData, type WaterMeta } from './waterData';
import { WaterWorld } from './waterWorld';
import { NativeWaterGround, type NativeWaterVertex } from './nativeWaterGround';

function river(): ChannelRibbonRecord {
  return { id: 'water-ribbon.test.slope', bodyIndex: 17, riverBand: 2, points: [
    { x: 10, y: 8, z: 0, halfWidthM: 2 },
    { x: 10, y: 6, z: 10, halfWidthM: 2 },
    { x: 10, y: 4, z: 20, halfWidthM: 2 },
  ] };
}

describe('compiled channel ribbons', () => {
  it('uses the authored shared junction normal identically across separate incoming and outgoing records', () => {
    const section = [-2, 0, 2].map(offsetM => ({ offsetM, groundM: 0, accessOffsetM: -1 }));
    const joint = { x: 10, y: 2, z: 10, halfWidthM: 2, groundM: 0, crossSection: section,
      crossSectionNormalX: -Math.SQRT1_2, crossSectionNormalZ: Math.SQRT1_2 };
    const incoming: ChannelRibbonRecord = { id: 'incoming', bodyIndex: 1, riverBand: 1,
      points: [{ ...joint, y: 3, z: 0, crossSectionNormalX: -1, crossSectionNormalZ: 0 }, joint] };
    const outgoing: ChannelRibbonRecord = { id: 'outgoing', bodyIndex: 1, riverBand: 1,
      points: [{ ...joint }, { ...joint, x: 20, y: 1, crossSectionNormalX: 0, crossSectionNormalZ: 1 }] };
    const vertices = (record: ChannelRibbonRecord) => {
      const p = buildChannelRibbonMeshData([record]).positions, result = new Set<string>();
      for (let i = 0; i < p.length; i += 3) if (p[i + 1] === 2) result.add(`${p[i]},${p[i + 2]}`);
      return [...result].sort();
    };
    expect(vertices(incoming)).toEqual(vertices(outgoing));
    expect(vertices(incoming)).toEqual(section.map(s => `${Math.fround(10 - Math.SQRT1_2 * s.offsetM)},${Math.fround(10 + Math.SQRT1_2 * s.offsetM)}`).sort());
    for (const fields of [{ crossSectionNormalX: 2 }, { crossSectionNormalX: NaN }, { crossSectionNormalZ: undefined }]) {
      expect(() => buildChannelRibbonMeshData([{ ...incoming, points: [incoming.points[0], { ...joint, ...fields }] }])).toThrow('shared cross-section normal');
    }
  });

  it('drops only redundant ground-only breakpoints under exact terrain authority', () => {
    const record: ChannelRibbonRecord = { id: 'many-bed-samples', bodyIndex: 1, riverBand: 1,
      points: [0, 2].map(z => ({ x: 1, y: 2, z, halfWidthM: 1, groundM: -1,
        crossSection: Array.from({ length: 101 }, (_, i) => ({ offsetM: (i - 50) / 50,
          groundM: -1 - Math.sin(i) ** 2, accessOffsetM: Math.max(0, Math.abs((i - 50) / 50) - 0.5) })) })) };
    const ground = { refineTriangle: (a: NativeWaterVertex, b: NativeWaterVertex, c: NativeWaterVertex) => [{ a: { ...a, groundM: -1 }, b: { ...b, groundM: -1 }, c: { ...c, groundM: -1 } }] };
    const sampler = new ChannelRibbonSampler([record], 32, ground), mesh = sampler.meshDataFor([record]);
    expect(mesh.indices.length).toBe(24); // five retained samples per bank, eight triangles
    for (let x = 0.05; x < 2; x += 0.1) expect(sampler.sample(x, 1)?.floodAccessOffsetM).toBeCloseTo(Math.max(0, Math.abs(x - 1) - 0.5), 6);
    expect(record.points[0].crossSection).toHaveLength(101); // hydraulics retains the full original bed
  });

  it('uses injected maximum stage to cull provably dry faces but preserves their ownership domain', () => {
    const record: ChannelRibbonRecord = { id: 'dry-margin', bodyIndex: 1, riverBand: 1,
      points: [0, 2].map(z => ({ x: 1, y: 2, z, halfWidthM: 1, groundM: -1,
        crossSection: [-1, 0, 1].map(offsetM => ({ offsetM, groundM: -1, accessOffsetM: 3 })) })) };
    let calls = 0;
    const ground = { refineTriangle: (a: NativeWaterVertex, b: NativeWaterVertex, c: NativeWaterVertex) => { calls++; return [{ a, b, c }]; } };
    const bounded = new ChannelRibbonSampler([record], 32, ground, 1.9);
    expect(bounded.meshDataFor([record]).indices.length).toBe(0);
    expect(calls).toBe(0); // high access blocked before expensive native intersections
    expect(bounded.ownershipFootprintsInBounds(0, 0, 2, 2)).toHaveLength(2);
    expect(new ChannelRibbonSampler([record], 32, ground, 4).sample(1, 1)).not.toBeNull();
    expect(new ChannelRibbonSampler([record], 32, ground).sample(1, 1)).not.toBeNull(); // absence never assumes province amplitudes
  });

  it('shares native-crease refinement for bed queries and render attributes without expanding ownership envelopes', () => {
    const buffer = new ArrayBuffer(88), bytes = new Uint8Array(buffer), view = new DataView(buffer);
    bytes.set(new TextEncoder().encode('ESWGRND1'));
    for (const [offset, value] of [[8, 1], [12, 3], [16, 2], [20, 1], [40, 2]]) view.setUint32(offset, value, true);
    view.setFloat64(32, 1, true); view.setFloat32(52 + 4 * 4, 5, true);
    const ground = new NativeWaterGround(buffer);
    const record: ChannelRibbonRecord = { id: 'native-ridge', bodyIndex: 1, riverBand: 1,
      points: [0, 2].map(z => ({ x: 1, y: 2, z, halfWidthM: 1, groundM: 0 })) };
    const sampler = new ChannelRibbonSampler([record], 32, ground);
    expect(new ChannelRibbonSampler([record]).sample(1, 1)?.groundHeight).toBe(0);
    expect(sampler.sample(1, 1)?.groundHeight).toBe(5);
    expect(sampler.sample(1, 1)!.height - sampler.sample(1, 1)!.groundHeight!).toBe(-3);
    const mesh = sampler.meshDataFor([record]);
    expect(sampler.meshDataFor([record], { refineGround: false }).indices).toHaveLength(6);
    expect(mesh.indices.length).toBeGreaterThan(6);
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const x = (mesh.positions[i] + mesh.positions[i + 3] + mesh.positions[i + 6]) / 3;
      const z = (mesh.positions[i + 2] + mesh.positions[i + 5] + mesh.positions[i + 8]) / 3;
      const j = i / 3, bed = (mesh.groundHeights[j] + mesh.groundHeights[j + 1] + mesh.groundHeights[j + 2]) / 3;
      expect(sampler.sample(x, z)?.groundHeight).toBeCloseTo(bed, 6);
      expect(bed).toBeCloseTo(ground.sample(x, z)!, 6);
    }
    const builds = sampler.cacheStats.builds;
    expect(sampler.ownershipFootprintsInBounds(0, 0, 2, 2)).toHaveLength(2);
    expect(sampler.cacheStats.builds).toBe(builds);
    expect(sampler.meshDataFor([{ ...record, points: record.points.map(p => ({ ...p })) }]).groundHeights).toEqual(mesh.groundHeights);
    const localBuilds = sampler.cacheStats.localBuilds;
    for (let i = 0; i < 120; i++) sampler.sample(1, 1);
    expect(sampler.cacheStats.localBuilds).toBe(localBuilds);
    expect(sampler.cacheStats.triangles).toBe(2); // original faces, not every native child
    expect(sampler.cacheStats.localEntries).toBeLessThanOrEqual(256);
    expect(sampler.cacheStats.localTriangles).toBeLessThanOrEqual(2048);
  });
  it('keeps falling curtains within their incident rays instead of lofting a broad plunge pool', () => {
    const point = (y: number, z: number, width: number) => ({ x: 0, y, z, halfWidthM: width / 2, groundM: y - 0.3,
      crossSection: [-width / 2, 0, width / 2].map(offsetM => ({ offsetM, groundM: y - 0.3, accessOffsetM: -0.3 })) });
    for (const [drop, run] of [[100, 1.8], [1.9, 1], [1, 0.5], [0.001, 0.0001]]) {
      const record: ChannelRibbonRecord = { id: 'fall', bodyIndex: 1, riverBand: 1,
        points: [point(drop, 0, 1), point(0, run, 24), point(0, run + 5, 24)] };
      const sampler = new ChannelRibbonSampler([record]), mesh = sampler.meshDataFor([record]);
      for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i + 1] > 1e-7) expect(Math.abs(mesh.positions[i])).toBeLessThanOrEqual(0.50001);
      expect(sampler.sample(4, run / 2)).toBeNull();
      expect(sampler.sample(0, run / 2)?.height).toBeCloseTo(drop / 2, 5);
      expect(sampler.sample(8, run + 2)?.height).toBe(0); // broad pool stays at the plunge plane
      for (const triangle of sampler.ownershipFootprintsInBounds(-20, -1, 20, run + 6)) {
        const z = (triangle.a.z + triangle.b.z + triangle.c.z) / 3;
        if (z < run - 1e-7) for (const p of [triangle.a, triangle.b, triangle.c]) expect(Math.abs(p.x)).toBeLessThanOrEqual(0.50001);
      }
    }
  });

  it('retains stage-gated widened incident lips and ordinary gradually widening sloped channels', () => {
    const points = [
      { x: 0, y: 10, z: 0, halfWidthM: 0.5, groundM: 9.7,
        crossSection: [{ offsetM: -3, groundM: 10.5, accessOffsetM: 0.5 }, { offsetM: 0, groundM: 9.7, accessOffsetM: -0.3 }, { offsetM: 3, groundM: 10.5, accessOffsetM: 0.5 }] },
      { x: 0, y: 0, z: 1, halfWidthM: 12, groundM: -0.3,
        crossSection: [-12, 0, 12].map(offsetM => ({ offsetM, groundM: -0.3, accessOffsetM: -0.3 })) },
    ];
    const sampler = new ChannelRibbonSampler([{ id: 'seasonal-fall', bodyIndex: 1, riverBand: 1, points }]);
    expect(sampler.sample(2.5, 0.05)).not.toBeNull(); // wet-season lip is not clipped to its base width
    expect(sampler.sample(2.5, 0.05)!.floodAccessOffsetM).toBeGreaterThan(0);
    expect(sampler.sample(2.5, 0.05)!.floodAccessOffsetM).toBeLessThan(1.4);
    expect(sampler.sample(4, 0.5)).toBeNull();
    const gentle = new ChannelRibbonSampler([{ id: 'gentle', bodyIndex: 2, riverBand: 2,
      points: [{ x: 0, y: 1, z: 0, halfWidthM: 1, groundM: 0 }, { x: 0, y: 0.9, z: 10, halfWidthM: 1.5, groundM: -0.1 }] }]);
    expect(gentle.sample(1.35, 9)?.height).toBeCloseTo(0.91);
    expect(gentle.sample(1.6, 9)).toBeNull();
  });

  it('keeps legacy native-bed ribbons wet in the dry season instead of defaulting access to zero', () => {
    const record = river();
    record.points = record.points.map(p => ({ ...p, groundM: p.y - 0.6 }));
    const mesh = buildChannelRibbonMeshData([record]);
    expect(Array.from(mesh.floodAccessOffsets).every(value => Math.abs(value + 0.6) < 1e-6)).toBe(true);
    const sample = new ChannelRibbonSampler([record]).sample(10, 5)!;
    const drySeasonOffset = -0.28;
    expect(sample.floodAccessOffsetM).toBeLessThan(drySeasonOffset);
    expect(sample.height + drySeasonOffset - sample.groundHeight!).toBeCloseTo(0.32, 5);
    expect(Array.from(mesh.levelResponses).every(value => value === 0)).toBe(true);
    expect(Array.from(buildChannelRibbonMeshData([river()]).floodAccessOffsets).every(value => Number.isFinite(value) && value < -1)).toBe(true);
  });

  it('interpolates actual native bed and selects the visible plane at overlapping junctions', () => {
    const low = river();
    low.points = low.points.map(p => ({ ...p, groundM: p.y - 0.4 }));
    const high = river();
    high.points = high.points.map(p => ({ ...p, y: p.y + 0.2, groundM: p.y - 0.3 }));
    for (const records of [[low, high], [high, low]]) {
      const water = new ChannelRibbonSampler(records).sample(10, 5);
      expect(water?.height).toBeCloseTo(7.2);
      expect(water?.groundHeight).toBeCloseTo(6.7);
      expect(Array.from(buildChannelRibbonMeshData(records).groundHeights).every(Number.isFinite)).toBe(true);
    }
  });
  it('descends continuously, stays level across its width and drives current downhill', () => {
    const sample = new ChannelRibbonSampler([river()]);
    for (let z = 0; z <= 20; z += 0.5) {
      for (const x of [8.1, 10, 11.9]) {
        const water = sample.sample(x, z);
        expect(water?.height).toBeCloseTo(8 - z * 0.2, 8);
        expect(water?.bodyIndex).toBe(17);
        expect(water?.flowX).toBe(0);
        expect(water?.flowZ).toBeGreaterThan(0);
        expect(water?.flowY).toBeCloseTo(-0.2 * water!.flowZ, 8);
        expect(water?.surfaceNormal.y).toBeCloseTo(1 / Math.hypot(1, 0.2), 8);
        expect(water?.surfaceNormal.z).toBeCloseTo(0.2 / Math.hypot(1, 0.2), 8);
      }
    }
  });

  it('has no water outside the actual banks or beyond the end caps', () => {
    const sample = new ChannelRibbonSampler([river()]);
    for (const [x, z] of [[7.9, 10], [12.1, 10], [10, -0.1], [10, 20.1], [1000, 1000]]) {
      expect(sample.sample(x, z)).toBeNull();
    }
  });

  it('reverses old graph direction when actual levels descend the other way', () => {
    const record = river();
    record.points = [...record.points].reverse();
    const water = new ChannelRibbonSampler([record]).sample(10, 5);
    expect(water?.height).toBeCloseTo(7);
    expect(water?.flowZ).toBeGreaterThan(0);
  });

  it('samples the same triangles emitted for the renderer at a bend', () => {
    const record = river();
    record.points = [...record.points.slice(0, 2), { x: 20, y: 4, z: 20, halfWidthM: 1 }];
    const mesh = buildChannelRibbonMeshData([record]);
    const sampler = new ChannelRibbonSampler([record], 4);
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const p = mesh.positions;
      const x = (p[i] + p[i + 3] + p[i + 6]) / 3;
      const y = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
      const z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      expect(sampler.sample(x, z)?.height).toBeCloseTo(y, 5);
      const windingY = (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i])
        - (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]);
      expect(windingY).toBeGreaterThan(0);
      const water = sampler.sample(x, z)!;
      const n = water.surfaceNormal;
      expect(n.x * (p[i + 3] - p[i]) + n.y * (p[i + 4] - p[i + 1]) + n.z * (p[i + 5] - p[i + 2])).toBeCloseTo(0, 5);
      expect(n.x * (p[i + 6] - p[i]) + n.y * (p[i + 7] - p[i + 1]) + n.z * (p[i + 8] - p[i + 2])).toBeCloseTo(0, 5);
      expect(n.x * water.flowX + n.y * water.flowY + n.z * water.flowZ).toBeCloseTo(0, 8);
      expect(Math.hypot(water.flowX, water.flowY, water.flowZ)).toBeLessThanOrEqual(3.000001);
    }
  });

  it('keeps nearby separated channels independent across bucket boundaries', () => {
    const second = river();
    second.id = 'water-ribbon.test.other';
    second.bodyIndex = 18;
    second.points = second.points.map(point => ({ ...point, x: point.x + 8, y: point.y + 30 }));
    const sampler = new ChannelRibbonSampler([river(), second], 4);
    expect(sampler.sample(10, 8)?.height).toBeCloseTo(6.4);
    expect(sampler.sample(18, 8)?.height).toBeCloseTo(36.4);
    expect(sampler.sample(14, 8)).toBeNull();
  });

  it('treats empty input as dry and preserves downstream advection through flat channel reaches', () => {
    expect(new ChannelRibbonSampler([]).sample(0, 0)).toBeNull();
    const record = river();
    record.points = record.points.map(point => ({ ...point, y: 4 }));
    const flat = new ChannelRibbonSampler([record]).sample(10, 10)!;
    expect(flat.flowZ).toBeCloseTo(0.35);
    expect(flat.flowY).toBeCloseTo(0);
    expect(new ChannelRibbonSampler([record]).sample(NaN, 1)).toBeNull();
  });

  it('shares exact Float32 planes on narrow sloping reaches far from the origin', () => {
    const record: ChannelRibbonRecord = { id: 'water-ribbon.test.far-narrow', bodyIndex: 19, riverBand: 1,
      points: [
        { x: 6893.123456, y: 83.998412, z: 6719.789123, halfWidthM: 0.011, groundM: 83.4 },
        { x: 6893.369172, y: 83.712936, z: 6720.211941, halfWidthM: 0.013, groundM: 83.1 },
        { x: 6893.534812, y: 83.421671, z: 6720.435712, halfWidthM: 0.010, groundM: 82.8 },
      ] };
    const sampler = new ChannelRibbonSampler([record]);
    const { positions: p } = buildChannelRibbonMeshData([record]);
    for (let i = 0; i < p.length; i += 9) {
      const x = (p[i] + p[i + 3] + p[i + 6]) / 3;
      const y = (p[i + 1] + p[i + 4] + p[i + 7]) / 3;
      const z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
      expect(sampler.sample(x, z)?.height).toBeCloseTo(y, 9);
    }
  });

  it('publishes the visible ribbon normal and downhill vertical current through the gameplay query', () => {
    const record = river();
    record.points = record.points.map(p => ({ ...p, groundM: p.y - 1 }));
    const meta: WaterMeta = {
      surface: { file: '', size: 2, metresPerPixel: 20, gridOriginM: 0, minM: 0, maxM: 20, buryM: 3 },
      flow: { file: '', size: 2, metresPerPixel: 20, flowMax: 3, shoreMaxM: 160 },
      klass: { file: '', size: 2, metresPerPixel: 20, classes: ['none', 'coast', 'estuary', 'river'] },
      ribbons: [record], bodies: [{ index: 17, id: 'water.test.slope' }],
    };
    const data = new WaterData(meta, new Float32Array(4).fill(7), new Float32Array(4).fill(1),
      new Uint8ClampedArray(16).fill(128), new Uint8ClampedArray(16), new Float32Array(4));
    const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0, waveTimeS: () => 0 });
    const result = world.sample({ x: 10, y: 6.5, z: 5 }, 0);
    const geometric = data.ribbons.sample(10, 5)!;
    expect(result.surfaceHeight).toBeCloseTo(7);
    for (const axis of ['x', 'y', 'z'] as const) expect(result.surfaceNormal[axis]).toBeCloseTo(geometric.surfaceNormal[axis], 8);
    expect(result.flowVelocity.y).toBeLessThan(0);
    expect(result.flowVelocity.y).toBeCloseTo(-0.2 * result.flowVelocity.z, 8);
    const pond = new WaterData({ ...meta, ribbons: [] }, new Float32Array(4).fill(7), new Float32Array(4).fill(1),
      new Uint8ClampedArray(16).fill(128), new Uint8ClampedArray(16), new Float32Array(4));
    const stillWorld = new WaterWorld(pond, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0 });
    expect(stillWorld.sample({ x: 10, y: 6.5, z: 5 }, 0).flowVelocity).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('native asymmetric channel cross-sections', () => {
  function channel(): ChannelRibbonRecord {
    return { id: 'water-ribbon.test.asymmetric', bodyIndex: 1, riverBand: 1, points: [0, 10].map(z => ({
      x: 10, y: 10, z, halfWidthM: 1, groundM: 9,
      crossSection: [
        { offsetM: -1, groundM: 9.9, accessOffsetM: -0.1 },
        { offsetM: 0, groundM: 9, accessOffsetM: -1 },
        { offsetM: 3, groundM: 10.5, accessOffsetM: 0.5 },
        { offsetM: 5, groundM: 9, accessOffsetM: 0.5 },
      ],
    })) };
  }
  it('keeps the wide bank and actual lateral bed, instead of reflecting the narrow bank', () => {
    const sampler = new ChannelRibbonSampler([channel()]);
    expect(sampler.sample(5.5, 5)).not.toBeNull();
    expect(sampler.sample(11.1, 5)).toBeNull();
    expect(sampler.sample(9, 5)?.groundHeight).toBeCloseTo(9.5);
    const behindSill = sampler.sample(5.5, 5)!;
    expect(behindSill.groundHeight).toBeLessThan(behindSill.height);
    expect(behindSill.floodAccessOffsetM).toBeCloseTo(0.5);
  });
  it('clips the permanent core to both local ground and upstream access at the supplied minimum stage', () => {
    const sampler = new ChannelRibbonSampler([channel()]);
    const area = (stage: number) => sampler.coreTrianglesInBounds(0, 0, 20, 20, stage).reduce((sum, { a, b, c }) =>
      sum + Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2, 0);
    expect(area(-1.01)).toBe(0);
    expect(area(-0.28)).toBeLessThan(area(0));
    expect(area(0)).toBeLessThan(30);
    expect(area(0.6)).toBeCloseTo(60);
    for (const t of sampler.coreTrianglesInBounds(0, 0, 20, 20, 0)) {
      for (const p of [t.a, t.b, t.c]) {
        expect(p.groundM! - p.y).toBeLessThanOrEqual(-0.003999);
        expect(p.accessOffsetM!).toBeLessThanOrEqual(1e-9);
      }
    }
  });
  it('zipper-triangulates unequal sections with exact CPU/GPU bed, access and current parity', () => {
    const record = channel();
    record.points = [record.points[0], { ...record.points[1], crossSection: [
      { offsetM: -2, groundM: 9.9, accessOffsetM: -0.1 },
      { offsetM: 0, groundM: 9, accessOffsetM: -1 },
      { offsetM: 1, groundM: 9.5, accessOffsetM: -0.5 },
      { offsetM: 2, groundM: 10, accessOffsetM: 0 },
      { offsetM: 4, groundM: 10.5, accessOffsetM: 0.5 },
    ] }];
    const sampler = new ChannelRibbonSampler([record]), mesh = buildChannelRibbonMeshData([record]);
    expect(mesh.positions.length / 9).toBe(7);
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const p = mesh.positions;
      const sample = sampler.sample((p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3)!;
      expect(sample.surfaceNormal.y).toBeGreaterThan(0);
      const j = i / 3;
      expect(sample.groundHeight).toBeCloseTo((mesh.groundHeights[j] + mesh.groundHeights[j + 1] + mesh.groundHeights[j + 2]) / 3, 7);
      expect(sample.floodAccessOffsetM).toBeCloseTo((mesh.floodAccessOffsets[j] + mesh.floodAccessOffsets[j + 1] + mesh.floodAccessOffsets[j + 2]) / 3, 7);
      expect(mesh.flowVelocities[i]).toBeCloseTo(sample.flowX, 6);
      expect(mesh.flowVelocities[i + 1]).toBeCloseTo(sample.flowY, 6);
      expect(mesh.flowVelocities[i + 2]).toBeCloseTo(sample.flowZ, 6);
    }
  });

  it('keeps lazy triangle caches bounded across a province sweep and reconstructs identical returning views', () => {
    const records = Array.from({ length: 300 }, (_, i) => ({ ...channel(), id: `water-ribbon.test.cache-${i}`,
      points: channel().points.map(p => ({ ...p, x: p.x + i * 100 })) }));
    const sampler = new ChannelRibbonSampler(records);
    expect(sampler.cacheStats.triangles).toBe(0);
    const first = sampler.sample(10, 5);
    const builds = sampler.cacheStats.builds;
    sampler.sample(10, 6);
    expect(sampler.cacheStats.builds).toBe(builds);
    for (let i = 1; i < records.length; i++) sampler.sample(10 + i * 100, 5);
    expect(sampler.cacheStats.records).toBeLessThanOrEqual(256);
    expect(sampler.cacheStats.triangles).toBeLessThanOrEqual(16384);
    const beforeReturn = sampler.cacheStats.builds;
    expect(sampler.sample(10, 5)).toEqual(first);
    expect(sampler.cacheStats.builds).toBe(beforeReturn + 1);
  });

  it('preserves incoming jet momentum when rendering a streamed subset of the channel graph', () => {
    const point = (z: number) => ({ x: 10, y: 20 - 4 * z, z, halfWidthM: 1, groundM: 19 - 4 * z,
      crossSection: [-1, 0, 1].map(offsetM => ({ offsetM, groundM: 19 - 4 * z, accessOffsetM: -1 })) });
    const records: ChannelRibbonRecord[] = [0, 1].map(i => ({ id: `water-ribbon.test.jet-${i}`,
      bodyIndex: 1, riverBand: 1, points: [point(i), point(i + 1)] }));
    const sampler = new ChannelRibbonSampler(records), sample = sampler.sample(10, 1.5)!;
    const speed = Math.hypot(sample.flowX, sample.flowY, sample.flowZ);
    const full = sampler.meshDataFor([records[1]]).flowVelocities;
    expect(Math.hypot(full[0], full[1], full[2])).toBeCloseTo(speed, 5);
    const isolated = buildChannelRibbonMeshData([records[1]]).flowVelocities;
    expect(speed - Math.hypot(isolated[0], isolated[1], isolated[2])).toBeGreaterThan(1);
    const simplified = { ...records[1], points: records[1].points.map(point => ({ ...point,
      crossSection: point.crossSection!.map(s => ({ ...s })) })) };
    const cloned = sampler.meshDataFor([simplified]).flowVelocities;
    expect(cloned).toEqual(full);
    expect(() => sampler.meshDataFor([{ ...simplified, points: simplified.points.map(p => ({ ...p, x: p.x + 0.01 })) }])).toThrow('moved a longitudinal station');
  });

  it('provides the exact outer ownership union without filling the detailed triangle cache', () => {
    const record = channel(), sampler = new ChannelRibbonSampler([record]);
    const footprints = sampler.ownershipFootprintsInBounds(0, 0, 20, 20);
    expect(footprints).toHaveLength(2);
    expect(sampler.cacheStats.triangles).toBe(0);
    const contains = (x: number, z: number) => footprints.some(({ a, b, c }) => {
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      return u >= -1e-8 && v >= -1e-8 && 1 - u - v >= -1e-8;
    });
    for (let x = 4; x <= 12; x += 0.25) for (let z = -1; z <= 11; z += 0.5) {
      expect(contains(x, z)).toBe(sampler.sample(x, z) !== null);
    }
  });
});


describe('flat landing fills', () => {
  it('fills only the upstream wedge without changing the adjoining reach or its current', () => {
    const section = [0, 1, 2].map(offsetM => ({ offsetM, groundM: 0, accessOffsetM: -1 }));
    const a = { x: 0, y: 1, z: 0, halfWidthM: 2, groundM: 0,
      crossSectionNormalX: -Math.SQRT1_2, crossSectionNormalZ: Math.SQRT1_2,
      crossSection: section, seasonResponse: 1, tideResponse: 0 };
    const cap: ChannelRibbonRecord = { id: 'landing', bodyIndex: 1, riverBand: 1, geometryRole: 'landing',
      points: [a, { ...a, crossSectionNormalX: -1, crossSectionNormalZ: 0 }] };
    const reach: ChannelRibbonRecord = { id: 'receiver', bodyIndex: 1, riverBand: 1,
      points: [a, { ...a, x: 2, z: 2 }] };
    const before = new ChannelRibbonSampler([reach]), after = new ChannelRibbonSampler([reach, cap]);
    expect(before.sample(-1, .2)).toBeNull();
    const fill = after.sample(-1, .2, { excludeFallingSheets: true });
    expect(fill?.height).toBe(1);
    expect(fill?.seasonResponse).toBe(1);
    expect(Math.hypot(fill!.flowX, fill!.flowY, fill!.flowZ)).toBe(0);
    expect(after.sample(.2, .5)).toEqual(before.sample(.2, .5));
    const mesh = buildChannelRibbonMeshData([cap]);
    expect(mesh.indices.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(mesh.positions[i + 1]).toBe(1);
      expect(mesh.positions[i] + mesh.positions[i + 2]).toBeLessThanOrEqual(1e-6);
    }
    expect(() => buildChannelRibbonMeshData([{ ...cap, points: [a, { ...cap.points[1], y: 2 }] }])).toThrow('flat landing');
  });
});
