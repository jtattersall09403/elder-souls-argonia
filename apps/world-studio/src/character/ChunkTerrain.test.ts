import { describe, expect, it } from "vitest";
import * as THREE from "three";

// ChunkTerrain's import graph reads `window` at module load (node environment).
(globalThis as { window?: unknown }).window ??= globalThis;
(globalThis as { location?: unknown }).location ??= { search: "", href: "http://localhost/" };
const { createTerrainLinkGate } = await import("./ChunkTerrain");

describe("createTerrainLinkGate", () => {
  it("links the first tile of a material, patched, and hides only that material's tiles", async () => {
    const material = new THREE.MeshStandardMaterial();
    const linked = new THREE.MeshStandardMaterial();
    const keysAtLink: string[] = [];
    const resolves: (() => void)[] = [];
    const gate = createTerrainLinkGate((object) => {
      // the fake linker runs the lit patch (fixture lights) and reads the key it links
      const m = (object as THREE.Mesh).material as THREE.Material;
      m.userData.linkKey = "patched";
      keysAtLink.push(m.userData.linkKey as string);
      return new Promise<void>((r) => { resolves.push(r); });
    });
    // a tile of an already linked material shows at once
    const other = new THREE.Mesh(new THREE.BufferGeometry(), linked);
    gate.onMesh(other);
    resolves[0]();
    await Promise.resolve(); await Promise.resolve();
    expect(gate.held).toBe(false);
    let shown = 0;
    const a = new THREE.Mesh(new THREE.BufferGeometry(), material);
    const b = new THREE.Mesh(new THREE.BufferGeometry(), material);
    gate.onMesh(a, () => { shown++; });
    gate.onMesh(b, () => { shown++; });
    const c = new THREE.Mesh(new THREE.BufferGeometry(), linked);
    gate.onMesh(c, () => { shown++; });
    expect(keysAtLink).toEqual(["patched", "patched"]);
    expect([a.visible, b.visible, c.visible, other.visible]).toEqual([false, false, true, true]);
    expect(shown).toBe(1);
    expect(gate.held).toBe(true);
    resolves[1]();
    await Promise.resolve(); await Promise.resolve();
    expect([a.visible, b.visible]).toEqual([true, true]);
    expect(shown).toBe(3);
    expect(gate.held).toBe(false);
    expect(material.userData.linkKey).toBe("patched");
  });

  it("shows the held tile when a link fails", async () => {
    const gate = createTerrainLinkGate(() => Promise.reject(new Error("x")));
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    gate.onMesh(mesh);
    expect(mesh.visible).toBe(false);
    await Promise.resolve(); await Promise.resolve();
    expect(mesh.visible).toBe(true);
    expect(gate.held).toBe(false);
  });
});
