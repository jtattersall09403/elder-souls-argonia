/**
 * Narrow entry point for apps that show only stat text (the stats lab): the
 * stats block alone, so a bundle does not carry every place name and quest
 * title. Global id and text uniqueness is still enforced by the full
 * `CATALOGUE` (entries.ts), which includes this block.
 */
import { buildCatalogue } from "./catalogue.js";
import { STATS_TEXT } from "./stats-text.js";

export { STATS_TEXT };
export const STATS_CATALOGUE = buildCatalogue(STATS_TEXT);
