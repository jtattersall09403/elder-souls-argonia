import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { missingSignatures, NON_SETTLEMENT_KITS, RENDER_SIGNATURES_SCHEMA_VERSION, type RenderSignature, type RenderSignatures } from "./renderSignatures";

// @ts-expect-error the bake is an .mjs script with no declarations
import { bakeSignatures, kitPartSignatures, publishedKits } from "../../scripts/bake-render-signatures.mjs";

const pub = resolve(__dirname, "../../../../apps/world-studio/public");
const kitsDir = join(pub, "kits");

describe("render signatures from kit parts (webgpu10 c11)", () => {
  it("reads two real kits' part headers into deduped signatures with three's attribute names", () => {
    for (const kit of ["camp-v1", "settlement-mud-v1"]) {
      const sigs = kitPartSignatures(kit, kitsDir) as RenderSignature[];
      expect(sigs.length).toBeGreaterThan(0);
      for (const s of sigs) {
        expect(s.kits).toEqual([kit]);
        expect(s.attributes.map((a) => a.name)).toContain("position");
      }
      expect(new Set(sigs.map((s) => JSON.stringify([s.attributes, s.indexed, s.material]))).size).toBe(sigs.length);
    }
  });

  it("the baked render-signatures.json is non-empty and covers every published settlement-path kit (re-run the bake)", () => {
    const baked = JSON.parse(readFileSync(join(pub, "render-signatures.json"), "utf8")) as RenderSignatures;
    expect(baked.schemaVersion).toBe(RENDER_SIGNATURES_SCHEMA_VERSION);
    expect(baked.signatures.length, "zero signatures: the boot precompile would do nothing").toBeGreaterThan(0);
    const kits = (publishedKits(kitsDir) as string[]).filter((k) => !NON_SETTLEMENT_KITS.includes(k));
    expect(kits.length).toBeGreaterThan(0);
    const missing = kits.flatMap((k) => missingSignatures(baked, kitPartSignatures(k, kitsDir)).map((s) => `${k}: ${s}`));
    expect(missing, "node packages/game-core/scripts/bake-render-signatures.mjs").toEqual([]);
    // every published kit with at least one drawing part appears in the baked kit lists
    const listed = new Set(baked.signatures.flatMap((s) => s.kits));
    const unlisted = kits.filter((k) => kitPartSignatures(k, kitsDir).length > 0 && !listed.has(k));
    expect(unlisted).toEqual([]);
    expect(bakeSignatures(kitsDir).baked.signatures.length).toBe(baked.signatures.length);
  });
});
