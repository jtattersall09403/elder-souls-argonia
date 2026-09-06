import { BufferAttribute, BufferGeometry } from 'three';
import { expect, it } from 'vitest';
import { inlandBatchBudget } from './inlandBatchBudget';

function geometry(vertices: number, enhanced = false, wideSourceIndices = false) {
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
  result.setAttribute('normal', new BufferAttribute(new Int8Array(vertices * 3), 3, true));
  result.setAttribute('waterOverride', new BufferAttribute(enhanced ? new Float32Array(vertices * 4) : new Int8Array(vertices * 4), 4));
  if (enhanced) {
    result.setAttribute('waterLevelResponse', new BufferAttribute(new Float32Array(vertices * 3), 3));
    result.setAttribute('waterGround', new BufferAttribute(new Float32Array(vertices), 1));
    result.setAttribute('waterBodyIndex', new BufferAttribute(new Uint16Array(vertices), 1));
  }
  result.setIndex(new BufferAttribute(wideSourceIndices ? new Uint32Array(6) : new Uint16Array(6), 1));
  return result;
}

it('accounts for mixed-batch promotion instead of doubling tile bytes', () => {
  const plain = geometry(20), enhanced = geometry(4, true);
  try {
    const result = inlandBatchBudget([plain, enhanced]);
    expect(result.sourceBytes).toBe(20 * 19 + 4 * 49 + 24);
    expect(result.mergedBytes).toBe(24 * 49 + 24);
    expect(result.totalBytes - result.sourceBytes * 2).toBe(20 * 30);
    expect(result.enhanced).toBe(true);
    expect(inlandBatchBudget([plain]).totalBytes).toBe(2 * (20 * 19 + 12));
    enhanced.setAttribute('waterCellSize', new BufferAttribute(new Float32Array(4), 1));
    const marine = inlandBatchBudget([plain, enhanced]);
    expect(marine.vertexBytes).toBe(53);
    expect(marine.totalBytes - result.totalBytes).toBe(4 * 4 + 24 * 4);
  } finally { plain.dispose(); enhanced.dispose(); }
});

it('chooses merged index width from combined vertex count, independently of source index storage', () => {
  const first = geometry(32768, false, true), second = geometry(32767), extra = geometry(1);
  try {
    const narrow = inlandBatchBudget([first, second]), wide = inlandBatchBudget([first, second, extra]);
    expect(narrow.vertices).toBe(65535); expect(narrow.indexBytes).toBe(2);
    expect(narrow.mergedBytes).toBe(65535 * 19 + 12 * 2);
    expect(narrow.sourceBytes).toBe(65535 * 19 + 6 * 4 + 6 * 2);
    expect(wide.vertices).toBe(65536); expect(wide.indexBytes).toBe(4);
    expect(wide.mergedBytes).toBe(65536 * 19 + 18 * 4);
    expect(inlandBatchBudget([]).totalBytes).toBe(0);
  } finally { first.dispose(); second.dispose(); extra.dispose(); }
});
