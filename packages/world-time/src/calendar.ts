/**
 * Canon Tamrielic calendar (world module 55 §94).
 * Source dossier: world/sources/lore/topics/sky-moons-calendar.md
 * (UESP Lore:Calendar, Lore:The Seasons of Argonia). 365-day year, 12 months,
 * 7-day week, 24-hour day. Jel month names are the Argonian calendar and are
 * primary in Argonian mouths; Cyrodilic names belong to written records.
 */

export interface MonthDef {
  /** 0-based month index. */
  index: number;
  name: string;
  jel: string;
  jelMeaning: string;
  days: number;
  birthsign: string;
}

export const MONTHS: readonly MonthDef[] = [
  { index: 0, name: "Morning Star", jel: "Vakka", jelMeaning: "Sun", days: 31, birthsign: "Ritual" },
  { index: 1, name: "Sun's Dawn", jel: "Xeech", jelMeaning: "Nut", days: 28, birthsign: "Lover" },
  { index: 2, name: "First Seed", jel: "Sisei", jelMeaning: "Sprout", days: 31, birthsign: "Lord" },
  { index: 3, name: "Rain's Hand", jel: "Hist-Deek", jelMeaning: "Hist Sapling", days: 30, birthsign: "Mage" },
  { index: 4, name: "Second Seed", jel: "Hist-Dooka", jelMeaning: "Mature Hist", days: 31, birthsign: "Shadow" },
  { index: 5, name: "Midyear", jel: "Hist-Tsoko", jelMeaning: "Elder Hist", days: 30, birthsign: "Steed" },
  { index: 6, name: "Sun's Height", jel: "Thtithil-Gah", jelMeaning: "Egg-Basket", days: 31, birthsign: "Apprentice" },
  { index: 7, name: "Last Seed", jel: "Thtithil", jelMeaning: "Egg", days: 31, birthsign: "Warrior" },
  { index: 8, name: "Hearthfire", jel: "Nushmeeko", jelMeaning: "Lizard", days: 30, birthsign: "Lady" },
  { index: 9, name: "Frostfall", jel: "Shaja-Nushmeeko", jelMeaning: "Semi-Humanoid Lizard", days: 31, birthsign: "Tower" },
  { index: 10, name: "Sun's Dusk", jel: "Saxhleel", jelMeaning: "Argonian", days: 30, birthsign: "Atronach" },
  { index: 11, name: "Evening Star", jel: "Xulomaht", jelMeaning: "The Deceased", days: 31, birthsign: "Thief" },
];

export const WEEKDAYS: readonly string[] = [
  "Morndas",
  "Tirdas",
  "Middas",
  "Turdas",
  "Fredas",
  "Loredas",
  "Sundas",
];

export const DAYS_PER_YEAR = 365;
export const MINUTES_PER_DAY = 1440;
export const HOURS_PER_DAY = 24;

/** Cumulative days before each month (index m → days in months 0..m-1). */
const CUMULATIVE_DAYS: readonly number[] = MONTHS.reduce<number[]>(
  (acc, m) => {
    acc.push(acc[m.index] + m.days);
    return acc;
  },
  [0],
);

/** 1-based day of year (Morning Star 1 → 1) for a 0-based month and 1-based day. */
export function dayOfYear(month: number, day: number): number {
  return CUMULATIVE_DAYS[month] + day;
}

/** Inverse of {@link dayOfYear}: 1-based day of year → {month (0-based), day (1-based)}. */
export function monthAndDay(yearDay: number): { month: number; day: number } {
  let month = 0;
  while (month < 11 && yearDay > CUMULATIVE_DAYS[month + 1]) month += 1;
  return { month, day: yearDay - CUMULATIVE_DAYS[month] };
}

/**
 * Weekday index (0 = Morndas) from whole days since the package epoch
 * (4E 201 Morning Star 1). Anchor: 17 Last Seed 4E 201 is a Sundas
 * (GAME_DERIVED, Skyrim's opening date), so Morning Star 1 4E 201 is Middas.
 */
const EPOCH_WEEKDAY = 2; // Middas
export function weekdayIndex(epochDays: number): number {
  return (((EPOCH_WEEKDAY + epochDays) % 7) + 7) % 7;
}
