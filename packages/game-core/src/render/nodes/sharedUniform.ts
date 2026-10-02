import { renderGroup, uniform } from "three/tsl";

/**
 * A `uniform()` whose value is the same for every draw of a render call
 * (time, wind, fog and haze, sun and light rig, weather, the eye position the
 * app writes once per frame). It lives in three's shared `renderGroup`
 * buffer, written once per render call, instead of the default
 * `objectGroup`, which is compared and written into EVERY draw's own buffer
 * (engineering.md performance checklist; webgpu-diag-cpu §3).
 *
 * renderGroup, not frameGroup: three 0.184 bumps the frame id on every
 * `renderer.render` outside its animation loop (Renderer.js:903), so the two
 * behave alike here, renderGroup is already bound by every node material
 * (camera matrices), so it adds no bind group, and it stays right for a value
 * written between two render calls of one frame (a cascade or a reflection).
 *
 * Never for a value that differs per object within one render call (an
 * `onObjectUpdate` uniform, or one written in `Object3D.onBeforeRender` and
 * shared by several objects): those stay on objectGroup.
 */
export const sharedUniform = ((value: unknown, type?: unknown) =>
  (uniform as (v: unknown, t?: unknown) => { setGroup(g: unknown): unknown })(value, type).setGroup(renderGroup)) as typeof uniform;
