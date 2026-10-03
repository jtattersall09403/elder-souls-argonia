import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { isKitShared, makeSlotGeometry } from "./slotGeometry";

function source(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(
    new Float32Array([0, 0, 1, 0, 0, 1]), 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  geometry.addGroup(0, 3, 0);
  return geometry;
}

describe("makeSlotGeometry", () => {
  it("shares the source buffers by reference and owns only its own", () => {
    const kit = source();
    const owned = new THREE.InstancedBufferAttribute(new Float32Array(4), 1);
    const view = makeSlotGeometry(kit, { esSlot: owned });
    expect(view.attributes.position).toBe(kit.attributes.position);
    expect(view.attributes.uv).toBe(kit.attributes.uv);
    expect(view.index).toBe(kit.index);
    expect(view.attributes.esSlot).toBe(owned);
    expect(view.groups).toEqual(kit.groups);
  });

  it("takes bounds from the source rather than recomputing them", () => {
    const kit = source();
    const view = makeSlotGeometry(kit, {});
    expect(view.boundingSphere).not.toBeNull();
    expect(view.boundingSphere).not.toBe(kit.boundingSphere);
    expect(view.boundingSphere!.radius).toBeCloseTo(kit.boundingSphere!.radius);
    expect(view.boundingBox!.max.x).toBeCloseTo(kit.boundingBox!.max.x);
  });

  it("prefers the owned attribute over a source attribute of the same name", () => {
    const kit = source();
    const owned = new THREE.BufferAttribute(new Float32Array(6), 2);
    const view = makeSlotGeometry(kit, { uv: owned });
    expect(view.attributes.uv).toBe(owned);
  });
});

describe("kit-shared marks (webgpu10 diag19 D1)", () => {
  it("marks every source buffer a view shares, never the view's own", () => {
    const kit = source();
    const owned = new THREE.InstancedBufferAttribute(new Float32Array(4), 1);
    const view = makeSlotGeometry(kit, { esSlot: owned });
    expect(isKitShared(view.attributes.position)).toBe(true);
    expect(isKitShared(view.attributes.uv)).toBe(true);
    expect(isKitShared(view.index!)).toBe(true);
    expect(isKitShared(owned)).toBe(false);
  });
});
