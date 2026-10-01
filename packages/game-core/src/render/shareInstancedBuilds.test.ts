import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createInstancedShareState, shareRenderObject } from "./shareInstancedBuilds";

/** A stand-in for three's RenderObject: the key reads object.uuid for instanced meshes (as 0.184
 *  does), and the attribute list is the shared build's (mesh A's instance buffers). */
function renderObject(object: THREE.Object3D, built: THREE.InstancedMesh) {
  const matrix = new THREE.InstancedInterleavedBuffer(built.instanceMatrix.array as Float32Array, 16, 1);
  const color = built.instanceColor ? new THREE.InstancedBufferAttribute(built.instanceColor.array as Float32Array, 3) : null;
  const position = (object as THREE.Mesh).geometry.getAttribute("position");
  return {
    object, attributes: null as unknown[] | null, vertexBuffers: null as unknown[] | null, initialCacheKey: null as unknown,
    getMaterialCacheKey(this: { object: THREE.Object3D }) {
      const o = this.object as THREE.InstancedMesh;
      return `mat,${o.isInstancedMesh || o.count > 1 ? o.uuid : ""}`;
    },
    getCacheKey() { return String(this.getMaterialCacheKey()) + "|dyn"; },
    getAttributes() {
      return [position, ...[0, 4, 8, 12].map((o) => new THREE.InterleavedBufferAttribute(matrix, 4, o)), ...(color ? [color] : [])];
    },
  };
}

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial();
function mesh(n: number, colour = false) {
  const m = new THREE.InstancedMesh(geometry, material, n);
  if (colour) m.setColorAt(0, new THREE.Color(1, 0, 0));
  return m;
}

describe("shareInstancedBuilds", () => {
  it("keys instanced meshes alike and gives each its own instance buffers", () => {
    const state = createInstancedShareState();
    const a = mesh(3, true), b = mesh(5, true);
    const roA = renderObject(a, a), roB = renderObject(b, a);
    expect(shareRenderObject(roA as never, state)).toBe(true);
    expect(shareRenderObject(roB as never, state)).toBe(true);
    expect(roA.initialCacheKey).toBe(roB.initialCacheKey);
    expect(String(roA.initialCacheKey)).not.toContain(a.uuid);
    const attrsB = roB.getAttributes() as THREE.InterleavedBufferAttribute[];
    expect(attrsB.slice(1, 5).every((x) => x.data.array === b.instanceMatrix.array)).toBe(true);
    expect((attrsB[5] as unknown as THREE.BufferAttribute).array).toBe(b.instanceColor!.array);
    // the substituted buffer follows the mesh's own version
    b.instanceMatrix.needsUpdate = true;
    expect(attrsB[1].data.version).toBe(b.instanceMatrix.version);
    // A keeps the build's own buffers
    const attrsA = roA.getAttributes() as THREE.InterleavedBufferAttribute[];
    expect(attrsA[1].data.array).toBe(a.instanceMatrix.array);
  });

  it("keys a mesh with colours apart from one without, and leaves morphs to three", () => {
    const state = createInstancedShareState();
    const plain = mesh(2), coloured = mesh(2, true);
    const r1 = renderObject(plain, plain), r2 = renderObject(coloured, coloured);
    shareRenderObject(r1 as never, state); shareRenderObject(r2 as never, state);
    expect(r1.initialCacheKey).not.toBe(r2.initialCacheKey);
    const morph = mesh(2); morph.morphTargetInfluences = [0];
    expect(shareRenderObject(renderObject(morph, morph) as never, state)).toBe(false);
  });
});

describe("shareInstancedBuilds, storage matrices", () => {
  it("shares a build between draws of one storage buffer and keeps pools apart", () => {
    const state = createInstancedShareState();
    // three/webgpu's StorageInstancedBufferAttribute, as far as the key reads it
    const pool = (n: number) => Object.assign(new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16), { isStorageInstancedBufferAttribute: true });
    const shared = pool(8), other = pool(8);
    const on = (m: THREE.InstancedMesh, b: THREE.BufferAttribute) => { m.instanceMatrix = b as THREE.InstancedBufferAttribute; return m; };
    const a = on(mesh(2), shared), b = on(mesh(3), shared), c = on(mesh(3), other);
    const [ra, rb, rc] = [a, b, c].map((m) => renderObject(m, a));
    for (const r of [ra, rb, rc]) shareRenderObject(r as never, state);
    expect(ra.initialCacheKey).toBe(rb.initialCacheKey);
    expect(rc.initialCacheKey).not.toBe(ra.initialCacheKey);
  });
});
