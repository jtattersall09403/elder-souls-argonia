/**
 * Set an instanced mesh's draw count and hide it while it draws nothing
 * (perf10 O1). three's projectObject skips an invisible object in every pass,
 * the shadow-depth passes included, so an empty batch costs no
 * renderBufferDirect walk; at Greenspring noon 660 of 1508 calls were empty.
 * A mesh `held` while its program links (Vegetation `holdUntilLinked`) stays
 * hidden whatever its count.
 */
export interface CountedDraw {
  count: number;
  visible: boolean;
}

export function setDrawCount(mesh: CountedDraw, count: number, held = false): void {
  mesh.count = count;
  mesh.visible = !held && count > 0;
}

/** A pool member whose program may still be linking. */
export interface HeldDraw {
  mesh: CountedDraw;
  count: number;
  held: boolean;
}

/**
 * End a member's link hold: it shows only if it has copies to draw (perf10
 * c9 F38: showing every linked rung regardless of its count left 509 empty
 * vegetation draws per frame at Greenspring noon, since every rung of a cell
 * is resident ahead of its band at count 0).
 */
export function releaseHeld(target: HeldDraw): void {
  target.held = false;
  setDrawCount(target.mesh, target.count);
}
