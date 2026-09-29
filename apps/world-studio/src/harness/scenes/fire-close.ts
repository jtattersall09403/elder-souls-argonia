/**
 * Harness scene "fire-close": the large presets close up at night, where the
 * volume path draws on WebGPU (cards on WebGL): torchGround, brazier,
 * hearth, campfire at 1.2 m (fire.ts `buildFireScene`). Compare the two
 * backends' shots for card against volume.
 */
import type { HarnessContext } from "../types";
import { buildFireScene, FIRE_NIGHT } from "./fire";

export default {
  name: "fire-close",
  build(ctx: HarnessContext) {
    return buildFireScene(ctx, FIRE_NIGHT, ["torchGround", "brazier", "hearth", "campfire"], 1.2, 1.6);
  },
};
