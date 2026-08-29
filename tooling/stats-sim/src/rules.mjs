/**
 * Rule sets and content sets, loaded and resolved.
 *
 * The campaign engine takes TWO inputs, and this is the seam between them:
 *
 *   RULES   — how a use turns into a rank and a rank into a level. Ours
 *             (`rules-argonia.json`) and Morrowind's (`rules-morrowind.json`).
 *   CONTENT — how much of each verb an hour of play actually contains.
 *             Ours (`content-argonia.json`) and Vvardenfell's
 *             (`content-vvardenfell.json`).
 *
 * They are separate files because they fail separately. The campaign model
 * reported level 4 at hour 19 against Morrowind's 8-12, and dropping
 * Morrowind's flat use values into the same engine changed almost nothing —
 * which is only diagnosable if you can hold one input fixed and swap the other.
 *
 * `$from` is the only cleverness here: `{"$from": "curves.levelUp.ranksPerLevel"}`
 * is replaced by that path out of `curves.json`, so a design constant lives in
 * exactly one file and the rule set says where it came from rather than
 * repeating it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (name) => JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"));

const SOURCES = { curves: read("curves.json") };

const at = (path) =>
  path.split(".").reduce((node, key) => {
    if (node == null || !(key in node)) throw new RangeError(`$from: no such path ${path}`);
    return node[key];
  }, SOURCES);

/** Depth-first `$from` resolution. Sibling keys beside a `$from` override it. */
function resolve(node) {
  if (Array.isArray(node)) return node.map(resolve);
  if (node === null || typeof node !== "object") return node;
  const out = {};
  if (typeof node.$from === "string") {
    const source = at(node.$from);
    if (source === null || typeof source !== "object") return source;
    Object.assign(out, resolve(source));
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "$from") continue;
    out[key] = resolve(value);
  }
  return out;
}

export const RULES = {
  argonia: resolve(read("rules-argonia.json")),
  morrowind: resolve(read("rules-morrowind.json")),
};

export const CONTENT = {
  argonia: read("content-argonia.json"),
  vvardenfell: read("content-vvardenfell.json"),
};

/** Points needed for the next rank, under a given rule set. */
export const rankCost = (rules, value, klass, specialised) =>
  (value + 1) * rules.rankCost.classFactor[klass] * (specialised ? rules.rankCost.specFactor : 1);
