/**
 * The harness port against the sim itself. The expected output was generated
 * from the sim BEFORE the port was written:
 *   node tooling/stats-sim/run.mjs --json --matrix | gzip -9 -n > __fixtures__/sim-output.json.gz
 * and the port runs on the sim's own tables (`fromSimTables`). One `it` per
 * results section plus one for the invariants.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";

import { fromSimTables } from "../__fixtures__/simTables";
import { runSim } from "./run";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "__fixtures__");
const expected = JSON.parse(gunzipSync(readFileSync(join(fixtures, "sim-output.json.gz"))).toString("utf8"));
const started = performance.now();
// JSON round trip: the fixture is run.mjs --json output (functions dropped, Infinity -> null).
const actual = JSON.parse(JSON.stringify(runSim(fromSimTables(join(fixtures, "sim-data")), { matrix: true })));
const seconds = (performance.now() - started) / 1000;

/**
 * The two places a campaign run echoes its input tables (`character.rules`,
 * `character.race`) differ by construction, not by arithmetic: the port's
 * tables carry `schemaVersion`, and races are sex-split (the harness plays male).
 */
function undoInputEcho(runs: { character: { rules: Record<string, unknown>; race: { attributes: Record<string, unknown> } } }[]) {
  for (const { character } of runs) {
    delete character.rules.schemaVersion;
    character.race.attributes = character.race.attributes.male as Record<string, unknown>;
  }
}
undoInputEcho(actual.results.campaign);
undoInputEcho(actual.results.knownAnswer.runs);

const RELATIVE = 1e-9;
let largestRelative = 0;
let numbersCompared = 0;

function same(a: unknown, e: unknown, path: string): void {
  if (typeof e === "number") {
    expect(typeof a, path).toBe("number");
    numbersCompared += 1;
    const diff = Math.abs((a as number) - e);
    const rel = diff / Math.max(Math.abs(e), Number.MIN_VALUE);
    if (diff > 0) largestRelative = Math.max(largestRelative, rel);
    expect(diff <= RELATIVE * Math.abs(e), `${path}: ${a as number} vs ${e}`).toBe(true);
  } else if (e && typeof e === "object") {
    expect(a && typeof a === "object", path).toBe(true);
    expect(Object.keys(a as object).sort(), path).toEqual(Object.keys(e).sort());
    for (const [key, v] of Object.entries(e)) same((a as Record<string, unknown>)[key], v, `${path}.${key}`);
  } else {
    expect(a, path).toBe(e);
  }
}

describe("harness port equals tooling/stats-sim run.mjs --json --matrix", () => {
  it("covers every section the sim reports", () => {
    expect(Object.keys(actual.results)).toEqual(Object.keys(expected.results));
  });
  for (const key of Object.keys(expected.results)) {
    it(`results.${key}`, () => same(actual.results[key], expected.results[key], key));
  }
  it("invariants", () => same(actual.invariants, expected.invariants, "invariants"));
  afterAll(() => {
    console.log(`[sim equivalence] ${numbersCompared} numbers, largest relative difference ${largestRelative}, runSim ${seconds.toFixed(2)} s`);
  });
});
