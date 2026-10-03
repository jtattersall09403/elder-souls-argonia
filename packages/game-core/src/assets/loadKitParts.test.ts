import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KitCache } from "../settlement/kitCache";
import { KIT_PARTS_SCHEMA_VERSION } from "./kitParts";
import { loadKitParts } from "./loadKitParts";

const index = {
  schemaVersion: KIT_PARTS_SCHEMA_VERSION, kit: "flora", source: { bytes: 1, sha256: "a" }, packed: { bytes: 1, sha256: "b" },
  fires: {},
  assets: {
    fern: { file: "fern.glb", bytes: 1, vertices: 1, triangles: 1, lods: [], textures: [] },
    palm: { file: "palm.glb", bytes: 1, vertices: 1, triangles: 1, lods: [], textures: [] },
  },
};

function harness() {
  const urls: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    urls.push(url);
    return url.endsWith("index.json")
      ? new Response(JSON.stringify(index))
      : new Response(new TextEncoder().encode(url).buffer as ArrayBuffer);
  });
  vi.stubGlobal("fetch", fetchFn);
  const loader = {
    parseAsync: async (bytes: ArrayBuffer): Promise<GLTF> => {
      const scene = new THREE.Group();
      const root = new THREE.Object3D();
      root.name = new TextDecoder().decode(bytes).replace(/^.*\/|\.glb$/g, "");
      scene.add(root);
      return { scene } as unknown as GLTF;
    },
  };
  return { urls, options: { baseUrl: "/", kitCache: new KitCache(), loader, fetchFn: fetchFn as unknown as typeof fetch } };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("loadKitParts", () => {
  it("loads the named parts into one group, the index once, never a whole kit GLB", async () => {
    const { urls, options } = harness();
    const first = await loadKitParts("flora", ["palm"], options);
    expect(first.scene.children.map((c) => c.name)).toEqual(["palm"]);
    const all = await loadKitParts("flora", "all", options);
    expect(all.scene.children.map((c) => c.name)).toEqual(["fern", "palm"]);
    expect(urls).toEqual(["/kits/flora/parts/index.json", "/kits/flora/parts/palm.glb", "/kits/flora/parts/fern.glb"]);
    expect(urls.some((u) => /kits\/[^/]+\.glb$/.test(u))).toBe(false);
  });

  it("names an asset the index lacks", async () => {
    const { options } = harness();
    await expect(loadKitParts("flora", ["oak"], options)).rejects.toThrow("asset oak has no published part");
  });
});
