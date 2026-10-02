import { describe, expect, it } from "vitest";
import { LATITUDE, localSiderealAngle, toHorizontal } from "@elder-souls/world-time";
import { equatorialToHorizontal, equatorialUnit } from "./starRotation";

describe("equatorialToHorizontal", () => {
  const stars: [number, number][] = [[0.3, 0.2], [2.1, -1.1], [4.0, 0.9], [5.5, -0.05], [1.2, 1.45]];
  for (const lat of [LATITUDE, 0.6]) {
    for (const t of [0, 913.7, 1_234_567.25]) {
      it(`matches toHorizontal at t=${t}, lat=${lat.toFixed(2)}`, () => {
        const lst = localSiderealAngle(t);
        const m = equatorialToHorizontal(lst, lat, new Array(9));
        const e = { x: 0, y: 0, z: 0 };
        for (const [ra, dec] of stars) {
          equatorialUnit(ra, dec, e);
          const h = toHorizontal(dec, lst - ra, lat).direction;
          expect(m[0] * e.x + m[1] * e.y + m[2] * e.z).toBeCloseTo(h.x, 5);
          expect(m[3] * e.x + m[4] * e.y + m[5] * e.z).toBeCloseTo(h.y, 5);
          expect(m[6] * e.x + m[7] * e.y + m[8] * e.z).toBeCloseTo(h.z, 5);
        }
      });
    }
  }
});
