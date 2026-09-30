import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyLanternShell, FIXTURE_LIGHT_RGB, isLanternShellMaterial, LANTERN_SHELL_GAIN, lanternShellEmissive } from "./fixtureGlow";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { applySettlementSurface, createSettlementMaterialUniforms } from "./materials";

const flagged = (flags: string) => {
  const m = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  m.userData.pyn_shader = { Shader_Flags_1: flags };
  return m;
};
const lantern = { light: { fixtureKind: "lantern" } };

describe("lantern shell", () => {
  it("is an OWN_EMIT material on a lantern piece only", () => {
    const own = flagged("SPECULAR | RECEIVE_SHADOWS | OWN_EMIT | ZBUFFER_TEST");
    expect(isLanternShellMaterial(own, lantern)).toBe(true);
    expect(isLanternShellMaterial(own, { light: { fixtureKind: "brazier" } })).toBe(false);
    expect(isLanternShellMaterial(own, undefined)).toBe(false);
    expect(isLanternShellMaterial(flagged("SPECULAR | CAST_SHADOWS"), lantern)).toBe(false);
    expect(isLanternShellMaterial(new THREE.MeshStandardMaterial(), lantern)).toBe(false);
  });

  it("glows the fixture colour x gain, modulated by its own diffuse", () => {
    const want = new THREE.Color().setRGB(FIXTURE_LIGHT_RGB[0] / 255, FIXTURE_LIGHT_RGB[1] / 255,
      FIXTURE_LIGHT_RGB[2] / 255, THREE.SRGBColorSpace).multiplyScalar(LANTERN_SHELL_GAIN);
    const m = flagged("OWN_EMIT");
    applyLanternShell(m);
    expect(m.emissive.r).toBeCloseTo(want.r, 6);
    expect(m.emissive.b).toBeCloseTo(want.b, 6);
    expect(m.emissive.r).toBeGreaterThan(m.emissive.g);
    expect(m.emissiveMap).toBe(m.map);
    expect(lanternShellEmissive(2).r).toBeCloseTo(want.r * 2 / LANTERN_SHELL_GAIN, 6);
  });

  it("glows on the lamp clock: the surface graph gives the shell its own emissive node", () => {
    const m = new MeshStandardNodeMaterial({ map: new THREE.Texture() });
    m.userData.pyn_shader = { Shader_Flags_1: "OWN_EMIT" };
    applySettlementSurface(m, createSettlementMaterialUniforms(), "lamp-shell");
    expect(m.emissiveMap).toBe(m.map);
    const shell = m.emissiveNode;
    expect(shell).toBeTruthy();
    applySettlementSurface(m, createSettlementMaterialUniforms(), false);
    expect(m.emissiveNode).not.toBe(shell);
  });
});
