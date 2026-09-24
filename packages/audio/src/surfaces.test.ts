import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { footstepSurface, GROUND_MATERIAL_SURFACE, PHYSICAL_MATERIAL_SURFACE, WADE_DEPTH_M } from "./surfaces";

/** Decision 0011's material library: every set shares one id -> name table. */
function groundMaterials(set: string): { id: number; name: string }[] {
  const url = new URL(`../../../apps/world-studio/public/textures/ground/${set}/materials.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")).materials;
}

describe("footstep material contract", () => {
  it("maps every ground material id, by the name the material library gives it", () => {
    for (const set of ["bmv-v1", "aendemika-v1"]) {
      const mats = groundMaterials(set);
      expect(mats.length).toBe(GROUND_MATERIAL_SURFACE.length);
      for (const m of mats) expect(GROUND_MATERIAL_SURFACE[m.id]?.[0], `id ${m.id}`).toBe(m.name);
    }
  });

  it("maps every module 75 §54 physical material", () => {
    expect(Object.keys(PHYSICAL_MATERIAL_SURFACE).sort()).toEqual(
      ["bark", "bone", "ceramic", "flesh", "foliage", "fungus", "glass", "metal", "mud", "peat", "soil", "stone", "water", "wood"],
    );
  });

  it("water depth wins over the ground; the swim switch is the movement mode's (0093)", () => {
    expect(footstepSurface({ groundMaterialId: 16 })).toBe("grass");
    expect(footstepSurface({ groundMaterialId: 16, waterDepthM: 0.03 })).toBe("puddle");
    expect(footstepSurface({ groundMaterialId: 16, waterDepthM: WADE_DEPTH_M })).toBe("water");
    expect(footstepSurface({ groundMaterialId: 16, waterDepthM: 1.02 })).toBe("water"); // still walking below 1.05 m
  });

  it("a collider's material wins over the terrain under it", () => {
    expect(footstepSurface({ physical: "wood", groundMaterialId: 4 })).toBe("wood");
    expect(footstepSurface({ groundMaterialId: 4 })).toBe("mud");
    expect(footstepSurface({})).toBe("dirt");
  });
});
