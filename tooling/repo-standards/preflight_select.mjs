// Which preflight gates a pathspec needs (owner ruling 2026-09-25: path-scoped
// preflight was running every gate over the whole tree, 5-9.5 min a run, and
// was the CPU load behind both codespace crashes). `npm run preflight --
// --paths <pathspec...>` runs only the gates whose inputs intersect the
// changed files under the pathspec; no --paths runs every gate (the
// once-before-merge full run). The inputs below are what each gate's suite
// reads, found by reading the suites (2026-09-25), and err wide: the Python
// suites read world data, kit configs and the studio's published files, so
// those count as their inputs too; since 2026-09-26 each suite has its own
// set (PY_INPUTS).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// A change here can change what EVERY gate does: run them all.
const GLOBAL = [
  "package.json", "package-lock.json", ".github/",
  "tooling/repo-standards/preflight.mjs", "tooling/repo-standards/preflight_select.mjs",
  "tooling/repo-standards/run-workspaces.mjs", "tooling/repo-standards/memwatch.sh",
  "tooling/repo-standards/jobs.mjs",
];
// The Python suites, each with its own inputs (tool-speed review S5a,
// 2026-09-26). Code folders stay wide (the suites import each other's
// modules); the DATA inputs are what each suite opened under strace on
// 2026-09-26 (strace openat over a whole run; the per-folder counts are in
// tooling/.reports/16k/speed-1.md), widened to the folder. A place change (a blueprint, the published
// place bundles under settlements/ or the legacy settlements.json, a placement record) therefore runs placement, pipeline
// and workbench, never water. A suite that starts reading a new folder must
// add it here (tooling/.reports/16k/speed-1.md has the method).
const PY_CODE = ["tooling/world-generation/", "tooling/asset-pipeline/"];
// what a place publish writes under public/province (water opened none of it)
const PLACE_ONLY_PROVINCE = /^apps\/world-studio\/public\/province\/(settlements\.json|settlements\/|blueprints\.json|interiors\/)/;
const WATER_PROVINCE = { test: (f) => (f.startsWith("apps/world-studio/public/province/")
  || "apps/world-studio/public/province/".startsWith(f.replace(/\/?$/, "/"))) && !PLACE_ONLY_PROVINCE.test(f) };
export const PY_INPUTS = {
  // the widest reader: every worldgen module but water's, over all world data
  placement: [...PY_CODE, "world/", "apps/world-studio/public/", "packages/text-catalogue/",
    "tooling/placement-workbench/"],
  // opened: world/sources/{hydrology,terrain,routes,regions}, public/province/{water,
  // refined, ladder, waterways*, routes*, route-structures}
  water: ["tooling/world-generation/", "world/sources/hydrology/", "world/sources/terrain/",
    "world/sources/routes/", "world/sources/regions/", WATER_PROVINCE],
  // opened: world/sources/{placement,blueprints,routes}, public/kits, public/province/
  // {settlements,ladder}.json; the trace stopped at 77 % (a Wine Blender test
  // hangs under strace), so every path the suite's modules name is added:
  // world/sources/assets (vault_inventory), game-core's generated weapon records
  // (test_weapon_records)
  pipeline: [...PY_CODE, "world/sources/placement/", "world/sources/blueprints/",
    "world/sources/routes/", "world/sources/assets/", "apps/world-studio/public/kits/",
    "apps/world-studio/public/province/", "packages/game-core/src/equipment/generated/"],
  // the placement workbench's own tests (tooling/placement-workbench/tests): it
  // bridges into worldgen and pipeline and reads placement records, blueprints,
  // yard sets, the published kits and game-core's physics constants
  workbench: [...PY_CODE, "tooling/placement-workbench/", "world/", "apps/world-studio/public/",
    "packages/game-core/src/physics/"],
};
// gate -> path prefixes (or a RegExp) it reads. npm-test is per workspace, below.
export const GATE_INPUTS = {
  typecheck: [/\.(ts|tsx|mts|cts)$/, /(^|\/)tsconfig[^/]*\.json$/, /^(apps|packages)\/[^/]+\/package\.json$/],
  ...PY_INPUTS,
  rasters: ["tooling/province-artefact/", "apps/world-studio/public/province/"],
  credits: ["README.md", "world/sources/assets/", "tooling/asset-pipeline/pipeline/config/kits/",
    "tooling/world-generation/worldgen/check_credits.py"],
  "site-refs": ["tooling/pages-site/", "tooling/repo-standards/check_site_refs.mjs",
    "apps/world-studio/public/", "apps/world-studio/src/", "apps/world-studio/index.html", "packages/"],
  "bundle-load": ["apps/world-studio/public/kits/", "apps/world-studio/public/province/settlements/",
    "apps/world-studio/public/province/interiors/", "packages/game-core/src/settlement/",
    "packages/game-core/src/interior/"],
  "python-deps": ["tooling/world-generation/requirements-test.txt",
    "tooling/world-generation/worldgen/check_requirements.py"],
};
// Extra inputs of a workspace's test beyond its own folder.
const WORKSPACE_EXTRA = {
  "packages/audio": ["tooling/audio-pipeline/"],
  "apps/world-studio": ["world/"],
};
// Always run when any path is given: the repo-wide standards (prose lint,
// singletons, stable IDs, docs checks) read the whole tree.
const ALWAYS_WORKSPACES = ["tooling/repo-standards"];
const WEAPONS_INPUTS = ["packages/game-core/", "tooling/asset-pipeline/"];

function hits(file, input) {
  if (input instanceof RegExp || typeof input.test === "function") return input.test(file);
  // a pathspec directory ("tooling/bootstrap") contains an input, or an input dir contains the file
  return file === input || file.startsWith(input) || input.startsWith(file.replace(/\/?$/, "/"));
}
const anyHit = (files, inputs) => files.some((f) => inputs.some((i) => hits(f, i)));

/** [{dir, name, deps: [dir]}] from the root manifest's workspaces. */
export function loadWorkspaces(repoRoot) {
  const root = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const dirs = root.workspaces.flatMap((p) => p.endsWith("/*")
    ? readdirSync(join(repoRoot, p.slice(0, -2)), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${p.slice(0, -2)}/${e.name}`)
    : [p]).filter((d) => existsSync(join(repoRoot, d, "package.json")));
  const pkgs = dirs.map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(repoRoot, dir, "package.json"), "utf8")) }));
  const byName = new Map(pkgs.map(({ dir, pkg }) => [pkg.name, dir]));
  return pkgs.map(({ dir, pkg }) => ({
    dir, name: pkg.name, test: Boolean(pkg.scripts?.test),
    deps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) => byName.has(n)).map((n) => byName.get(n)),
  }));
}

/**
 * files: repo-relative changed paths (or pathspecs). Returns
 * { all, gates: [name], skipped: [name], workspaces: [dir] | null, weapons }.
 * workspaces null = every workspace (a full npm test).
 */
export function selectGates(files, workspaces, gateNames) {
  if (files.length === 0 || anyHit(files, GLOBAL)) {
    return { all: true, gates: [...gateNames], skipped: [], workspaces: null, weapons: true };
  }
  // touched workspaces, then every workspace that depends on one (transitively)
  const touched = new Set(workspaces.filter((w) => anyHit(files, [`${w.dir}/`, ...(WORKSPACE_EXTRA[w.dir] ?? [])])).map((w) => w.dir));
  for (let grew = true; grew;) {
    grew = false;
    for (const w of workspaces) if (!touched.has(w.dir) && w.deps.some((d) => touched.has(d))) { touched.add(w.dir); grew = true; }
  }
  for (const d of ALWAYS_WORKSPACES) touched.add(d);
  const wsList = workspaces.filter((w) => w.test && touched.has(w.dir)).map((w) => w.dir);
  const weapons = anyHit(files, WEAPONS_INPUTS);
  const gates = gateNames.filter((g) => g === "npm-test" ? wsList.length > 0 || weapons : anyHit(files, GATE_INPUTS[g] ?? [/./]));
  return { all: false, gates, skipped: gateNames.filter((g) => !gates.includes(g)), workspaces: wsList, weapons };
}
