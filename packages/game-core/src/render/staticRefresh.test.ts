import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { skipStaticRefresh, staticRefreshOf } from "./staticRefresh";
import { fixtureLightFieldOf } from "./fixtureLights/fixtureLightField";

/** A renderer whose node manager answers like three 0.184 for a node material: always refresh. */
function fakeRenderer() {
  const frame = { renderId: 1 };
  const nodes = {
    needsRefresh: (_renderObject: unknown): boolean => true,
    getNodeFrameForRender: () => frame,
  };
  return { renderer: { _nodes: nodes }, nodes, frame };
}

function renderObject(scene: THREE.Scene, staticMark: boolean, shared: object[] = []) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  object.userData.esStatic = staticMark;
  object.updateMatrixWorld();
  const tex = new THREE.Texture();
  return {
    object, material: object.material, geometry: object.geometry, scene, tex,
    getBindings: () => [{ bindings: [{ isSampledTexture: true, texture: tex }, ...shared] }],
  };
}

describe("skipStaticRefresh", () => {
  it("a static draw refreshes once, then skips while nothing it reads changes", () => {
    const { renderer, nodes, frame } = fakeRenderer();
    const counts = skipStaticRefresh(renderer);
    const ro = renderObject(new THREE.Scene(), true);
    expect(nodes.needsRefresh(ro)).toBe(true);
    frame.renderId = 2;
    expect(nodes.needsRefresh(ro)).toBe(false);
    frame.renderId = 3;
    expect(nodes.needsRefresh(ro)).toBe(false);
    expect(counts).toEqual({ refreshes: 1, skips: 2 });
    expect(staticRefreshOf(renderer)).toBe(counts);
  });

  it("refreshes again when the world matrix, material version, light epoch, geometry or a texture changes", () => {
    const { renderer, nodes, frame } = fakeRenderer();
    const scene = new THREE.Scene();
    const ro = renderObject(scene, true);
    skipStaticRefresh(renderer);
    nodes.needsRefresh(ro);
    const changes: Array<() => void> = [
      () => { ro.object.position.x += 1; ro.object.updateMatrixWorld(); },
      () => { ro.material.needsUpdate = true; },
      () => { fixtureLightFieldOf(scene).epoch += 1; },
      () => { ro.geometry.attributes.position.needsUpdate = true; },
      () => { ro.tex.needsUpdate = true; },
      () => { (ro.geometry as unknown as { instanceCount: number }).instanceCount = 7; },
      () => { interleaved.needsUpdate = true; },
      () => { ro.geometry.setIndirect(indirect as never, 0); },
      () => { indirect.needsUpdate = true; },
      () => { ro.geometry.indirectOffset = 16; },
    ];
    const interleaved = new THREE.InterleavedBuffer(new Float32Array(8), 4);
    ro.geometry.setAttribute("esCard", new THREE.InterleavedBufferAttribute(interleaved, 4, 0));
    const indirect = new THREE.BufferAttribute(new Uint32Array(8), 1);
    frame.renderId += 1;
    nodes.needsRefresh(ro);
    for (const [i, change] of changes.entries()) {
      frame.renderId += 1;
      change();
      expect([i, nodes.needsRefresh(ro)]).toEqual([i, true]);
      frame.renderId += 1;
      expect(nodes.needsRefresh(ro)).toBe(false);
    }
  });

  it("a static draw refreshes when its shared uniform buffer is not yet written in this render call", () => {
    const { renderer, nodes, frame } = fakeRenderer();
    skipStaticRefresh(renderer);
    const sharedBinding = { isNodeUniformsGroup: true, groupNode: { shared: true } };
    const scene = new THREE.Scene();
    const a = renderObject(scene, true, [sharedBinding]);
    const b = renderObject(scene, true, [sharedBinding]);
    nodes.needsRefresh(a); nodes.needsRefresh(b);
    frame.renderId = 2;
    // only static draws in this call: the first refreshes (writes the camera), the second skips
    expect(nodes.needsRefresh(a)).toBe(true);
    expect(nodes.needsRefresh(b)).toBe(false);
  });

  it("a draw not marked static refreshes every frame", () => {
    const { renderer, nodes, frame } = fakeRenderer();
    skipStaticRefresh(renderer);
    const ro = renderObject(new THREE.Scene(), false);
    for (let i = 0; i < 3; i++) { frame.renderId += 1; expect(nodes.needsRefresh(ro)).toBe(true); }
  });
});
