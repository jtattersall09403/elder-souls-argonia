// Pre-existing reds (speed lane 2, S4, 2026-09-27). On 2026-09-27 one red
// (`test_mine_abuts::test_the_record_single_use_is_the_derived_set`) sat on
// HEAD for two hours and every lane that touched worldgen got it in its own
// preflight, re-ran and chased it (10 of 12 placement runs red after 15:09).
// So when a pytest gate fails, preflight runs the failing tests once more on
// a clean clone of HEAD (with this tree's gitignored artefacts linked in, so
// only the COMMITTED code and data differ) and records the result per HEAD
// sha in tooling/.reports/preflight/head-<sha>.json (gitignored). A red that
// is also red on HEAD is labelled PRE-EXISTING with the sha it was first seen
// red on and its owner, "the lane that changed <file>": the last commit to
// touch the test's target module (the module the test file is named for,
// else the test file). The gate still fails: a pre-existing red is named, not
// hidden. The pure parts are here (tested in preflight_heads.test.mjs); the
// HEAD run itself is in preflight.mjs.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname, basename } from "node:path";

// gate -> the folder its pytest run starts in (node ids are relative to it)
export const PYTEST_CWD = {
  placement: "tooling/world-generation",
  water: "tooling/world-generation",
  pipeline: "tooling/asset-pipeline",
  workbench: "tooling/placement-workbench",
};
export const MAX_CHECKED = 40;   // failing ids re-run on HEAD per gate; more are left unlabelled

/** The failing node ids in a pytest -q log ("FAILED a.py::t[x] - msg", "ERROR a.py::t"). */
export function failedIds(log) {
  const ids = [];
  for (const line of log.replace(/\x1b\[[0-9;]*m/g, "").split("\n")) {
    const m = /^(?:FAILED|ERROR) (\S+\.py::[^\s[]+(?:\[.*?\])?)(?: - .*)?$/.exec(line.trim());
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/**
 * Outcome per requested id from one pytest -q run on HEAD (one test file's
 * ids): failed or passed when pytest ran them (exit 0 or 1); nothing when it
 * could not (exit 4 for an id not on HEAD, 124 for the timeout, a collection
 * error), so those ids stay UNCHECKED and are tried again, never cached as
 * proven (review 2026-09-27: one bad id used to condemn the whole batch).
 */
export function headOutcomes(ids, log, code) {
  if (code !== 0 && code !== 1) return {};
  const failed = new Set(failedIds(log));
  return Object.fromEntries(ids.map((id) => [id, failed.has(id) ? "failed" : "passed"]));
}

/** ids grouped by test file, in first-seen order: one HEAD run per file. */
export function byFile(ids) {
  const groups = new Map();
  for (const id of ids) {
    const f = id.split("::")[0];
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push(id);
  }
  return [...groups.values()];
}

export function recordPath(dir, sha) { return join(dir, `head-${sha}.json`); }

export function readRecord(dir, sha) {
  try { return JSON.parse(readFileSync(recordPath(dir, sha), "utf8")); } catch { return { sha, created: Date.now(), gates: {} }; }
}

export function writeRecord(dir, record) {
  mkdirSync(dir, { recursive: true });
  const p = recordPath(dir, record.sha);
  writeFileSync(p + ".tmp", JSON.stringify(record, null, 1));
  renameSync(p + ".tmp", p);
}

/** The ids of a gate that the HEAD record has no outcome for yet. */
export function unchecked(record, gate, ids) {
  const known = record.gates[gate] ?? {};
  return ids.filter((id) => !(id in known)).slice(0, MAX_CHECKED);
}

/** The sha of the earliest record (by created) holding id red for gate, or null. */
export function firstSeen(dir, gate, id) {
  if (!existsSync(dir)) return null;
  let best = null;
  for (const f of readdirSync(dir)) {
    if (!/^head-[0-9a-f]+\.json$/.test(f)) continue;
    let r;
    try { r = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
    if (r.gates?.[gate]?.[id] === "failed" && (!best || r.created < best.created)) best = r;
  }
  return best?.sha ?? null;
}

/** The file a failing test is about: worldgen/test_foo.py -> worldgen/foo.py when it exists. */
export function testTarget(gate, id, repoRoot) {
  const rel = join(PYTEST_CWD[gate], id.split("::")[0]);
  const mod = join(dirname(rel), basename(rel).replace(/^test_/, ""));
  return mod !== rel && existsSync(join(repoRoot, mod)) ? mod : rel;
}

/**
 * Label each failing id: {id, label: "NEW" | "PRE-EXISTING" | "UNCHECKED", firstSeen, owner}.
 * owner(file) returns "<sha> <subject>" of the last commit that touched it.
 */
export function label(gate, ids, record, dir, repoRoot, owner) {
  return ids.map((id) => {
    const got = record.gates[gate]?.[id];
    if (got === "failed") {
      const target = testTarget(gate, id, repoRoot);
      return { id, label: "PRE-EXISTING", firstSeen: firstSeen(dir, gate, id) ?? record.sha,
        owner: `the lane that changed ${target} (${owner(target)})` };
    }
    // "absent": the test file is not on HEAD at all, so the red is this change's
    return { id, label: got === undefined ? "UNCHECKED" : "NEW" };
  });
}
