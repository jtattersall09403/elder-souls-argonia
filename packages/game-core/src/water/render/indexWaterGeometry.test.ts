import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { indexWaterGeometry, mergeWaterGeometry } from './indexWaterGeometry';
import { waterGeometryBytes } from './waterStreaming';

function plane() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1]), 3));
  geometry.setAttribute('waterFlowY', new BufferAttribute(new Float32Array(6).fill(-3.125), 1));
  geometry.setAttribute('waterBodyIndex', new BufferAttribute(new Uint16Array(6).fill(77), 1));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  return geometry;
}
describe('exact indexed water geometry', () => {
  it('halves repeated vertices without changing any submitted attribute or triangle', () => {
    const source = plane(), indexed = indexWaterGeometry(source);
    expect(indexed.getAttribute('position').count).toBe(4);
    expect(waterGeometryBytes(indexed)).toBeLessThan(waterGeometryBytes(source));
    for (const [name, attribute] of Object.entries(source.attributes)) for (let i = 0; i < 6; i++) {
      const actual = indexed.getAttribute(name), vertex = indexed.index!.getX(i);
      for (let c = 0; c < attribute.itemSize; c++) expect(actual.array[vertex * actual.itemSize + c]).toBe(attribute.array[i * attribute.itemSize + c]);
    }
    source.dispose(); indexed.dispose();
  });
  it('never merges a flow/body/normal seam, and concatenates record indices without averaging normals', () => {
    const source = plane(); source.getAttribute('waterBodyIndex').setX(3, 78);
    source.getAttribute('waterFlowY').setX(4, -3.124999);
    const indexed = indexWaterGeometry(source), combined = mergeWaterGeometry([indexed, indexed]);
    expect(indexed.getAttribute('position').count).toBe(6);
    expect(combined.getAttribute('position').count).toBe(12);
    expect(Array.from(combined.index!.array)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    source.dispose(); indexed.dispose(); combined.dispose();
  });
});
