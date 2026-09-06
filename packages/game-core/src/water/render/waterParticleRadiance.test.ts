import { expect, it } from "vitest";
import { computeLightRig } from "../../../../../apps/world-studio/src/sky/lightRig";
import { toEpochMinutes } from "@elder-souls/world-time";
import { waterParticleRadiance } from "./waterParticleLighting";

it("does not crush daylight or moonlit spray with a display-space radiance cap", () => {
  for (const [month, day, hour] of [[7, 17, 12], [5, 4, 23]]) {
    const rig = computeLightRig(toEpochMinutes({ era: 4, year: 201, month, day,
      minuteOfDay: hour * 60 }), 0.7, 0.4);
    const vector = (v: number[]) => ({ x: v[0], y: v[1], z: v[2] });
    const radiance = waterParticleRadiance(vector(rig.hazeAmbient), vector(rig.hazeSunLight), rig.sun.direction.y);
    const exposed = (radiance.x * .2126 + radiance.y * .7152 + radiance.z * .0722) * rig.exposureTarget;
    expect(exposed).toBeGreaterThan(.004);
    expect(exposed).toBeLessThan(2);
    if (hour === 12) expect(1.4 * rig.exposureTarget).toBeLessThan(exposed / 100);
  }
});
