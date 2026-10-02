import type * as THREE from "three";

/**
 * Withhold a freshly built rung mesh until its program has linked (perf10
 * f11, 16k walk 10 D1: RockCliff01 CSM programs linked synchronously on the
 * frame their rung first drew, 37 ms of GetProgramiv/GetShaderiv). The mesh
 * stays hidden while `link` (DrawTargetLinker `link`, KHR_parallel_shader_compile
 * through `compileAsync`) runs off the critical path; the rung it replaces
 * keeps drawing meanwhile, since every rung of a cell is resident ahead of
 * its band (Vegetation `geoFor`). `show` runs once the link settles, failed
 * or not, so a rejected link never leaves a rung dark; a compile that never
 * settles counts as settled after DrawTargetLinker's LINK_SETTLE_MS (perf10
 * diag 6 C1b), so a hung link never leaves one dark either; it re-reads the
 * current mesh because `growGeo` may have replaced it.
 */
export function holdUntilLinked(
  mesh: THREE.Object3D,
  link: (object: THREE.Object3D) => Promise<unknown>,
  show: () => void,
): void {
  mesh.visible = false;
  let settled: Promise<unknown>;
  try { settled = link(mesh); } catch (err) { settled = Promise.reject(err); }
  settled.then(show, show);
}
