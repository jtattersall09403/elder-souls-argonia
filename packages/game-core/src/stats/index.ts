/**
 * The stats model (module 76 §116–§129) as pure functions over versioned data.
 * Public API: see README.md. Import from "@elder-souls/game-core/stats/index" (apps) or "../stats" (game-core).
 */
export * from "./types";
export { STATS_DATA, STATS_SCHEMA_VERSION, STATS_SOURCE, statsData, type StatsDataSource } from "./data";
export * from "./curve";
export * from "./derived";
export * from "./checks";
export * from "./progression";
export * from "./modifiers";
export * from "./rules";
export * from "./ladder";
export * from "./character";
export * from "./crafting";
