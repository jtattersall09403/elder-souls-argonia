/**
 * Harness scene "fire-diag-vol": diagnostic isolation of the volume streaks (0110 fix 2):
 * three braziers at night close-up, seeds 0.5 (the brazier's seed in
 * fire-close), 0.55 and 0.25, volume draws only (cards and embers hidden).
 */
import type { HarnessContext } from "../types";
import { buildFireScene, FIRE_NIGHT } from "./fire";

export default {
  name: "fire-diag-vol",
  build(ctx: HarnessContext) {
    return buildFireScene(ctx, FIRE_NIGHT, ["brazier", "brazier", "brazier"], 1.2, 1.6,
      { seeds: [0.5, 0.55, 0.25], show: (n) => n.startsWith("fire-volume") });
  },
};
