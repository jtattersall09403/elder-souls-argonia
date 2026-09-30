import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ArchitectureAsset } from "../settlement/kit";
import { parseInteriorBundle } from "./bundle";
import { InteriorLoader } from "./interiorLoader";

// Walk 2 lane I: a piece the vault does not hold ships as a `substitutions[]`
// row naming a same-class stand-in in a published kit, with the reference's
// full transform. The runtime draws each one like a placement.
const KEEBA = new URL(
  "../../../../apps/world-studio/public/province/interiors/KeebaHouseFisher.json", import.meta.url);

function box(id: string): ArchitectureAsset {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  return { id, levels: [[{
    geometry, material: new THREE.MeshStandardMaterial(), localMatrix: new THREE.Matrix4(),
    triangles: geometry.index!.count / 3,
  }]] };
}

/** Every asset the bundle names, one box each, served from whichever kit asks. */
function loaderFor(raw: unknown) {
  const b = raw as { placements: { assetId: string }[]; substitutions?: { standInAsset: string }[] };
  const ids = [...b.placements.map((p) => p.assetId), ...(b.substitutions ?? []).map((s) => s.standInAsset)];
  const kitsLoaded: string[] = [];
  const loader = new InteriorLoader("/base/", {
    // a kit's parts index (kitParts.ts) lists every id and no fire; anything else is the bundle
    fetchJson: async (url) => {
      const kit = /kits\/(.+)\/parts\/index\.json$/.exec(url)?.[1];
      if (!kit) return structuredClone(raw);
      kitsLoaded.push(kit);
      return { schemaVersion: 2, kit, source: { bytes: 0, sha256: "" }, fires: {},
        assets: Object.fromEntries(ids.map((id) => [id, { file: "x.glb", bytes: 0, vertices: 0, triangles: 0, textures: [] }])) };
    },
    loadPart: async (_kit, assetId) => new Map([[assetId, box(assetId)] as const]),
  });
  return { loader, kitsLoaded };
}

const instanceMatrices = (group: THREE.Group) => group.children
  .filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh)
  .flatMap((mesh) => Array.from({ length: mesh.count }, (_, i) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    return m;
  }));

describe("interior substitutions (walk 2 lane I)", () => {
  const raw = JSON.parse(readFileSync(KEEBA, "utf8"));

  // The counts are read from the bundle: a stand-in leaves the list when its
  // real mesh ships (16k walk 3 moved one), so the invariant is the sum.
  it("KeebaHouseFisher draws its stand-ins: instances = placements + substitutions", async () => {
    const placed = raw.placements.length;
    const stand = raw.substitutions.length;
    expect(placed).toBeGreaterThan(0);
    expect(stand).toBeGreaterThan(0);
    const cell = await loaderFor(raw).loader.request("KeebaHouseFisher");
    expect(cell.counts.substitutions).toBe(stand);
    expect(instanceMatrices(cell.group).length).toBe(placed + stand);
  });

  it("places each stand-in with its full transform from the bundle", async () => {
    const cell = await loaderFor(raw).loader.request("KeebaHouseFisher");
    const drawn = instanceMatrices(cell.group).map((m) => new THREE.Vector3().setFromMatrixPosition(m));
    for (const s of raw.substitutions) {
      const at = new THREE.Vector3(...(s.positionM as [number, number, number]));
      expect(drawn.some((p) => p.distanceTo(at) < 1e-4), s.id).toBe(true);
    }
  });

  it("refuses a stand-in whose kit the bundle does not list or whose transform is malformed", () => {
    const badKit = structuredClone(raw);
    badKit.substitutions[0].kit = "nowhere";
    expect(() => parseInteriorBundle(badKit, "x")).toThrow(/substitution .*not in the bundle's kits/);
    const badPos = structuredClone(raw);
    badPos.substitutions[1].positionM = [0, 0];
    expect(() => parseInteriorBundle(badPos, "x")).toThrow(/substitution .*bad transform/);
  });
});
