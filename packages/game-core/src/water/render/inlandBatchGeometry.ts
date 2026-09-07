import { inlandSourceRange, type InlandBatchSource } from './inlandBatchSource';
import * as THREE from 'three';

/** Copy into the final displayed layout incrementally. Source inputs remain
 * immutable, and compact native fields retain their original Float32 values. */
export function* inlandBatchGeometry(sources: InlandBatchSource[], compactNative = false): Generator<void, THREE.BufferGeometry> {
  const count = sources.reduce((sum, geometry) => sum + inlandSourceRange(geometry).vertexCount, 0);
  const indexCount = sources.reduce((sum, geometry) => sum + inlandSourceRange(geometry).indexCount, 0);
  const position = new Float32Array(count * 3); yield;
  const normal = compactNative ? undefined : new Int8Array(count * 3); yield;
  const enhanced = compactNative || sources.some(source => inlandSourceRange(source).geometry.hasAttribute('waterLevelResponse'));
  const overrideWidth = compactNative ? 3 : 4;
  const override = enhanced ? new Float32Array(count * overrideWidth) : new Int8Array(count * overrideWidth); yield;
  const levels = enhanced ? new Float32Array(count * (compactNative ? 2 : 3)) : undefined; yield;
  const explicit = compactNative ? new Uint8Array(count) : undefined; yield;
  const ground = enhanced ? new Float32Array(count) : undefined; yield;
  const owner = enhanced ? new Uint16Array(count) : undefined; yield;
  const footprint = sources.some(source => inlandSourceRange(source).geometry.hasAttribute('waterCellSize')) ? new Float32Array(count) : undefined; yield;
  const indices = count > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount); yield;
  let vertices = 0, cursor = 0;
  for (const inputSource of sources) {
    const { geometry: source, vertexStart, vertexCount, indexStart, indexCount: sourceIndexCount } = inlandSourceRange(inputSource);
    const packed = source.hasAttribute('waterRasterOverride');
    if (packed && !compactNative) throw new Error('Packed inland spans require the native inland merge layout');
    for (const [name, target, width] of [["position", position, 3], ["normal", normal, 3], ["waterOverride", override, 4]] as const) {
      if (!target || (compactNative && name === 'waterOverride')) continue;
      const values = source.getAttribute(name).array.subarray(vertexStart * width, (vertexStart + vertexCount) * width);
      for (let i = 0; i < values.length; i += 4096) {
        target.set(values.subarray(i, Math.min(values.length, i + 4096)), vertices * width + i); yield;
      }
    }
    if (compactNative && packed) {
      for (const [name, target, width] of [['waterRasterOverride', override, 3], ['waterRasterResponse', levels!, 2], ['waterRasterExplicit', explicit!, 1]] as const) {
        const values = source.getAttribute(name).array.subarray(vertexStart * width, (vertexStart + vertexCount) * width);
        for (let i = 0; i < values.length; i += 4096) {
          target.set(values.subarray(i, Math.min(values.length, i + 4096)), vertices * width + i); yield;
        }
      }
    } else if (compactNative) {
      const srcOverride = source.getAttribute('waterOverride'), srcNormal = source.getAttribute('normal');
      const srcLevels = source.getAttribute('waterLevelResponse');
      for (let i = 0; i < vertexCount; i++) {
        const flag = srcLevels?.getZ(vertexStart + i) ?? 0;
        if (srcOverride.getW(vertexStart + i) !== 0 || srcNormal.getX(vertexStart + i) !== 0 || srcNormal.getY(vertexStart + i) !== 1 || srcNormal.getZ(vertexStart + i) !== 0
          || (flag !== 0 && flag !== 1 && flag !== 2)) throw new Error('Native inland layout requires upright normals, raster mode and exact response flags');
        const output = vertices + i;
        override[output * 3] = srcOverride.getX(vertexStart + i);
        override[output * 3 + 1] = srcOverride.getY(vertexStart + i);
        override[output * 3 + 2] = srcOverride.getZ(vertexStart + i);
        if (levels) {
          levels[output * 2] = srcLevels?.getX(vertexStart + i) ?? 0;
          levels[output * 2 + 1] = srcLevels?.getY(vertexStart + i) ?? 0;
        }
        explicit![output] = flag;
        if ((i & 255) === 255) yield;
      }
    }
    for (const [name, target, width] of [['waterLevelResponse', levels, 3], ['waterGround', ground, 1], ['waterBodyIndex', owner, 1], ['waterCellSize', footprint, 1]] as const) {
      if (!target || !source.hasAttribute(name) || (compactNative && name === 'waterLevelResponse')) continue;
      const values = source.getAttribute(name).array.subarray(vertexStart * width, (vertexStart + vertexCount) * width);
      for (let i = 0; i < values.length; i += 4096) {
        target.set(values.subarray(i, Math.min(values.length, i + 4096)), vertices * width + i); yield;
      }
    }
    const input = source.index!.array;
    for (let i = 0; i < sourceIndexCount; i++) {
      const local = input[indexStart + i] - vertexStart;
      if (local < 0 || local >= vertexCount) throw new Error('Inland tile index escapes its source span');
      indices[cursor++] = local + vertices;
      if ((i & 1023) === 1023) yield;
    }
    vertices += vertexCount;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  if (normal) geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3, true));
  geometry.setAttribute(compactNative ? "waterRasterOverride" : "waterOverride", new THREE.BufferAttribute(override, overrideWidth));
  if (explicit) geometry.setAttribute("waterRasterExplicit", new THREE.BufferAttribute(explicit, 1));
  if (footprint) geometry.setAttribute('waterCellSize', new THREE.BufferAttribute(footprint, 1));
  if (levels && ground && owner) {
    geometry.setAttribute(compactNative ? 'waterRasterResponse' : 'waterLevelResponse', new THREE.BufferAttribute(levels, compactNative ? 2 : 3));
    geometry.setAttribute('waterGround', new THREE.BufferAttribute(ground, 1));
    geometry.setAttribute('waterBodyIndex', new THREE.BufferAttribute(owner, 1));
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}
