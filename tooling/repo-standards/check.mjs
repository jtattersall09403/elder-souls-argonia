#!/usr/bin/env node
/**
 * Mechanical enforcement of the repo's engineering standards
 * (docs/engineering-standards.md, decision 0042 §8).
 *
 * A rule without a check rots — these are the standards cheap enough to
 * machine-check today. Each check prints the standard it enforces, the
 * offending file and line, and what to do instead.
 *
 * Run: npm test -w @elder-souls/repo-standards   (or `npm test` from the root)
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..", "..");

const failures = [];
const notes = [];

const fail = (standard, file, line, message) =>
  failures.push({ standard, file, line, message });
const note = (message) => notes.push(message);

const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

/** Every file under `dir` matching one of `exts`, skipping the usual noise. */
function walk(dir, exts, out = []) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === ".git" ||
      entry === "__pycache__"
    )
      continue;
    const rel = join(dir, entry);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(rel);
  }
  return out;
}

const lines = (file) => readFileSync(join(ROOT, file), "utf8").split("\n");
const posix = (p) => p.split(sep).join("/");

// ---------------------------------------------------------------------------
// Standard 6 — determinism in world building
// ---------------------------------------------------------------------------
// No wall-clock time and no unseeded randomness in the code that generates,
// compiles or places world data. Reproducibility is the basis of every probe
// result, placement audit and owner playtest we have.

function checkDeterminism() {
  const { allowed, scopes } = readJson("tooling/repo-standards/allowlist-determinism.json");
  const allowSet = new Set(allowed.map((a) => `${a.file}:${a.line ?? "*"}`));
  const isAllowed = (file, lineNo) =>
    allowSet.has(`${file}:${lineNo}`) || allowSet.has(`${file}:*`);

  const patterns = [
    { re: /\bMath\.random\s*\(/, what: "Math.random()" },
    { re: /\bDate\.now\s*\(/, what: "Date.now()" },
    { re: /\bnew Date\s*\(\s*\)/, what: "new Date()" },
    { re: /\bdatetime\.now\s*\(/, what: "datetime.now()" },
    { re: /\btime\.time\s*\(/, what: "time.time()" },
    { re: /(?<![.\w])random\.(random|choice|randint|uniform|shuffle|sample)\s*\(/, what: "unseeded random.*()" },
    { re: /np\.random\.(rand|randint|choice|normal|uniform|seed)\s*\(/, what: "np.random.* (module-level RNG)" },
  ];

  for (const scope of scopes) {
    for (const file of walk(scope.dir, scope.exts)) {
      const rel = posix(file);
      const src = lines(file);
      for (let i = 0; i < src.length; i++) {
        const text = src[i];
        // Comments and docstrings talk about these on purpose.
        const stripped = text.replace(/(\/\/|#).*$/, "");
        if (/^\s*\*/.test(text)) continue;
        for (const { re, what } of patterns) {
          if (!re.test(stripped)) continue;
          if (isAllowed(rel, i + 1)) continue;
          fail(
            6,
            rel,
            i + 1,
            `${what} in world-building code. Derive a seed from stable inputs ` +
              `(chunk coords, packet id, object id) instead, or add an entry ` +
              `with a reason to tooling/repo-standards/allowlist-determinism.json.`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Standard 8 — no new module-level mutable singletons in packages/
// ---------------------------------------------------------------------------
// This is the specific thing that made the renderer hard to extract: sky,
// water, weather and terrain are one import cycle coupled by mutable
// module-level state. Existing offenders are baselined and must SHRINK.

function checkSingletons() {
  const baseline = readJson("tooling/repo-standards/baseline-singletons.json");
  const known = new Set(baseline.known.map((k) => `${k.file}:${k.symbol}`));
  const found = [];

  for (const file of walk("packages", [".ts", ".tsx"])) {
    const rel = posix(file);
    if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
    const src = lines(file);
    for (let i = 0; i < src.length; i++) {
      const text = src[i];
      let m = /^export\s+(let|var)\s+([A-Za-z0-9_$]+)/.exec(text);
      if (!m) {
        // `export const x = new Thing()` is a singleton instance unless it is
        // an immutable collection constant (ReadonlySet/ReadonlyMap).
        const c = /^export\s+const\s+([A-Za-z0-9_$]+)\s*(:[^=]*)?=\s*new\s+/.exec(text);
        if (c && !/Readonly(Set|Map|Array)/.test(c[2] ?? "")) m = [null, "const", c[1]];
      }
      if (!m) continue;
      const symbol = m[2];
      found.push({ file: rel, symbol, line: i + 1 });
    }
  }

  for (const f of found) {
    if (known.has(`${f.file}:${f.symbol}`)) continue;
    fail(
      8,
      f.file,
      f.line,
      `new module-level mutable singleton \`${f.symbol}\`. Shared packages ` +
        `export functions, classes and types — inject shared state instead. ` +
        `(If this is genuinely unavoidable, say why in ` +
        `tooling/repo-standards/baseline-singletons.json — the baseline may ` +
        `shrink, never grow.)`,
    );
  }

  // The baseline must shrink: a stale entry means the debt was paid and the
  // entry should go, so the ratchet keeps tightening.
  const live = new Set(found.map((f) => `${f.file}:${f.symbol}`));
  for (const k of baseline.known) {
    if (!live.has(`${k.file}:${k.symbol}`))
      note(
        `standard 8: baselined singleton \`${k.symbol}\` in ${k.file} is gone — ` +
          `delete it from baseline-singletons.json (the ratchet only tightens).`,
      );
  }
}

// ---------------------------------------------------------------------------
// Standard 2 — stable IDs and the ID registry
// ---------------------------------------------------------------------------
// A save file and a quest flag both point at "that door" forever. IDs are
// `<domain>.<packet>.<name>`, lower kebab, globally unique, never reused.

const ID_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*){2,}$/;
// Vocabulary registries (world/sources/registries) key *kinds of thing*, not
// placed objects, so they have no packet segment: `faction.naga-kur`,
// `deed.tolls.paid`. Such a source declares `"idShape": "flat"` and is held to
// <domain>.<slug> instead (decision 0044). Uniqueness and no-reuse are unchanged.
const ID_SHAPE_FLAT = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

function collectIds(value, key, out) {
  if (Array.isArray(value)) {
    for (const v of value) collectIds(v, key, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === key && typeof v === "string") out.push(v);
      else collectIds(v, key, out);
    }
  }
}

function checkIds() {
  const registry = readJson("tooling/repo-standards/id-registry.json");
  const retired = new Set(registry.retired ?? []);
  const seen = new Map();

  for (const source of registry.sources) {
    if (!existsSync(join(ROOT, source.path))) {
      fail(
        2,
        "tooling/repo-standards/id-registry.json",
        0,
        `registered ID source \`${source.path}\` does not exist. Fix the path ` +
          `or remove the entry.`,
      );
      continue;
    }
    const ids = [];
    collectIds(readJson(source.path), source.idKey ?? "id", ids);
    const shape = source.idShape === "flat" ? ID_SHAPE_FLAT : ID_SHAPE;
    // A source may REFERENCE ids another source declares (a blueprint's top-
    // level id is the catalogue place it details): `"references": ["place"]`
    // lists the id domains (first segment) that are checked for shape but
    // exempt from the uniqueness test in this source.
    const references = new Set(source.references ?? []);
    for (const id of ids) {
      if (!shape.test(id))
        fail(
          2,
          source.path,
          0,
          source.idShape === "flat"
            ? `ID \`${id}\` is not <domain>.<slug> in lower kebab ` +
              `(e.g. faction.naga-kur).`
            : `ID \`${id}\` is not <domain>.<packet>.<name> in lower kebab ` +
              `(e.g. poi.murkmire.drowned-stair).`,
        );
      if (retired.has(id))
        fail(2, source.path, 0, `ID \`${id}\` is retired and may never be reused.`);
      if (references.has(id.split(".")[0])) continue;
      const prior = seen.get(id);
      if (prior && prior !== source.path)
        fail(2, source.path, 0, `ID \`${id}\` is already used in ${prior}.`);
      seen.set(id, source.path);
    }
  }

  if (registry.sources.length === 0)
    note(
      "standard 2: no ID sources registered yet — the check goes live when " +
        "Phase 11 places its first object. Register each file in id-registry.json.",
    );
}

// ---------------------------------------------------------------------------
// Standard 7 — every runtime data bundle carries a schemaVersion
// ---------------------------------------------------------------------------
// Save migration is impossible without it, and a bundle shipped unversioned is
// one we cannot tell apart from its successor.

function checkSchemaVersions() {
  const registry = readJson("tooling/repo-standards/data-registry.json");
  for (const entry of registry.paths) {
    const abs = join(ROOT, entry.path);
    if (!existsSync(abs)) {
      if (entry.enforced)
        fail(
          7,
          "tooling/repo-standards/data-registry.json",
          0,
          `registered data path \`${entry.path}\` does not exist.`,
        );
      continue;
    }
    if (!entry.enforced) {
      note(
        `standard 7: \`${entry.path}\` is unversioned debt, owned by ${entry.owner}. ` +
          `Add schemaVersion when that phase next touches it, then flip enforced:true.`,
      );
      continue;
    }
    const files = statSync(abs).isDirectory()
      ? walk(entry.path, [".json"])
      : [entry.path];
    for (const file of files) {
      const data = readJson(file);
      const records = Array.isArray(data) ? data : [data];
      for (const record of records) {
        if (record && typeof record === "object" && !("schemaVersion" in record))
          fail(
            7,
            posix(file),
            0,
            "runtime data with no top-level `schemaVersion`. Add one (integer, " +
              "bumped on incompatible shape changes).",
          );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Standard 10 — asset provenance: source, hash and credit in the same change
// ---------------------------------------------------------------------------
// The rule alone has not worked: the credits review keeps re-finding gaps.

function checkCredits() {
  const summaryPath = "world/sources/assets/registry-summary.json";
  if (!existsSync(join(ROOT, summaryPath))) return;
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const haystack = readme.toLowerCase();
  const summary = readJson(summaryPath);

  for (const [pool, info] of Object.entries(summary.pools ?? {})) {
    const url =
      typeof info.source === "string" && /^https?:\/\//.test(info.source)
        ? info.source
        : null;

    // The credit must name the thing *and* point at it. A README may cite a
    // mod by number rather than by URL — that is a real citation, so accept
    // either — but naming it with no reference at all is not provenance.
    const names = [info.credit, info.label]
      .filter((s) => typeof s === "string")
      .map((s) => s.split("(")[0].trim().toLowerCase())
      .filter((s) => s.length >= 4);
    const named = names.some((n) => haystack.includes(n));

    const modId = url ? /\/mods\/(\d+)/.exec(url)?.[1] : null;
    const referenced = url
      ? haystack.includes(url.toLowerCase()) || (modId ? haystack.includes(modId) : false)
      : true; // non-URL sources (the owner's own game files) have nothing to link

    if (!(named && referenced))
      fail(
        10,
        summaryPath,
        0,
        `asset pool \`${pool}\` (${info.label ?? pool}) is not credited in the ` +
          `root README § Credits and third-party sources. Source + hash + credit ` +
          `land in the same change as the asset.`,
      );
  }
}

// ---------------------------------------------------------------------------

checkDeterminism();
checkSingletons();
checkIds();
checkSchemaVersions();
checkCredits();

for (const n of notes) console.log(`note  ${n}`);

if (failures.length === 0) {
  console.log(
    `repo-standards: OK (${notes.length} note${notes.length === 1 ? "" : "s"})`,
  );
  process.exit(0);
}

console.error(`\nrepo-standards: ${failures.length} violation(s)\n`);
for (const f of failures) {
  console.error(
    `  [standard ${f.standard}] ${f.file}${f.line ? `:${f.line}` : ""}\n      ${f.message}`,
  );
}
console.error(
  "\nThe standards are docs/engineering-standards.md. If a check is wrong, fix " +
    "the check — do not add an exemption without a reason in its allowlist.\n",
);
process.exit(1);
