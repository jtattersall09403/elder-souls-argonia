/**
 * Settlement at night (decision 0111 harness): the day scene's pieces at
 * full night with 100 lantern fixture lights in the scene's
 * FixtureLightField (render/fixtureLights), lit through the renderer's
 * fixture lighting: warm pools on the ground and the hut walls.
 */
import type { HarnessScene } from "../types";
import { buildSettlementScene } from "../settlementScene";

const settlementNight: HarnessScene = {
  name: "settlement-night",
  build(ctx) {
    return buildSettlementScene(ctx, true);
  },
};
export default settlementNight;
