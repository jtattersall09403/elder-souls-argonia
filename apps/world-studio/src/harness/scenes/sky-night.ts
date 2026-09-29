/**
 * Sky at night (decision 0111 harness): the night dome, stars, the Serpent,
 * both moon discs (display-referred through the inverse ACES) and moon glow,
 * over the same haze/shadow test ground as sky-noon.
 */
import type { HarnessScene } from "../types";
import { buildSkyScene } from "../skyScene";

const skyNight: HarnessScene = {
  name: "sky-night",
  build(ctx) {
    return buildSkyScene(ctx, 1);
  },
};
export default skyNight;
