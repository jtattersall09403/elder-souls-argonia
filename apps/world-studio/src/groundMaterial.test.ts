import * as THREE from "three";
import { renderGroup } from "three/tsl";
import { describe, expect, it } from "vitest";
import { createGroundUniforms } from "./groundMaterial";

describe("createGroundUniforms", () => {
  // Terrain chunks are static draws (render/staticRefresh.ts): a value the app
  // writes after the first frame is read only from a shared buffer.
  it("puts the runtime-written scalars in the shared render group", () => {
    const u = createGroundUniforms(new THREE.Texture(), 1);
    for (const name of ["uVerticalScale", "uTintStrength", "uCanopyStrength"] as const) {
      expect([name, (u[name] as unknown as { groupNode?: unknown }).groupNode === renderGroup]).toEqual([name, true]);
    }
  });
});
