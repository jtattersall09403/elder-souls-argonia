/**
 * Test-only: the published settlements, read from disk the way the runtime
 * reads them (S8): `province/settlements/index.json`, every bundle it names,
 * reassembled by `assembleSettlementBundle`. Node only (never imported by
 * the runtime).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assembleSettlementBundle, type AssembledSettlementBundle, type SettlementIndex,
  type SettlementPartBundle,
} from "./settlementIndex";

export function readPublishedSettlements(provinceDir: string): AssembledSettlementBundle {
  const read = (path: string) => JSON.parse(readFileSync(resolve(provinceDir, path), "utf8"));
  const index = read("settlements/index.json") as SettlementIndex;
  const parts = [...index.places, ...(index.routes ?? [])]
    .map((entry) => read(entry.bundle) as SettlementPartBundle);
  return assembleSettlementBundle(parts);
}
