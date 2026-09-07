import { inlandBackingBytes, disposeInlandSource, type InlandBatchSource } from "./inlandBatchSource";
import { BufferAttribute, BufferGeometry } from 'three';
import { expect, it } from 'vitest';
import { inlandBatchGeometry } from './inlandBatchGeometry';
import { inlandBatchBudget } from './inlandBatchBudget';
import { waterGeometryBytes } from './waterStreaming';

function source() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Int8Array([0,127,0,0,127,0,0,127,0]), 3, true));
  geometry.setAttribute('waterOverride', new BufferAttribute(new Float32Array([4.0665388,0.25,2,0, 12,1,0.125,0, -0.25,2,3,0]), 4));
  geometry.setAttribute('waterLevelResponse', new BufferAttribute(new Float32Array([0.2,0.6666667,0, 0.3,1,1, 0.4,0.9,2]), 3));
  geometry.setAttribute('waterBodyIndex', new BufferAttribute(new Uint16Array([1,257,65535]), 1));
  geometry.setAttribute('waterGround', new BufferAttribute(new Float32Array([3.12345,11,-2]), 1));
  geometry.setIndex([0,2,1]);
  return geometry;
}
function merge(sources: InlandBatchSource[], compact: boolean) {
  const work = inlandBatchGeometry(sources, compact);
  let result = work.next(); while (!result.done) result = work.next(); return result.value;
}
it('preserves exact water fields and flags while saving ten displayed bytes per vertex', () => {
  const first = source(), second = source(), sources = [first, second];
  const plain = merge(sources, false), packed = merge(sources, true);
  try {
    expect(waterGeometryBytes(plain) - waterGeometryBytes(packed)).toBe(60);
    expect(packed.hasAttribute('normal')).toBe(false);
    expect(Array.from(packed.index!.array)).toEqual(Array.from(plain.index!.array));
    for (const name of ['position', 'waterBodyIndex', 'waterGround'])
      expect(Array.from(packed.getAttribute(name).array)).toEqual(Array.from(plain.getAttribute(name).array));
    for (let i = 0; i < 6; i++) {
      const override = plain.getAttribute('waterOverride'), levels = plain.getAttribute('waterLevelResponse');
      expect(packed.getAttribute('waterRasterOverride').getX(i)).toBe(override.getX(i));
      expect(packed.getAttribute('waterRasterOverride').getY(i)).toBe(override.getY(i));
      expect(packed.getAttribute('waterRasterOverride').getZ(i)).toBe(override.getZ(i));
      expect(packed.getAttribute('waterRasterResponse').getX(i)).toBe(levels.getX(i));
      expect(packed.getAttribute('waterRasterResponse').getY(i)).toBe(levels.getY(i));
      expect(packed.getAttribute('waterRasterExplicit').getX(i)).toBe(levels.getZ(i));
    }
    expect(inlandBatchBudget(sources, true).totalBytes).toBe(sources.reduce((n, g) => n + waterGeometryBytes(g), 0) + waterGeometryBytes(packed));
    expect(first.getAttribute('waterOverride').itemSize).toBe(4);
  } finally { for (const geometry of [...sources, plain, packed]) geometry.dispose(); }
});
it.each(['normal', 'waterOverride', 'waterLevelResponse'])('rejects incompatible %s instead of silently altering water', name => {
  const geometry = source();
  geometry.getAttribute(name).setComponent(0, name === 'normal' ? 0 : name === 'waterOverride' ? 3 : 2, 3);
  try { expect(() => merge([geometry], true)).toThrow('Native inland layout requires'); }
  finally { geometry.dispose(); }
});
it('promotes legacy tiles to the native material layout with zero response flags', () => {
  const geometry = source();
  geometry.deleteAttribute('waterLevelResponse');
  geometry.deleteAttribute('waterGround');
  geometry.deleteAttribute('waterBodyIndex');
  const packed = merge([geometry], true);
  try {
    expect(Array.from(packed.getAttribute('waterRasterExplicit').array)).toEqual([0,0,0]);
    expect(Array.from(packed.getAttribute('waterRasterResponse').array)).toEqual([0,0,0,0,0,0]);
    expect(inlandBatchBudget([geometry], true).mergedBytes).toBe(waterGeometryBytes(packed));
  } finally { geometry.dispose(); packed.dispose(); }
});

it('copies reordered shared tile spans and new tiles without changing fields or indices', () => {
  const first=source(), second=source(), fresh=source();
  second.getAttribute('position').setX(0, 19);
  fresh.getAttribute('waterOverride').setX(0, 23.75);
  const backing=merge([first,second],true);
  const original=Object.fromEntries(Object.entries(backing.attributes).map(([key,attribute])=>[key,Array.from(attribute.array)]));
  const firstSpan={geometry:backing,vertexStart:0,vertexCount:3,indexStart:0,indexCount:3};
  const secondSpan={geometry:backing,vertexStart:3,vertexCount:3,indexStart:3,indexCount:3};
  const actual=merge([secondSpan,firstSpan,fresh],true), expected=merge([second,first,fresh],true);
  try {
    for(const [name,attribute] of Object.entries(expected.attributes))
      expect(Array.from(actual.getAttribute(name).array),name).toEqual(Array.from(attribute.array));
    expect(Array.from(actual.index!.array)).toEqual(Array.from(expected.index!.array));
    expect(inlandBackingBytes([firstSpan,secondSpan],backing)).toBe(waterGeometryBytes(backing));
    // One surviving tile retains the complete allocation, even after GPU disposal.
    backing.dispose(); disposeInlandSource(firstSpan);
    expect(inlandBackingBytes([secondSpan])).toBe(waterGeometryBytes(backing));
    expect(Object.fromEntries(Object.entries(backing.attributes).map(([key,attribute])=>[key,Array.from(attribute.array)]))).toEqual(original);
    expect(() => merge([{...secondSpan,vertexCount:2}],true)).toThrow('index escapes');
  } finally { for(const geometry of [first,second,fresh,backing,actual,expected]) geometry.dispose(); }
});
it('reads hydraulic fields from the correct offset of an unpacked span', () => {
  const first=source(), second=source();
  second.getAttribute('waterOverride').setX(0,23.125);
  second.getAttribute('waterLevelResponse').setXY(0,.125,.875);
  const backing=merge([first,second],false);
  const copied=merge([{geometry:backing,vertexStart:3,vertexCount:3,indexStart:3,indexCount:3}],true);
  const expected=merge([second],true);
  try {
    for(const [name,attribute] of Object.entries(expected.attributes))
      expect(Array.from(copied.getAttribute(name).array),name).toEqual(Array.from(attribute.array));
    expect(Array.from(copied.index!.array)).toEqual(Array.from(expected.index!.array));
  } finally {for(const geometry of [first,second,backing,copied,expected])geometry.dispose();}
});
