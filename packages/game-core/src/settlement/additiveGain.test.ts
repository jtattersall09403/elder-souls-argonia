/**
 * An additive effect card's gain is its NIF shape's emissive multiple, carried
 * as the glTF material extra `gain` (build_kit apply_additive_gains, 16k walk 4
 * FIRE rec 2): fxfirewithembers01's flame cards 1.6, the campfire's Glow:2 2.5.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { describe, expect, it } from "vitest";
import {
  additiveGain,
  applySettlementAdditive,
  applySettlementSurface,
  createSettlementMaterialUniforms,
  flameOutputRgb,
  flameStrength,
  settlementSurfaceOf,
} from "./materials";
import { ALWAYS_LIT_DAY_FACTOR } from "./lighting";

const card = (gain: number) => {
  const m = new MeshStandardNodeMaterial();
  m.userData = { additive: true, gain };
  return m;
};

describe("additive card gain", () => {
  it("reads the material extra `gain`, else the pre-format-3 default", () => {
    expect(additiveGain(card(1.6))).toBe(1.6);
    expect(additiveGain(new THREE.MeshStandardMaterial())).toBe(1.5);
  });

  it("the card's output is its colour x its own gain x the lamp-clock strength, unlit", () => {
    expect(flameStrength("flame", 0)).toBe(ALWAYS_LIT_DAY_FACTOR);
    expect(flameStrength("flame", 1)).toBe(1);
    expect(flameStrength("lamp-flame", 0.25)).toBe(0.25);
    expect(flameOutputRgb("flame", [0.5, 0.25, 0.1], 1.6, 0)).toEqual([0.5 * 1.6 * 0.5, 0.25 * 1.6 * 0.5, 0.1 * 1.6 * 0.5]);
    expect(flameOutputRgb("lamp-flame", [1, 1, 1], 2.5, 1)).toEqual([2.5, 2.5, 2.5]);
    expect(flameOutputRgb(false, [1, 1, 1], 2.5, 1)).toBeNull();
    const m = card(1.6);
    applySettlementSurface(m, createSettlementMaterialUniforms(), "flame");
    expect(m.lights).toBe(false);
    expect(m.colorNode).toBeTruthy();
  });

  it("blends additively, writes no depth, keeps straight (not premultiplied) alpha", () => {
    const m = card(1.6);
    applySettlementAdditive(m);
    expect([m.blending, m.transparent, m.depthWrite, m.premultipliedAlpha])
      .toEqual([THREE.AdditiveBlending, true, false, false]);
  });

  /** The node graphs' structural cache keys (three hashes a graph's shape,
   * not its uniform values): equal keys build one program. */
  const graphKey = (m: THREE.Material) => {
    const slots = m as unknown as Record<string, { getCacheKey(force?: boolean): number } | null | undefined>;
    return ["colorNode", "opacityNode", "emissiveNode", "outputNode", "positionNode"]
      .map((k) => slots[k]?.getCacheKey(true) ?? "-").join("|");
  };

  it("two cards with different gains share one program; the gain is a uniform", () => {
    const a = card(1.6); const b = card(2.5);
    const shared = createSettlementMaterialUniforms();
    applySettlementSurface(a, shared, "flame");
    applySettlementSurface(b, shared, "flame");
    expect(graphKey(a)).toBe(graphKey(b));
    expect(settlementSurfaceOf(b)?.flameGain).toBe(2.5);
  });

  it("re-applying the same surface relinks nothing; a new glow kind re-wraps once, without stacking", () => {
    const m = card(1.6);
    const shared = createSettlementMaterialUniforms();
    applySettlementSurface(m, shared, "flame");
    const version = m.version;
    const colour = m.colorNode;
    const flameKey = graphKey(m);
    applySettlementSurface(m, shared, "flame");
    expect(m.version).toBe(version);
    expect(m.colorNode).toBe(colour);
    applySettlementSurface(m, shared, "lamp-flame");
    expect(m.version).toBe(version + 1);
    expect(graphKey(m)).not.toBe(flameKey);
    // back to "flame": the same graph shape as the first wrap (built from the base, not on top)
    applySettlementSurface(m, shared, "flame");
    expect(graphKey(m)).toBe(flameKey);
  });
});
