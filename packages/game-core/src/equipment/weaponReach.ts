import measurements from "./generated/weapon-reach.json";
import type { AttackId, WeaponDefinition } from "./types";

export const MEASURED_ATTACK_IDS = ["light1", "light2", "light3", "heavy", "heavy2", "riposte", "backstab"] as const;
export type MeasuredAttackId = typeof MEASURED_ATTACK_IDS[number];
export type WeaponReachRecord = {
  lengthMeters: number;
  attacks: Record<MeasuredAttackId, { range: number; stationaryRange: number; atSeconds: number; sourceTime: number }>;
};

export function applyWeaponReach<T extends WeaponDefinition>(weapon: T): T {
  if (weapon.stats.ranged) return weapon;
  const record = (measurements.weapons as unknown as Record<string, WeaponReachRecord>)[weapon.id];
  if (!record) throw new Error(`Missing measured reach for ${weapon.id}; run npm run weapons:reach`);
  const attacks = { ...weapon.attacks };
  for (const id of MEASURED_ATTACK_IDS) {
    const measured = record.attacks[id];
    if (!measured || !Number.isFinite(measured.range) || measured.range <= 0) throw new Error(`Invalid measured reach: ${weapon.id}/${id}`);
    attacks[id as AttackId] = { ...attacks[id], measuredReach: measured,
      ...(id === "riposte" || id === "backstab" ? {} : { range: measured.range }) };
  }
  return { ...weapon, attacks };
}
