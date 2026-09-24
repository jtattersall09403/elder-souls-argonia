import { describe, expect, it } from "vitest";
import { weaponById } from "../equipment/arsenal";
import { arrowById } from "../equipment/arrows";
import { armourById, totalArmourRating } from "../equipment/armour";
import { DEFAULT_ENEMY_ARCHETYPE } from "../actors/enemyArchetypes";
import { VISUAL_PROBE_BONES } from "../validation/actorVisualMetrics";
import { marksmanModifiers } from "../stats/modifiers";
import { dragDeceleration, launchSpeed, resolveArrowImpact } from "./ballistics";
import { hitZoneForBone } from "./hitZones";

/**
 * The owner's calibration check (decision 0090): at marksman 100, a full-draw
 * daedric warbow with a daedric war arrow kills the default opponent (150
 * health, iron cuirass, gauntlets and boots) with one headshot, and does not
 * with a body shot. The table is reported for all three bow classes.
 */
const BOWS = ["daedric-warbow", "steel-longbow", "wood-shortbow"] as const;
const ARROW = arrowById("daedric-war-arrow");
const RATING = totalArmourRating(DEFAULT_ENEMY_ARCHETYPE.armour.map(armourById));
const HEAD = hitZoneForBone(VISUAL_PROBE_BONES.head).damageMultiplier;

/** Impact speed after `metres` of level flight, by the same drag the live arrow uses. */
function speedAfter(v0: number, metres: number) {
  let speed = v0;
  for (let travelled = 0; travelled < metres; travelled += 0.1) speed -= dragDeceleration(speed, ARROW.physics) * (0.1 / speed);
  return speed;
}

function shot(bowId: string, skill: number, metres: number, zone: number) {
  const speed = speedAfter(launchSpeed(weaponById(bowId).stats.ranged!, ARROW.physics, 1), metres);
  return resolveArrowImpact(ARROW.physics, speed, { armourRating: RATING }, marksmanModifiers(skill).damage * zone).damage;
}

describe("arrow damage calibration (0090)", () => {
  it("one-shots the default opponent with a master's warbow headshot out to 20 m, never with a body shot", () => {
    const table = BOWS.flatMap((bow) => [100, 10].map((skill) =>
      `${bow} skill ${skill}: head ${shot(bow, skill, 0, HEAD).toFixed(1)} (20 m ${shot(bow, skill, 20, HEAD).toFixed(1)}), body ${shot(bow, skill, 0, 1).toFixed(1)}`));
    console.info(table.join("\n"));
    expect(shot("daedric-warbow", 100, 0, HEAD)).toBeGreaterThanOrEqual(160);
    expect(shot("daedric-warbow", 100, 20, HEAD)).toBeGreaterThanOrEqual(160);
    for (const bow of BOWS) expect(shot(bow, 100, 0, 1), bow).toBeLessThan(DEFAULT_ENEMY_ARCHETYPE.maxHealth);
  });
});
