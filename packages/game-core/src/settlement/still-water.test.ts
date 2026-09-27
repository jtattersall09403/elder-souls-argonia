/**
 * Still water held in a kit piece (a trough, a basin): the NIF water shader,
 * carried by build_kit as glTF material extras `{ "water": true }`.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applySettlementStillWater } from "./materials";

describe("settlement still-water materials", () => {
  it("gives a flagged material its still-water look", () => {
    const material = new THREE.MeshStandardMaterial();
    material.userData.water = true;
    expect(applySettlementStillWater(material)).toBe(true);
    expect(material.opacity).toBe(0.6);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it("leaves an unflagged material unchanged", () => {
    const material = new THREE.MeshStandardMaterial();
    const opacity = material.opacity;
    const transparent = material.transparent;
    const depthWrite = material.depthWrite;
    expect(applySettlementStillWater(material)).toBe(false);
    expect(material.opacity).toBe(opacity);
    expect(material.transparent).toBe(transparent);
    expect(material.depthWrite).toBe(depthWrite);
  });
});
