/**
 * Harness scene "fire-stress-cards": fire-stress.ts with the volume path off
 * (cards for every fire on either backend), the baseline of its frame-time
 * ratio.
 */
import type { HarnessContext } from "../types";
import { buildFireStress } from "./fire-stress";

export default {
  name: "fire-stress-cards",
  build(ctx: HarnessContext) {
    return buildFireStress(ctx, "webgl");
  },
};
