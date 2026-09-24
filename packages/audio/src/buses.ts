import type { SoundCategory } from "./manifest";

/**
 * The mixer: every voice plays into one bus; every bus feeds `master`.
 * Module 57 §107 / research §4.3: ambience, weather, contact (combat +
 * movement), effects (object), ui and music, each with its own volume.
 */
export type BusId = "master" | "ambience" | "weather" | "combat" | "movement" | "object" | "ui" | "music";

export const BUSES: readonly BusId[] = ["master", "ambience", "weather", "combat", "movement", "object", "ui", "music"];

export const CATEGORY_BUS: Readonly<Record<SoundCategory, BusId>> = {
  ambient: "ambience",
  weather: "weather",
  combat: "combat",
  movement: "movement",
  object: "object",
  ui: "ui",
  music: "music",
};

/** Buses the acoustic state filters (underwater muffles the world, not the UI). */
export const WORLD_BUSES: readonly BusId[] = ["ambience", "weather", "combat", "movement", "object"];

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
