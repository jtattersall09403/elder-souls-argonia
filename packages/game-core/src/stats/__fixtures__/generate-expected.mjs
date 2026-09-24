#!/usr/bin/env node
/**
 * Generates the expected answers for an equivalence sample FROM tooling/stats-sim
 * (the design's reference implementation), never from the port.
 *
 *   node packages/game-core/src/stats/__fixtures__/generate-expected.mjs a
 *
 * Reads sample-<id>.inputs.json, calls the sim's own function for each case,
 * writes sample-<id>.expected.json. Infinity is written as {"$inf": 1}.
 * Frozen once written: the fixtures stay the proof if the sim is retired.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sim = join(here, "../../../../../tooling/stats-sim/src");
const model = await import(join(sim, "model.mjs"));
const rules = await import(join(sim, "rules.mjs"));

const FNS = {
  ...model,
  rankCost: (value, klass, specialised) => rules.rankCost(rules.RULES.argonia, value, klass, specialised),
};

const id = process.argv[2];
if (!id) throw new Error("usage: generate-expected.mjs <sample id>");
const input = JSON.parse(readFileSync(join(here, `sample-${id}.inputs.json`), "utf8"));
const enc = (v) =>
  v === Infinity ? { $inf: 1 } : v && typeof v === "object"
    ? Array.isArray(v) ? v.map(enc) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))
    : v;
const expected = input.cases.map(([fn, args]) => {
  const f = FNS[fn];
  if (typeof f !== "function") throw new Error(`sim has no function ${fn}`);
  return enc(f(...args.map((a) => (a === null ? undefined : a))));
});
writeFileSync(
  join(here, `sample-${id}.expected.json`),
  JSON.stringify({ schemaVersion: 1, sample: id, generatedFrom: "tooling/stats-sim/src", expected }, null, 1) + "\n",
);
console.log(`sample ${id}: ${expected.length} answers from the sim`);
