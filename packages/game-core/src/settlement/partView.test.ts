import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { disposePartView, instancedPartView } from "./SettlementLayer";

describe("disposePartView", () => {
  it("leaves every shared attribute name present (three's WebGPU dispose reads them) and the kit intact", () => {
    const kit = new THREE.BufferGeometry();
    kit.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    kit.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    const view = instancedPartView(kit, [0, 1]);
    let seen: Array<THREE.BufferAttribute | undefined> = [];
    view.addEventListener("dispose", () => { seen = [view.getAttribute("position") as THREE.BufferAttribute]; });
    disposePartView(view);
    expect(seen[0]).toBeDefined();
    expect(seen[0]).not.toBe(kit.getAttribute("position"));
    expect(kit.getAttribute("position")).toBeDefined();
    expect(kit.index).not.toBeNull();
    expect(view.index).toBeNull();
  });
});
