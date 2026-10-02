/**
 * One visibility rule per draw path, applied everywhere a vegetation mesh's
 * visibility changes (16k walk 10 S2/S3: the link gate forced visible = true
 * and undid the empty-draw hiding). The caller builds the rule once per
 * mesh and passes it; nothing here picks a path.
 * - CPU tile path: visible while it draws, `count > 0` (perf10 O1: three's
 *   projectObject skips an invisible object in every pass, shadows included).
 * - GPU-cull path: visible while the mesh is registered with the cull pool;
 *   the count is the compute pass's, never a reason to show or hide.
 * A mesh held by the link gate (`LINK_HELD` in userData) stays hidden
 * whatever its rule says until its program has linked (linkGate.ts).
 */
export type VisibleRule = () => boolean;

export interface CountedDraw {
  count: number;
  visible: boolean;
  userData: Record<string, unknown>;
}

export const LINK_HELD = "esLinkHeld";

export function applyVisibility(mesh: CountedDraw, rule: VisibleRule): void {
  mesh.visible = !mesh.userData[LINK_HELD] && rule();
}

export function setDrawCount(mesh: CountedDraw, count: number, rule: VisibleRule): void {
  mesh.count = count;
  applyVisibility(mesh, rule);
}
