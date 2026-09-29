/**
 * Harness scene "fire-night": the "fire" row (every preset, 0.8 m tall) at
 * the moonless-night exposure, 22 (fire.ts `buildFireScene`).
 */
import { FIRE_PRESET_ORDER } from "@elder-souls/game-core/fx/fire/fireTypes";
import type { HarnessContext } from "../types";
import { buildFireScene, FIRE_NIGHT } from "./fire";

export default {
  name: "fire-night",
  build(ctx: HarnessContext) {
    return buildFireScene(ctx, FIRE_NIGHT, FIRE_PRESET_ORDER, 0.8, 1.3);
  },
};
