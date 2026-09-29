import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { createWindUniforms } from "@elder-souls/game-core/fx/windSway";
import { createLodFadeUniforms } from "@elder-souls/game-core/fx/lodFade";
import { batchUniformsOf, createBatchDataUniforms } from "@elder-souls/game-core/fx/batchData";
import { toNodeMaterial } from "@elder-souls/game-core/render/nodes/materialNodes";
import { cloneNodeMaterial, makeBatchMaterial } from "./batchMaterial";

function kitMaterial() {
  const map = new THREE.Texture();
  const classic = new THREE.MeshStandardMaterial({
    map, color: 0x80a040, roughness: 0.7, alphaTest: 0.5, side: THREE.DoubleSide,
  });
  const twin = toNodeMaterial(classic) as MeshStandardNodeMaterial;
  // floraKit sets the cut-out on the twin (toNodeMaterial's own-key copy
  // skips the `alphaTest` accessor).
  twin.alphaTest = 0.5;
  return { map, twin };
}

describe("cloneNodeMaterial", () => {
  it("keeps the classic parameters NodeMaterial.clone drops", () => {
    const { map, twin } = kitMaterial();
    const clone = cloneNodeMaterial(twin);
    expect(clone).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(clone.map).toBe(map);
    expect(clone.color.getHex()).toBe(0x80a040);
    expect(clone.color).not.toBe(twin.color);
    expect(clone.roughness).toBe(0.7);
    expect(clone.alphaTest).toBe(0.5);
    expect(clone.side).toBe(THREE.DoubleSide);
  });
});

describe("makeBatchMaterial", () => {
  const opts = () => ({
    wind: createWindUniforms(), lodFade: createLodFadeUniforms(),
    batchUniforms: createBatchDataUniforms(), fromZero: false,
  });

  it("patches a clone, never the kit material", () => {
    const { map, twin } = kitMaterial();
    const owned = makeBatchMaterial(twin, opts());
    expect(owned.material).not.toBe(twin);
    expect((owned.material as MeshStandardNodeMaterial).map).toBe(map);
    expect(owned.material.positionNode).toBeTruthy();
    expect(owned.material.maskNode).toBeTruthy();
    expect(batchUniformsOf(owned.material)).toBe(owned.uniforms);
    expect(twin.positionNode).toBeFalsy();
    expect(twin.maskNode).toBeFalsy();
    // A second batch from the same kit material is patched too.
    expect(makeBatchMaterial(twin, opts()).material.positionNode).toBeTruthy();
  });

  it("shares the occlusion mask and window, not the data texture", () => {
    const { twin } = kitMaterial();
    const o = opts();
    const a = makeBatchMaterial(twin, o);
    const b = makeBatchMaterial(twin, o);
    expect(a.uniforms.esOccMask).toBe(o.batchUniforms.esOccMask);
    expect(a.uniforms.esOccParams).toBe(b.uniforms.esOccParams);
    expect(a.uniforms.esBatchData).not.toBe(b.uniforms.esBatchData);
  });

  it("the from-zero casting rung fills the shadow slots; noaerial turns fog off", () => {
    const { twin } = kitMaterial();
    const casting = makeBatchMaterial(twin, { ...opts(), fromZero: true });
    expect(casting.material.maskShadowNode).toBeTruthy();
    expect(casting.material.castShadowPositionNode).toBeTruthy();
    expect(casting.material.fog).toBe(true);
    const plain = makeBatchMaterial(twin, opts());
    expect(plain.material.maskShadowNode).toBeFalsy();
    expect(makeBatchMaterial(twin, { ...opts(), mode: "noaerial" }).material.fog).toBe(false);
    expect(makeBatchMaterial(twin, { ...opts(), mode: "off" }).material.positionNode).toBeFalsy();
  });
});
