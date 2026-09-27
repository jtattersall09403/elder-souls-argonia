import { describe, expect, it } from "vitest";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KitCache } from "./kitCache";

describe("KitCache", () => {
  it("loads a kit once for every caller, and retries after a failure", async () => {
    const cache = new KitCache();
    const urls: string[] = [];
    const gltf = { scene: {} } as unknown as GLTF;
    const ok = (url: string) => { urls.push(url); return Promise.resolve(gltf); };
    const [a, b] = await Promise.all([cache.load("kit-a", "/k/a.glb", ok), cache.load("kit-a", "/k/a.glb", ok)]);
    expect(a).toBe(b);
    expect(urls).toEqual(["/k/a.glb"]);
    await expect(cache.load("kit-b", "/k/b.glb", () => Promise.reject(new Error("404")))).rejects.toThrow("404");
    await Promise.resolve();
    await cache.load("kit-b", "/k/b.glb", ok);
    expect(urls).toEqual(["/k/a.glb", "/k/b.glb"]);
  });
});
