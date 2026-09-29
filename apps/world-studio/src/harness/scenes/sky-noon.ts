/**
 * Sky at noon (decision 0111 harness): the WorldSky dome, clouds, aerial haze
 * over boxes at 200 m – 3 km, and the sun's CSMShadowNode cascades.
 */
import type { HarnessScene } from "../types";
import { buildSkyScene } from "../skyScene";

const skyNoon: HarnessScene = {
  name: "sky-noon",
  build(ctx) {
    return buildSkyScene(ctx, 12);
  },
};
export default skyNoon;
