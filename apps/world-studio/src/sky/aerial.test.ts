import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  aerialRasterLoaded,
  applyMipAlphaBoost,
  createAerialFogNode,
  createAerialUniforms,
  createMipAlphaShare,
  mipAlphaBoost,
  objectMapSize,
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

  it("mip-alpha boost: materials with different maps share one graph; the map size comes from the drawn object", () => {
    const share = createMipAlphaShare();
    const mapA = new THREE.Texture({ width: 512, height: 256 } as never);
    const mapB = new THREE.Texture({ width: 64, height: 64 } as never);
    const a = new MeshStandardNodeMaterial({ alphaTest: 0.5, map: mapA });
    const b = new MeshStandardNodeMaterial({ alphaTest: 0.5, map: mapB });
    applyMipAlphaBoost(a, share);
    applyMipAlphaBoost(b, share);
    expect(a.colorNode).not.toBeNull();
    expect(b.colorNode).toBe(a.colorNode);
    const into = new THREE.Vector2();
    // shadow pass: only the OBJECT knows its material
    expect(objectMapSize(new THREE.Mesh(undefined, a), into).toArray()).toEqual([512, 256]);
    expect(objectMapSize(new THREE.Mesh(undefined, b), into).toArray()).toEqual([64, 64]);
  });

  it("mip-alpha boost: 1 at mip 0, capped at 2 from mip 4", () => {
    expect(mipAlphaBoost(0)).toBe(1);
    expect(mipAlphaBoost(2)).toBe(1.5);
    expect(mipAlphaBoost(9)).toBe(2);
  });
});
