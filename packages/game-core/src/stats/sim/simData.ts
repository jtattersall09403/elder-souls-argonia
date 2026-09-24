/**
 * The balance harness's data: the game's stats tables plus the harness-only
 * tables under `sim/data/` (gear, reference builds, named enemies, the two
 * content models and Morrowind's rule set). Pure; nothing here is mutable.
 */
import buildsJson from "./data/builds.json";
import contentArgoniaJson from "./data/content-argonia.json";
import contentVvardenfellJson from "./data/content-vvardenfell.json";
import enemiesJson from "./data/enemies.json";
import gearJson from "./data/gear.json";
import rulesMorrowindJson from "./data/rules-morrowind.json";
import { STATS_DATA, STATS_SCHEMA_VERSION } from "../data";
import { resolveRuleSet } from "../rules";
import type { StatsData } from "../types";

/** A harness table: read loosely, never by the game. */
export type SimTable = Readonly<Record<string, any>>;

export type SimData = StatsData & {
  readonly gear: SimTable;
  readonly builds: SimTable;
  readonly enemies: SimTable;
  readonly content: { readonly argonia: SimTable; readonly vvardenfell: SimTable };
  /** `argonia` is `StatsData.progression`; `morrowind` is resolved against the same curves. */
  readonly rules: { readonly argonia: SimTable; readonly morrowind: SimTable };
};

/** The harness tables as authored (`$from` references unresolved). */
export type SimDataSource = {
  gear: unknown; builds: unknown; enemies: unknown;
  content: { argonia: unknown; vvardenfell: unknown };
  rules: { morrowind: unknown };
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Assemble a harness data set over a validated `StatsData`. Throws on a schemaVersion this code does not read. */
export function simData(stats: StatsData, raw: SimDataSource): SimData {
  const src = structuredClone(raw);
  const tables: Record<string, unknown> = {
    gear: src.gear, builds: src.builds, enemies: src.enemies,
    "content.argonia": src.content.argonia, "content.vvardenfell": src.content.vvardenfell,
    "rules.morrowind": src.rules.morrowind,
  };
  for (const [name, table] of Object.entries(tables)) {
    const version = (table as { schemaVersion?: number } | undefined)?.schemaVersion;
    if (version !== STATS_SCHEMA_VERSION) {
      throw new RangeError(`sim data: ${name} schemaVersion ${String(version)}, expected ${STATS_SCHEMA_VERSION}`);
    }
  }
  return deepFreeze({
    ...stats,
    gear: src.gear as SimTable,
    builds: src.builds as SimTable,
    enemies: src.enemies as SimTable,
    content: { argonia: src.content.argonia as SimTable, vvardenfell: src.content.vvardenfell as SimTable },
    rules: {
      argonia: stats.progression as SimTable,
      morrowind: resolveRuleSet(src.rules.morrowind as Record<string, unknown>, stats.curves) as SimTable,
    },
  });
}

/** The canonical harness data: `STATS_DATA` plus `sim/data/*.json`. */
export const SIM_DATA: SimData = simData(STATS_DATA, {
  gear: gearJson, builds: buildsJson, enemies: enemiesJson,
  content: { argonia: contentArgoniaJson, vvardenfell: contentVvardenfellJson },
  rules: { morrowind: rulesMorrowindJson },
});
