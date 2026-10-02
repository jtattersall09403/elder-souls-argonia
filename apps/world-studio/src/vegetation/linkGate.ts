import type * as THREE from "three";
import { LINK_HELD, applyVisibility, type VisibleRule } from "@elder-souls/game-core/vegetation/drawCount";

/**
 * Withhold a freshly built rung mesh until its program has linked (perf10
 * f11, 16k walk 10 D1: RockCliff01 CSM programs linked synchronously on the
 * frame their rung first drew, 37 ms of GetProgramiv/GetShaderiv). The mesh
 * is marked held (`LINK_HELD`) and hidden while `link` (DrawTargetLinker)
 * runs off the critical path; every visibility write meanwhile goes through
 * `applyVisibility`, which keeps a held mesh dark. Once the link settles,
 * failed or not, the hold lifts and the mesh's own path `rule` decides
 * (drawCount.ts), never a forced `visible = true`. `current` re-reads the
 * mesh because `growGeo` may have replaced it.
 */
export function holdUntilLinked(
  mesh: THREE.Object3D,
  link: (object: THREE.Object3D) => Promise<unknown>,
  current: () => THREE.Object3D,
  rule: VisibleRule,
): void {
  mesh.userData[LINK_HELD] = true;
  mesh.visible = false;
  const show = () => {
    const now = current();
    delete mesh.userData[LINK_HELD];
    delete now.userData[LINK_HELD];
    applyVisibility(now as unknown as Parameters<typeof applyVisibility>[0], rule);
  };
  let settled: Promise<unknown>;
  try { settled = link(mesh); } catch (err) { settled = Promise.reject(err); }
  settled.then(show, show);
}
