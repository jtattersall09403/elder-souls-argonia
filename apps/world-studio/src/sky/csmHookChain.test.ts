import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The CSM hook-chain gate (16k walk 7). `CSM.setupMaterial` REPLACES a lit
 * material's `onBeforeCompile`, and WorldSky runs it on every lit material in
 * the scene, so every shader patch installed before it is lost unless
 * WorldSky.patchMaterial calls the patch's `reapply*` after it. The class has
 * shipped many times (trees never moved, round 5; doubled vegetation at every
 * ring; the path paint drawn as opaque blocky cobble, unhazed, walks 4 to 7).
 * The rule: a module that assigns `onBeforeCompile` either exports a
 * `reapply*` that WorldSky.patchMaterial calls, or is listed below with the
 * reason CSM never wipes it. Under a second; reads source text only.
 */

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const ROOTS = ["packages/game-core/src", "apps/world-studio/src"];

/** Installers WorldSky's CSM pass never wipes, with why. */
const NEVER_WIPED: Record<string, string> = {
  "apps/world-studio/src/sky/aerial.ts": "applied by WorldSky itself after CSM",
  "apps/world-studio/src/groundMaterial.ts": "the terrain runs csm.setupMaterial itself and chains it; csm.shaders has it, WorldSky skips it",
  "packages/game-core/src/water/render/waterMaterial.ts": "the water surface runs its own CSM setup; csm.shaders has it",
  "packages/game-core/src/water/render/WaterPipeline.tsx": "MeshBasicMaterial: WorldSky patches only standard and lambert materials",
  "packages/game-core/src/settlement/smokeColumn.ts": "MeshBasicMaterial: never CSM-patched",
  "packages/game-core/src/render/fixtureLights/fixtureLightField.ts": "installed by WorldSky after CSM (fixtureField.install)",
  "packages/game-core/src/water/render/groundWetness.ts": "chained onto the terrain material after its own CSM setup",
  "packages/game-core/src/water/render/causticReceiver.ts": "its caller applies it after CSM and aerial (FloatTestCrates)",
  // OPEN (lead-rendering walk 7, queued to the planner): the studio's CSM pass
  // wipes the skin tint hook on the character; needs a reapplyAppearance.
  "packages/game-core/src/actors/appearance.ts": "OPEN: skin tint wiped by CSM in the studio, queued",
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("every shader patch survives WorldSky's CSM pass", () => {
  const worldSky = readFileSync(join(repo, "apps/world-studio/src/sky/WorldSky.tsx"), "utf8");
  const patchBody = worldSky.slice(worldSky.indexOf("const patchMaterial ="), worldSky.indexOf("const patchObject ="));
  const installers = ROOTS.flatMap((root) => sources(join(repo, root)))
    .map((path) => ({ file: relative(repo, path).split("\\").join("/"), text: readFileSync(path, "utf8") }))
    .filter(({ text }) => /\.onBeforeCompile\s*=(?!=)/.test(text));

  it("finds the installers (the scan itself works)", () => {
    expect(installers.map((i) => i.file)).toContain("packages/game-core/src/settlement/groundPaintMaterial.ts");
    expect(patchBody).toContain("csm.setupMaterial(m)");
  });

  it("each installer is reapplied by WorldSky after CSM, or listed with the reason CSM never wipes it", () => {
    const unwired: string[] = [];
    for (const { file, text } of installers) {
      const reapplies = [...text.matchAll(/export function (reapply\w+)/g)].map((m) => m[1]);
      if (reapplies.length === 0) {
        if (!NEVER_WIPED[file]) unwired.push(`${file}: assigns onBeforeCompile, exports no reapply* and is not listed`);
        continue;
      }
      for (const name of reapplies) {
        if (!new RegExp(`\\b${name}\\(m\\)`).test(patchBody)) {
          unwired.push(`${file}: ${name} is not called in WorldSky.patchMaterial after csm.setupMaterial`);
        }
      }
    }
    expect(unwired).toEqual([]);
  });

  it("the allowlist names only files that still install a hook", () => {
    const files = new Set(installers.map((i) => i.file));
    expect(Object.keys(NEVER_WIPED).filter((f) => !files.has(f))).toEqual([]);
  });
});
