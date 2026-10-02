import { describe, expect, it } from "vitest";
import * as THREE from "three";

// ChunkTerrain's import graph reads `window` at module load (node environment).
(globalThis as { window?: unknown }).window ??= globalThis;
(globalThis as { location?: unknown }).location ??= { search: "", href: "http://localhost/" };
const { createTerrainLinkGate } = await import("./ChunkTerrain");

describe("createTerrainLinkGate", () => {
  it("links the first tile of a material, patched, before the terrain shows", async () => {
    const material = new THREE.MeshStandardMaterial();
    let held = false;
    const keysAtLink: string[] = [];
    let resolve!: () => void;
    const gate = createTerrainLinkGate((object) => {
      // the fake linker runs the lit patch (fixture lights) and reads the key it links
      const m = (object as THREE.Mesh).material as THREE.Material;
      m.userData.linkKey = "patched";
      keysAtLink.push(m.userData.linkKey as string);
      return new Promise<void>((r) => { resolve = r; });
    }, (h) => { held = h; });
    gate.onMesh(new THREE.Mesh(new THREE.BufferGeometry(), material));
    gate.onMesh(new THREE.Mesh(new THREE.BufferGeometry(), material));
    expect(keysAtLink).toEqual(["patched"]);
    expect(held).toBe(true);
    expect(gate.held).toBe(true);
    resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(held).toBe(false);
    expect(material.userData.linkKey).toBe("patched");
  });

  it("releases the hold when a link fails", async () => {
    let held = false;
    const gate = createTerrainLinkGate(() => Promise.reject(new Error("x")), (h) => { held = h; });
    gate.onMesh(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
    expect(held).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(held).toBe(false);
  });
});
