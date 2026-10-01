import type { WebGPURenderer } from "three/webgpu";

/**
 * Main-thread budget for node-material builds per animation frame (decision
 * 0111 §3, walk 7). three builds a material's node graph into shaders in JS,
 * synchronously, the first frame an object with that material is drawn
 * (`NodeManager.getForRender`). Character view's first frames bring hundreds
 * of new materials at once (the flora kit's 159 assets, the settlement kits,
 * the waterfall kit), and one frame that builds them all is a single task of
 * tens of seconds: Chrome's "not responding" on the owner's phone and M2.
 * With the budget, an object whose material is not built yet is drawn only
 * while this frame's builds have taken less than `budgetMs`; the rest wait a
 * frame, so the world fills in over a few seconds and every frame returns to
 * the browser. At least one build runs per frame, so the longest task is one
 * material's build.
 */
export const SHADER_BUILD_BUDGET_MS = 12;

/** Which builds run this frame: the pure part of the budget (unit-tested). */
export class BuildBudget {
  private frame = -1;
  private spentMs = 0;
  private builds = 0;
  /** Objects held back a frame so far (a measure for the HUD and the boot check). */
  deferred = 0;
  constructor(readonly budgetMs: number) {}
  /** May an unbuilt object build now, in frame `frameId`? */
  admit(frameId: number): boolean {
    if (frameId !== this.frame) { this.frame = frameId; this.spentMs = 0; this.builds = 0; }
    if (this.builds > 0 && this.spentMs >= this.budgetMs) { this.deferred++; return false; }
    return true;
  }
  /** A build admitted in the current frame took `ms`. */
  spend(ms: number): void { this.spentMs += ms; this.builds++; }
}

/** The three 0.184 internals the budget reads (Renderer, RenderObjects, NodeManager). */
interface RendererInternals {
  _renderObjectDirect: (...a: unknown[]) => void;
  _objects: { get: (...a: unknown[]) => object };
  _currentRenderContext: unknown;
  _nodes: {
    nodeFrame: { frameId: number };
    nodeBuilderCache: Map<unknown, unknown>;
    get(renderObject: object): { nodeBuilderState?: unknown };
    getForRenderCacheKey(renderObject: object): unknown;
  };
}

/**
 * Install the budget on a renderer (`budgetMs` <= 0 leaves it unbudgeted, as
 * the harness wants: its scenes compile up front and read their first frame).
 * Wraps the renderer's per-object draw: an object whose node-builder state is
 * neither on it nor in the shared cache would build now, and does so only
 * if the frame's budget admits it. Returns the budget for its counters.
 */
export function budgetShaderBuilds(renderer: WebGPURenderer, budgetMs = SHADER_BUILD_BUDGET_MS): BuildBudget | null {
  if (!(budgetMs > 0)) return null;
  const r = renderer as unknown as RendererInternals;
  const draw = r._renderObjectDirect;
  const budget = new BuildBudget(budgetMs);
  r._renderObjectDirect = function (this: RendererInternals, ...a: unknown[]) {
    const [object, material, scene, camera, lightsNode, , clippingContext, passId] = a;
    const ro = this._objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext, passId);
    const nodes = this._nodes;
    if (nodes.get(ro).nodeBuilderState !== undefined || nodes.nodeBuilderCache.has(nodes.getForRenderCacheKey(ro))) {
      draw.apply(this, a);
      return;
    }
    if (!budget.admit(nodes.nodeFrame.frameId)) return;
    const t = performance.now();
    draw.apply(this, a);
    budget.spend(performance.now() - t);
  };
  return budget;
}
