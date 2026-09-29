/**
 * Settlement by day (decision 0111 harness): real mud-kit huts, platforms,
 * fences and lanterns through the settlement kit loader and material
 * features (settlement/materials.ts: wetness under light rain, windows dark
 * by day), under the noon sun with its shadow.
 */
import type { HarnessScene } from "../types";
import { buildSettlementScene } from "../settlementScene";

const settlementDay: HarnessScene = {
  name: "settlement-day",
  build(ctx) {
    return buildSettlementScene(ctx, false);
  },
};
export default settlementDay;
