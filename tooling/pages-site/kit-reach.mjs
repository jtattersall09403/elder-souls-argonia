/**
 * Which files under `kits/` a site ships, by RESOLVED reference (compose.mjs
 * rule 2; decision 0052 addendum 2026-09-28).
 *
 * The first rule derived a kit id from each top-level entry under `kits/` and
 * pruned any entry no shipped text file named as `kits/<id>`. A sidecar folder
 * a kit manifest names by a path relative to itself (`works-v1-fx/…png` in the
 * works-v1 manifest's `effectTextures`) was therefore pruned while its manifest
 * shipped, and the deployed flame texture 404'd (16k walk 3). Folder names are
 * never evidence of use; references are.
 *
 * The rule now:
 *   1. Every top-level kit id a root text file names (`kits/<id>`, kit-ref.mjs)
 *      keeps every file of that id (`<id>.kit.json`, `<id>.glb`, sidecars, and
 *      a folder called `<id>`).
 *   2. Every kept JSON file is walked generically: each string value that,
 *      resolved against the file's own folder, is an existing file or folder
 *      under `kits/` keeps that file (or every file in that folder). Kept JSON
 *      reached this way is walked in turn, to a fixpoint.
 *   3. Everything else under `kits/` is pruned.
 *
 * Pure: the caller passes the file list (paths relative to `kits/`, "/"
 * separated) and a JSON reader; nothing here touches the disk.
 */

/** Every string value in a parsed JSON value (object values and array items, depth first). */
export function jsonStrings(value, visit) {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) for (const v of value) jsonStrings(v, visit);
  else if (value && typeof value === "object") for (const v of Object.values(value)) jsonStrings(v, visit);
}

/** A string that is a relative path (not a URL, not absolute, not a Windows build path). */
const RELATIVE_PATH = /^(?![a-z][a-z0-9+.-]*:)(?![/\\])[^\\:]+$/i;

/** `ref` resolved against the folder of `fromRel` ("a/b.json" + "c/d.png" -> "a/c/d.png"); null if it escapes. */
export function resolveRelative(fromRel, ref) {
  if (!RELATIVE_PATH.test(ref)) return null;
  const parts = fromRel.split("/").slice(0, -1);
  for (const seg of ref.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join("/");
}

/** The kit id a top-level entry under `kits/` stands for (`works-v1.kit.json` -> `works-v1`; a folder is its own name). */
export const kitIdOf = (rel) => {
  const top = rel.split("/")[0];
  return rel.includes("/") ? top : top.split(".")[0];
};

/**
 * files: every file under kits/ (relative, "/"-separated). literalIds: kit ids
 * the root text files name. readJson(rel) -> parsed JSON of kits/<rel>.
 * Returns { keep: Set<rel>, resolved: [{from, ref, to}] } — `resolved` lists
 * every reference that kept something, for the post-prune gate.
 */
export function kitReach(files, literalIds, readJson) {
  const fileSet = new Set(files);
  const byDir = new Map();   // folder rel -> files inside it (any depth)
  for (const f of files) {
    const segs = f.split("/");
    for (let i = 1; i < segs.length; i++) {
      const d = segs.slice(0, i).join("/");
      if (!byDir.has(d)) byDir.set(d, []);
      byDir.get(d).push(f);
    }
  }
  const keep = new Set();
  const queue = [];
  const add = (f) => { if (!keep.has(f)) { keep.add(f); if (f.endsWith(".json")) queue.push(f); } };
  for (const f of files) if (literalIds.has(kitIdOf(f))) add(f);
  const resolved = [];
  while (queue.length) {
    const from = queue.shift();
    let parsed;
    try { parsed = readJson(from); } catch { continue; }   // not JSON after all: nothing to walk
    jsonStrings(parsed, (s) => {
      const to = resolveRelative(from, s);
      if (to === null || to === "") return;
      if (fileSet.has(to)) { resolved.push({ from, ref: s, to }); add(to); }
      else if (byDir.has(to)) { resolved.push({ from, ref: s, to }); for (const f of byDir.get(to)) add(f); }
    });
  }
  return { keep, resolved };
}

/** A string that names a shippable asset file by its extension. */
const ASSET_FILE = /\.(glb|gltf|ktx2|png|jpe?g|webp|bin|json)$/i;

/**
 * The post-prune gate (B): references that do not resolve in the shipped set.
 *   - kit JSON: every relative asset-file string, resolved against its own folder;
 *   - other shipped JSON (settlement and interior bundles, indexes): every string
 *     starting `kits/`, resolved against the studio root.
 * shipped: Set of studio-relative paths ("kits/works-v1.glb", "province/…").
 * jsonFiles: studio-relative JSON paths to check. readJson(rel) -> parsed JSON.
 * Returns [{from, ref}] for every dangling reference.
 */
export function danglingRefs(shipped, jsonFiles, readJson) {
  const dirs = new Set();
  for (const f of shipped) { const s = f.split("/"); for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/")); }
  const exists = (p) => shipped.has(p) || dirs.has(p);
  const out = [];
  for (const from of jsonFiles) {
    let parsed;
    try { parsed = readJson(from); } catch (e) { out.push({ from, ref: `(unreadable JSON: ${e.message})` }); continue; }
    const inKits = from.startsWith("kits/");
    jsonStrings(parsed, (s) => {
      if (inKits) {
        if (!ASSET_FILE.test(s)) return;
        const to = resolveRelative(from, s);
        if (to !== null && !exists(to)) out.push({ from, ref: s });
      } else if (/^\/?kits\/[^\s]+$/.test(s)) {
        const to = s.replace(/^\//, "").split(/[?#]/)[0];
        if (!exists(to)) out.push({ from, ref: s });
      }
    });
  }
  return out;
}
