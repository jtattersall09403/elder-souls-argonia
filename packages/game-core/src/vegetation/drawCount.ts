/**
 * Set an instanced mesh's draw count and hide it while it draws nothing
 * (perf10 O1). three's projectObject skips an invisible object in every pass,
 * the shadow-depth passes included, so an empty batch costs no
 * renderBufferDirect walk; at Greenspring noon 660 of 1508 calls were empty.
 */
export interface CountedDraw {
  count: number;
  visible: boolean;
}

export function setDrawCount(mesh: CountedDraw, count: number): void {
  mesh.count = count;
  mesh.visible = count > 0;
}
