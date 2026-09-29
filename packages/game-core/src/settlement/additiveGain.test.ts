/**
 * An additive effect card's gain is its NIF shape's emissive multiple, carried
 * as the glTF material extra `gain` (build_kit apply_additive_gains, 16k walk 4
 * FIRE rec 2): fxfirewithembers01's flame cards 1.6, the campfire's Glow:2 2.5.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { additiveGain, applySettlementSurface, flameOutputLine } from "./materials";

const uniforms = () => ({ esSettlementRain: { value: 0 }, esSettlementNight: { value: 1 } });

describe("additive card gain", () => {
  it("reads the material extra `gain`, else the pre-format-3 default", () => {
    const card = new THREE.MeshStandardMaterial();
    card.userData = { additive: true, gain: 1.6 };
    expect(additiveGain(card)).toBe(1.6);
    expect(additiveGain(new THREE.MeshStandardMaterial())).toBe(1.5);
  });

  it("the card's output line multiplies by its own gain", () => {
    expect(flameOutputLine("flame", 2.5)).toContain("diffuseColor.rgb * 2.500 *");
    expect(flameOutputLine(false, 2.5)).toBe("");
  });

  it("two cards with different gains compile different programs", () => {
    const a = new THREE.MeshStandardMaterial(); a.userData = { additive: true, gain: 1.6 };
    const b = new THREE.MeshStandardMaterial(); b.userData = { additive: true, gain: 2.5 };
    applySettlementSurface(a, uniforms(), "flame");
    applySettlementSurface(b, uniforms(), "flame");
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });
});
