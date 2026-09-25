// Which preflight gates a pathspec needs (owner ruling 2026-09-25: path-scoped
// preflight was running every gate over the whole tree, 5-9.5 min a run, and
// was the CPU load behind both codespace crashes). `npm run preflight --
// --paths <pathspec...>` runs only the gates whose inputs intersect the
// changed files under the pathspec; no --paths runs every gate (the
// once-before-merge full run). The inputs below are what each gate's suite
// reads, found by reading the suites (2026-09-25), and err wide: the Python
// suites read world data, kit configs and the studio's published files, so
// those count as their inputs too.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// A change here can change what EVERY gate does: run them all.
const GLOBAL = [
  "package.json", "package-lock.json", ".github/",
  "tooling/repo-standards/preflight.mjs", "tooling/repo-standards/preflight_select.mjs",
  "tooling/repo-standards/run-workspaces.mjs", "tooling/repo-standards/memwatch.sh",
  "tooling/repo-standards/jobs.mjs",
];
// The three Python suites import each other's modules and read each other's
// data (placement imports pipeline.placement_metadata; the pipeline suite reads
// the published kits under apps/world-studio/public), so they share one input set.
const PY_SUITES = [
  "world/", "tooling/world-generation/", "tooling/asset-pipeline/",
  "apps/world-studio/public/", "packages/text-catalogue/",
];
// gate -> path prefixes (or a RegExp) it reads. npm-test is per workspace, below.
export const GATE_INPUTS = {
  typecheck: [/\.(ts|tsx|mts|cts)$/, /(^|\/)tsconfig[^/]*\.json$/, /^(apps|packages)\/[^/]+\/package\.json$/],
  placement: PY_SUITES,
  water: PY_SUITES,
  pipeline: PY_SUITES,
  rasters: ["tooling/province-artefact/", "apps/world-studio/public/province/"],
  credits: ["README.md", "world/sources/assets/", "tooling/asset-pipeline/pipeline/config/kits/",
    "tooling/world-generation/worldgen/check_credits.py"],
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
  if (input instanceof RegExp) return input.test(file);
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
