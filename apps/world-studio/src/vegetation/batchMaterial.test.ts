import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { createWindUniforms } from "@elder-souls/game-core/fx/windSway";
import { createLodFadeUniforms } from "@elder-souls/game-core/fx/lodFade";
import {
  batchUniformsOf, createBatchDataTexture, createBatchDataUniforms, setBatchTexture,
} from "@elder-souls/game-core/fx/batchData";
import { toNodeMaterial } from "@elder-souls/game-core/render/nodes/materialNodes";
import { cloneNodeMaterial, makeBatchMaterial } from "./batchMaterial";
import { patchGroundcoverPart } from "./groundcoverMaterials";

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
    batchUniforms: createBatchDataUniforms(), memo: new Map(), fromZero: false,
  });

  it("patches a clone, never the kit material", () => {
    const { map, twin } = kitMaterial();
    const o = opts();
    const owned = makeBatchMaterial(twin, o);
    expect(owned).not.toBe(twin);
    expect((owned as MeshStandardNodeMaterial).map).toBe(map);
    expect(owned.positionNode).toBeTruthy();
    expect(owned.maskNode).toBeTruthy();
    expect(batchUniformsOf(owned)).toBe(o.batchUniforms);
    expect(twin.positionNode).toBeFalsy();
    expect(twin.maskNode).toBeFalsy();
  });

  it("two clones of one source share their patched nodes (one shader build)", () => {
    const { twin } = kitMaterial();
    const o = opts();
    const a = makeBatchMaterial(twin, o);
    const b = makeBatchMaterial(twin, o);
    expect(a).not.toBe(b);
    expect(b.positionNode).toBe(a.positionNode);
    expect(b.maskNode).toBe(a.maskNode);
    expect(b.userData.esNode_wind).toBe(true);
    expect(b.userData.esNode_lodFade).toBe(true);
    // A second kit material with the same node slots shares them too.
    const other = makeBatchMaterial(kitMaterial().twin, o);
    expect(other.positionNode).toBe(a.positionNode);
    // A different signature does not.
    const casting = makeBatchMaterial(twin, { ...o, fromZero: true });
    expect(casting.positionNode).not.toBe(a.positionNode);
    expect(o.memo.size).toBe(2);
  });

  it("binds each drawn object's own batch texture, from the object (shadow pass too)", () => {
    const { twin } = kitMaterial();
    const o = opts();
    const a = makeBatchMaterial(twin, o);
    const b = makeBatchMaterial(twin, o);
    const ta = createBatchDataTexture(4);
    const tb = createBatchDataTexture(4);
    setBatchTexture(a, ta);
    setBatchTexture(b, tb);
    const meshA = new THREE.Mesh(new THREE.BufferGeometry(), a);
    const meshB = new THREE.Mesh(new THREE.BufferGeometry(), b);
    const select = o.batchUniforms.esBatchSelect as unknown as {
      update(frame: { object: THREE.Object3D; material: THREE.Material }): void;
    };
    // In the shadow pass the frame's material is the shadow material.
    const shadowMaterial = new THREE.MeshBasicMaterial();
    select.update({ object: meshA, material: shadowMaterial });
    expect(o.batchUniforms.esBatchData.value).toBe(ta);
    select.update({ object: meshB, material: shadowMaterial });
    expect(o.batchUniforms.esBatchData.value).toBe(tb);
  });

  it("the from-zero casting rung fills the shadow slots; noaerial turns fog off", () => {
    const { twin } = kitMaterial();
    const casting = makeBatchMaterial(twin, { ...opts(), fromZero: true });
    expect(casting.maskShadowNode).toBeTruthy();
    expect(casting.castShadowPositionNode).toBeTruthy();
    expect(casting.fog).toBe(true);
    const plain = makeBatchMaterial(twin, opts());
    expect(plain.maskShadowNode).toBeFalsy();
    expect(makeBatchMaterial(twin, { ...opts(), mode: "noaerial" }).fog).toBe(false);
    expect(makeBatchMaterial(twin, { ...opts(), mode: "off" }).positionNode).toBeFalsy();
  });
});

describe("patchGroundcoverPart", () => {
  it("kit materials of one signature share the patched nodes", () => {
    const memo = new Map();
    const o = { wind: createWindUniforms(), lodFade: createLodFadeUniforms(), memo };
    const a = kitMaterial().twin;
    const b = kitMaterial().twin;
    patchGroundcoverPart(a, { ...o, billboard: false });
    patchGroundcoverPart(b, { ...o, billboard: false });
    expect(b.positionNode).toBe(a.positionNode);
    const card = kitMaterial().twin;
    patchGroundcoverPart(card, { ...o, billboard: true });
    expect(card.positionNode).not.toBe(a.positionNode);
  });
});
