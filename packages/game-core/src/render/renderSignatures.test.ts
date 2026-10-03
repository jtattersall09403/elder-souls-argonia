import { describe, expect, it } from "vitest";
import { closeSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { glbJson, kitSignatures, missingSignatures, NON_SETTLEMENT_KITS, RENDER_SIGNATURES_SCHEMA_VERSION, type RenderSignatures } from "./renderSignatures";

const pub = resolve(__dirname, "../../../../apps/world-studio/public");
const head = (kit: string): Uint8Array => {
  const fd = openSync(join(pub, "kits", `${kit}.glb`), "r");
  try {
    const h = Buffer.alloc(20); readSync(fd, h, 0, 20, 0);
    const b = Buffer.alloc(20 + h.readUInt32LE(12)); readSync(fd, b, 0, b.length, 0);
    return new Uint8Array(b.buffer, b.byteOffset, b.length);
  } finally { closeSync(fd); }
};

describe("render signatures from kit GLB JSON chunks (webgpu10 c10)", () => {
  it("reads two real kits' headers into deduped signatures with three's attribute names", () => {
    for (const kit of ["camp-v1", "settlement-mud-v1"]) {
      const sigs = kitSignatures(glbJson(head(kit)), kit);
      expect(sigs.length).toBeGreaterThan(0);
      for (const s of sigs) {
        expect(s.kits).toEqual([kit]);
        expect(s.attributes.map((a) => a.name)).toContain("position");
        for (const a of s.attributes) expect(a.name).toBe(a.name.toLowerCase().replace(/^skin(weight|index)$/, (m) => m));
      }
      expect(new Set(sigs.map((s) => JSON.stringify([s.attributes, s.indexed, s.material]))).size).toBe(sigs.length);
    }
  });

  it("the baked render-signatures.json covers every published settlement-path kit (re-run the bake)", () => {
    const baked = JSON.parse(readFileSync(join(pub, "render-signatures.json"), "utf8")) as RenderSignatures;
    expect(baked.schemaVersion).toBe(RENDER_SIGNATURES_SCHEMA_VERSION);
    const kits = readdirSync(join(pub, "kits")).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4))
      .filter((k) => !NON_SETTLEMENT_KITS.includes(k));
    const missing = kits.flatMap((k) => missingSignatures(baked, kitSignatures(glbJson(head(k)), k)).map((s) => `${k}: ${s}`));
    expect(missing, "node packages/game-core/scripts/bake-render-signatures.mjs").toEqual([]);
  });
});
