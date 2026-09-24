import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseManifest, setBytes } from "./manifest";

const shipped = JSON.parse(readFileSync(new URL("../files/audio-manifest.json", import.meta.url), "utf8"));

describe("shipped audio manifest", () => {
  it("parses: every set's variants exist and agree on looping", () => {
    const m = parseManifest(shipped);
    expect(Object.keys(m.sets).length).toBeGreaterThan(0);
  });

  it("counts a shared asset once", () => {
    const m = parseManifest(shipped);
    // Axe and blade armour impacts share Skyrim's wpn_hit_blade files.
    const one = setBytes(m, ["combat.impact.blade.armor"]);
    expect(setBytes(m, ["combat.impact.blade.armor", "combat.impact.axe.armor"])).toBe(one);
  });

  it("rejects a variant that is not an asset", () => {
    const bad = structuredClone(shipped);
    bad.sets["combat.swing.blade"].variants.push("skyrim/fx/nope");
    expect(() => parseManifest(bad)).toThrow(/not an asset/);
  });
});
