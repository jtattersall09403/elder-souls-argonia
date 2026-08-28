/**
 * @elder-souls/world-weather — deterministic province weather (world module
 * 55 §98, Phase 8c, decision 0032). Pure data: a seeded synoptic state
 * machine on the world clock, locally expressed through the climate fields.
 * No rendering, no Date.now(), no RNG — same instant, same weather, always.
 */

export * from "./states";
export * from "./synoptic";
export * from "./express";
export { WEATHER_SEED } from "./hash";
