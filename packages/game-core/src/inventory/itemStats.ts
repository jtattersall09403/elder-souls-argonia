import { ARROWHEADS, launchSpeed, kineticEnergyJoules } from "../combat/ballistics";
import { armourMitigation } from "../combat/armourMitigation";
import {
  ARROW_POISE_DAMAGE,
  ATTACK_POISE_FACTOR,
  WEAPON_CLASS_POISE_DAMAGE,
  armourPoiseBand,
} from "../combat/poise";
import { ARROW_SHAFTS } from "../equipment/arrows";
import { MATERIAL_PROFILES } from "../equipment/materials";
import { WEAPON_CLASSES } from "../equipment/weaponClasses";
import { shotCycleSeconds } from "../equipment/types";
import type { ItemDefinition } from "./types";

/**
 * What an item's numbers mean, in words a player can read.
 *
 * Lives with the inventory rules rather than the UI, because *which* stats a
 * kind of item has is a property of the item, not of how it is drawn. A
 * controller-first layout, a shop screen and a compare tooltip all want the
 * same list.
 *
 * Every figure here is derived from the same data combat uses. There is no
 * second set of display numbers to drift out of step with the real ones.
 */

export type ItemStatLine = {
  label: string;
  value: string;
  /** Longer explanation, for a UI with room to show one. */
  note?: string;
};

const kg = (value: number) => `${value.toFixed(value < 1 ? 2 : 1)} kg`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const seconds = (value: number) => `${value.toFixed(1)} s`;

export function itemStatLines(definition: ItemDefinition): ItemStatLine[] {
  const common: ItemStatLine[] = [
    { label: "Weight", value: kg(definition.weightKg) },
    { label: "Value", value: `${definition.value} gold` },
  ];
  const equip = definition.equip;
  if (!equip) return common;

  switch (equip.kind) {
    case "weapon": {
      const { weapon } = equip;
      const profile = WEAPON_CLASSES[weapon.stats.class];
      const material = MATERIAL_PROFILES[
        (weapon as { materialId?: keyof typeof MATERIAL_PROFILES }).materialId ?? "steel"
      ];
      const lines: ItemStatLine[] = [
        { label: "Class", value: profile.label },
        ...(material ? [{ label: "Material", value: material.label, note: `Tier ${material.tier}` }] : []),
        ...common,
      ];
      if (weapon.stats.ranged) {
        const ranged = weapon.stats.ranged;
        // Quoted against the shaft this class is built around, so two bows are
        // compared on the same arrow rather than on their own best case.
        const shaft = { ...ARROW_SHAFTS.war, headHardness: 1 };
        const speed = launchSpeed(ranged, { ...shaft, headHardness: 1 }, 1);
        lines.push(
          { label: "Draw weight", value: `${Math.round(ranged.peakDrawForceN / 4.448)} lb`,
            note: `${Math.round(ranged.peakDrawForceN)} N at full draw` },
          { label: "Launch speed", value: `${speed.toFixed(0)} m/s`, note: "with a war shaft" },
          { label: "Energy", value: `${kineticEnergyJoules(shaft.massKg, speed).toFixed(0)} J` },
          { label: "Time to full draw", value: seconds(ranged.drawSeconds) },
          { label: "Shot cycle", value: seconds(shotCycleSeconds(ranged)), note: "nock, draw, follow through" },
          { label: "Draw stamina", value: `${ranged.drawStaminaPerSecond.toFixed(0)}/s` },
        );
        return lines;
      }
      const light = weapon.attacks.light1;
      lines.push(
        { label: "Damage", value: `${light.damage}`, note: "one light attack, before armour" },
        { label: "Heavy damage", value: `${weapon.attacks.heavy.damage}` },
        { label: "Stamina", value: `${light.stamina}`, note: "per light attack" },
        { label: "Reach", value: `${light.range.toFixed(2)} m` },
        { label: "Guard stability", value: percent(weapon.stats.guard.stability),
          note: "share of a blocked blow's stamina cost absorbed" },
        // Poise damage is a class stat, never authored per item (76 §121.3), so
        // a player comparing two hammers should see the same figure on both —
        // and a player comparing a dagger with a hammer should see why one of
        // them interrupts things and the other does not.
        { label: "Stagger", value: `${Math.round(WEAPON_CLASS_POISE_DAMAGE[weapon.stats.class])}`,
          note: "poise taken off a defender by one light attack" },
        { label: "Heavy stagger",
          value: `${Math.round(WEAPON_CLASS_POISE_DAMAGE[weapon.stats.class] * ATTACK_POISE_FACTOR.heavy)}` },
        { label: "Grip", value: weapon.stats.occupiesOffHand ? "Two-handed" : "One-handed" },
      );
      return lines;
    }

    case "shield": {
      const { shield } = equip;
      return [
        { label: "Class", value: "Shield" },
        ...common,
        { label: "Guard stability", value: percent(shield.stats.guard.stability),
          note: "share of a blocked blow's stamina cost absorbed" },
        { label: "Blocked damage", value: percent(shield.stats.guard.absorption.physical ?? 0),
          note: "kept off you when the block holds" },
      ];
    }

    case "apparel": {
      const { armour } = equip;
      return [
        { label: "Slot", value: armour.armourSlot[0].toUpperCase() + armour.armourSlot.slice(1) },
        { label: "Material", value: MATERIAL_PROFILES[armour.materialId]?.label ?? armour.materialId },
        ...common,
        { label: "Armour", value: `${armour.armourRating}` },
        { label: "Damage stopped", value: percent(armourMitigation(armour.armourRating)),
          note: "this piece alone, on any hit" },
        // §121.3 gives each piece a poise *band*; where in it you sit is set by
        // your skill in its armour class. Both ends are shown, because the
        // spread is the interesting part — and once the armour skills arrive at
        // 10c the same line will read as a range you can move within.
        { label: "Poise", value: poiseBand(armour) },
      ];
    }

    case "ammunition": {
      const { arrow } = equip;
      const shaft = ARROW_SHAFTS[arrow.shaftId];
      const head = ARROWHEADS[arrow.physics.head];
      return [
        { label: "Shaft", value: shaft.label },
        { label: "Head", value: head.label },
        { label: "Mass", value: `${(arrow.physics.massKg * 1000).toFixed(0)} g`,
          note: "heavier arrives harder, lighter flies further" },
        { label: "Value", value: `${arrow.value} gold each` },
        { label: "Against armour", value: `${head.armourPiercing.toFixed(2)}×`,
          note: head.description },
        { label: "Wound", value: `${head.woundSeverity.toFixed(2)}×`, note: "once the point is through" },
        { label: "Stagger", value: `${ARROW_POISE_DAMAGE}`,
          note: "poise taken off a defender; a head hit interrupts regardless" },
      ];
    }
  }
}

/**
 * A worn piece's poise contribution, as the band §121.3 stores it.
 *
 * Collapses to a single figure while the floor and ceiling are the same, which
 * they are not today and will not be at 10c either — but a stat line that reads
 * "12" when there is nothing to choose between is kinder than one that reads
 * "12-12".
 */
function poiseBand(armour: { armourRating: number }) {
  const band = armourPoiseBand(armour);
  const lo = Math.round(band.lo);
  const hi = Math.round(band.hi);
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}
