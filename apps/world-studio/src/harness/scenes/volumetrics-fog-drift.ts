/**
 * Harness shot "volumetrics-fog-drift" (vol10 fix A): the marsh dusk ground fog with the harness clock
 * run 120x, so the three presented frames are minutes apart and show the fog's drift, morph and
 * burn-off edges moving (fogNoise FogDrift) rather than one frozen instant.
 */
import type { HarnessContext, HarnessScene } from "../types";
import { volumetricsShot } from "../volumetricsScene";

const base = volumetricsShot("marsh-dusk-groundfog", false);

const scene: HarnessScene = {
  ...base,
  name: "volumetrics-fog-drift",
  async build(ctx: HarnessContext) {
    const built = await base.build(ctx);
    return { ...built, frame: (t: number) => built.frame?.(t * 120) };
  },
};
export default scene;
