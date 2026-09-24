/**
 * Progression rule sets (module 76 §120). A rule set's numbers may be written
 * `{"$from": "curves.levelUp.ranksPerLevel"}` so a design constant lives in one
 * file; `resolveRuleSet` replaces each reference with that value (sibling keys
 * beside an object `$from` override it; a scalar `$from` takes none). Pure: imports nothing but types.
 */
import type { Curves } from "./types";

type Node = unknown;

function at(sources: Readonly<Record<string, unknown>>, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node == null || typeof node !== "object" || !(key in node)) throw new RangeError(`$from: no such path ${path}`);
    return (node as Record<string, unknown>)[key];
  }, sources);
}

function resolve(node: Node, sources: Readonly<Record<string, unknown>>): Node {
  if (Array.isArray(node)) return node.map((n) => resolve(n, sources));
  if (node === null || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof obj.$from === "string") {
    const source = at(sources, obj.$from);
    if (source === null || typeof source !== "object") {
      if (Object.keys(obj).length > 1) throw new RangeError(`$from: ${obj.$from} is a scalar and cannot take sibling keys`);
      return source;
    }
    Object.assign(out, resolve(source, sources));
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key !== "$from") out[key] = resolve(value, sources);
  }
  return out;
}

/** Resolve every `$from` in a rule set against the curves table. */
export function resolveRuleSet(ruleSet: Readonly<Record<string, unknown>>, curves: Curves): Record<string, unknown> {
  return resolve(ruleSet, { curves }) as Record<string, unknown>;
}

export type RankCostRules = {
  readonly rankCost: { readonly classFactor: Readonly<Record<string, number>>; readonly specFactor: number };
};
/** Use-points for the next rank under a given rule set: (value + 1) × classFactor × (specFactor if specialised). */
export function rankCost(rules: RankCostRules, value: number, klass: string, specialised: boolean): number {
  return (value + 1) * rules.rankCost.classFactor[klass] * (specialised ? rules.rankCost.specFactor : 1);
}
