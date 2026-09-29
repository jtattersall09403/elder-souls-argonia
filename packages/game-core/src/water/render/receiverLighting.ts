import type { NodeBuilder, NodeMaterial } from "three/webgpu";
import type { TslNode } from "../../render/nodes/materialNodes";

/** The lighting context a lighting model's `finish` sees (LightsNode.setup). */
export interface LightingFinishContext {
  outgoingLight: TslNode;
  reflectedLight: { directDiffuse: TslNode; directSpecular: TslNode; indirectDiffuse: TslNode; indirectSpecular: TslNode };
}

/** Run `fn` after the material's lighting model has finished (the old
 * opaque_fragment patch point with `reflectedLight` still in
 * scope): e.g. `ctx.outgoingLight.addAssign(ctx.reflectedLight.directDiffuse.mul(k))`.
 * Wraps `setupLightingModel`, so several wrappers compose in call order and
 * the previous model (physical, standard, ...) keeps its own finish. */
export function wrapLightingFinish(material: NodeMaterial,
  fn: (context: LightingFinishContext, builder: NodeBuilder) => void): void {
  type Model = { finish(builder: NodeBuilder): void } | null | undefined;
  const target = material as unknown as { setupLightingModel(builder: NodeBuilder): Model };
  const previous = target.setupLightingModel.bind(material);
  target.setupLightingModel = (builder: NodeBuilder) => {
    const model = previous(builder);
    if (!model) return model;
    const finish = model.finish.bind(model);
    model.finish = (b: NodeBuilder) => {
      finish(b);
      fn((b as unknown as { context: LightingFinishContext }).context, b);
    };
    return model;
  };
  material.needsUpdate = true;
}
