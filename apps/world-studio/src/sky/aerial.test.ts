import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  aerialRasterLoaded,
  applyAerialPerspective,
  createAerialFogNode,
  createAerialUniforms,
  mipAlphaBoost,
} from "./aerial";

describe("aerial perspective as the scene fog node (decision 0107)", () => {
  it("builds one fog node over shared uniform nodes", () => {
    const u = createAerialUniforms();
    const fog = createAerialFogNode(u);
    expect(fog.isNode).toBe(true);
    // `.value` writes keep working for every CPU writer (WorldSky, water).
    u.uSunDirW.value.set(0, 0, 1);
    expect(u.uSunDirW.value.z).toBe(1);
  });

  it("rasters start as the zero placeholder and swap by value", () => {
    const u = createAerialUniforms();
    expect(aerialRasterLoaded(u, "uClimateAir")).toBe(false);
    u.uClimateAir.value = new THREE.Texture();
    expect(aerialRasterLoaded(u, "uClimateAir")).toBe(true);
    expect(aerialRasterLoaded(u, "uClimateVis")).toBe(false);
  });

  it("the deprecated call only joins the fog and boosts alpha-tested maps once", () => {
    const plain = new MeshStandardNodeMaterial();
    plain.fog = false;
    applyAerialPerspective(plain);
    expect(plain.fog).toBe(true);
    expect(plain.colorNode).toBeNull();

    const leaf = new MeshStandardNodeMaterial({ alphaTest: 0.5, map: new THREE.Texture() });
    applyAerialPerspective(leaf);
    const first = leaf.colorNode;
    expect(first).not.toBeNull();
    applyAerialPerspective(leaf);
    expect(leaf.colorNode).toBe(first);
  });

  it("mip-alpha boost: 1 at mip 0, capped at 2 from mip 4", () => {
    expect(mipAlphaBoost(0)).toBe(1);
    expect(mipAlphaBoost(2)).toBe(1.5);
    expect(mipAlphaBoost(9)).toBe(2);
  });
});
