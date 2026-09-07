import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { compactNativeRibbonAttributes } from './nativeRibbonAttributes';
import { indexWaterGeometry, mergeWaterGeometry } from './indexWaterGeometry';
import { waterGeometryBytes } from './waterStreaming';

it('preserves every native hydraulic value through packing, indexing and merging, including absent responses', () => {
  const source = new BufferGeometry();
  source.setAttribute('position', new BufferAttribute(new Float32Array([1, 12.34567, 2, 2, 9.87654, 4, 3, 4.321, 6]), 3));
  const positions = source.getAttribute('position');
  source.setAttribute('waterOverride', new BufferAttribute(new Float32Array([
    positions.getY(0), .1234567, -8.765432, 1, positions.getY(1), -1.25, .000123, 1, positions.getY(2), 0, -3, 1,
  ]), 4));
  source.setAttribute('waterFlowY', new BufferAttribute(new Float32Array([-4.12345, -.25, 0]), 1));
  source.setAttribute('waterLevelResponse', new BufferAttribute(new Float32Array([.25, .7654321, 1, 0, 0, 0, .00123, 1.4321, 1]), 3));
  source.setAttribute('waterAccessOffset', new BufferAttribute(new Float32Array([-.00123, -1e6, 4.12345]), 1));
  source.setAttribute('waterBodyIndex', new BufferAttribute(new Uint16Array([60001, 60001, 60001]), 1));
  source.setIndex([0, 1, 2]); source.computeVertexNormals();
  const packed = source.clone(); compactNativeRibbonAttributes(packed);
  expect(waterGeometryBytes(source) - waterGeometryBytes(packed)).toBe(11 * positions.count);
  const indexed = indexWaterGeometry(packed), merged = mergeWaterGeometry([indexed, indexed]);
  for (let i = 0; i < merged.index!.count; i++) {
    const vertex = merged.index!.getX(i), original = source.index!.getX(i % 3);
    for (const name of ['position', 'normal', 'waterAccessOffset', 'waterBodyIndex']) {
      const a = source.getAttribute(name), b = merged.getAttribute(name);
      for (let c = 0; c < a.itemSize; c++) expect(b.array[vertex * b.itemSize + c]).toBe(a.array[original * a.itemSize + c]);
    }
    const flow = merged.getAttribute('waterRibbonFlow'), override = source.getAttribute('waterOverride');
    expect(flow.getX(vertex)).toBe(override.getY(original));
    expect(flow.getY(vertex)).toBe(source.getAttribute('waterFlowY').getX(original));
    expect(flow.getZ(vertex)).toBe(override.getZ(original));
    const response = source.getAttribute('waterLevelResponse'), levels = merged.getAttribute('waterRibbonResponse');
    expect(levels.getX(vertex)).toBe(response.getX(original));
    expect(levels.getY(vertex)).toBe(response.getY(original));
    expect(merged.getAttribute('waterRibbonResponseValid').getX(vertex)).toBe(response.getZ(original));
  }
  source.getAttribute('waterOverride').setW(0, 2);
  expect(() => compactNativeRibbonAttributes(source)).toThrow('exact head/mode');
  for (const geometry of [source, packed, indexed, merged]) geometry.dispose();
});
