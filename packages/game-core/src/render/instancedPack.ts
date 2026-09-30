/**
 * WebGPU binds at most 8 vertex buffers per draw (the default
 * `maxVertexBuffers`), and three counts one buffer per distinct
 * BufferAttribute / InterleavedBuffer a draw reads
 * (WebGPUAttributeUtils.createShaderVertexBuffers). An InstancedMesh's matrix
 * is one more (an InstancedInterleavedBuffer of stride 16, since
 * shareInstancedPrograms puts every InstancedMesh on the attribute path), and
 * instanceColor another. So per-instance data goes into ONE interleaved
 * buffer: `packInstancedAttributes` does that with the attribute names and
 * item sizes the shader already reads, and `vertexBufferCount` is the bound a
 * test checks every instanced factory against.
 */
import * as THREE from "three";

export const MAX_VERTEX_BUFFERS = 8;

type PackedAttr = readonly [name: string, data: Float32Array, itemSize: number];

/** Sets each named per-instance attribute on `geometry` as a view into one
 *  InstancedInterleavedBuffer (a single vertex buffer). Every array holds
 *  `count * itemSize` floats; the packed layout is the given order. */
export function packInstancedAttributes(
  geometry: THREE.BufferGeometry, attrs: ReadonlyArray<PackedAttr>, count: number,
): THREE.InstancedInterleavedBuffer {
  return packInto(geometry, attrs, count, true) as THREE.InstancedInterleavedBuffer;
}

/** The per-VERTEX twin: a geometry with many small custom attributes (the
 *  water strips carry eleven) binds them as one interleaved vertex buffer. */
export function packVertexAttributes(
  geometry: THREE.BufferGeometry, attrs: ReadonlyArray<PackedAttr>, count: number,
): THREE.InterleavedBuffer {
  return packInto(geometry, attrs, count, false);
}

function packInto(
  geometry: THREE.BufferGeometry, attrs: ReadonlyArray<PackedAttr>, count: number, instanced: boolean,
): THREE.InterleavedBuffer {
  const stride = attrs.reduce((s, [, , k]) => s + k, 0);
  const packed = new Float32Array(Math.max(count, 1) * stride);
  let offset = 0;
  for (const [name, data, k] of attrs) {
    if (data.length < count * k) throw new Error(`packAttributes: ${name} holds ${data.length} < ${count}x${k}`);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < k; c++) packed[i * stride + offset + c] = data[i * k + c];
    }
    offset += k;
  }
  const buffer = instanced
    ? new THREE.InstancedInterleavedBuffer(packed, stride, 1)
    : new THREE.InterleavedBuffer(packed, stride);
  offset = 0;
  for (const [name, , k] of attrs) {
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, k, offset));
    offset += k;
  }
  return buffer;
}

/** Upper bound on the vertex buffers a draw of `object` binds on WebGPU:
 *  distinct buffers across the geometry's attributes (all of them, whether or
 *  not the shader reads them), +1 for an InstancedMesh's matrix, +1 for its
 *  instanceColor. */
export function vertexBufferCount(object: THREE.Mesh | THREE.InstancedMesh): number {
  const buffers = new Set<unknown>();
  for (const a of Object.values(object.geometry.attributes)) {
    buffers.add((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as THREE.InterleavedBufferAttribute).data : a);
  }
  let n = buffers.size;
  const inst = object as THREE.InstancedMesh;
  if (inst.isInstancedMesh) n += 1 + (inst.instanceColor ? 1 : 0);
  return n;
}
