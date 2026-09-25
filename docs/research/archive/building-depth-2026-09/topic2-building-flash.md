# Topic 2: buildings flash out while moving; sconce-wall base flickers after stop

One cause behind both symptoms: the effect cleanup in SettlementLayer wipes the live group every time the build re-keys.
The detached-build swap (SettlementLayer.tsx:472-477, 631-634) is defeated by the cleanup at :697-701:
    return () => { running.current?.cancel(); running.current = null;
      if (root.current) disposeChildren(root.current); };
`revision` is in the effect deps (:702). Every revision bump runs this cleanup, so the live group is emptied at once.
The new build then runs sliced at priority 40 (:685-686): it yields every 64 placements (:498) and once per draw bucket (:573),
so nothing is drawn until the swap at :634 lands (one frame or more, depending on the budget).

Triggers:
- Moving: revision++ when the focus moves more than min(40 m, coveredRadius*0.5) (:437-439). The layer rebuilds every <=40 m of walk, and each rebuild blanks every building.
- Stopped: revision++ every 2000 ms while `incomplete` is set (:441-443). `incomplete` is set when resolvePlaced returns null because the ground is not loaded under a placement (:510-511).
  After a stop, terrain tiles and sub-tiles keep arriving for seconds. Until every placement resolves, the layer blanks and rebuilds every 2 s.
  That matches the "flashed every ~2 s" skirt report (16h brief:461) and "the base flickers for seconds after the camera stops" (brief:465-466).
  The skirt shows it most because treatmentMesh returns null whenever any vertex's ground is null (:211-212). It then comes and goes build to build on top of the wipe.
- Also: `kits` / `manifests` change whenever a new GLB or manifest lands while walking (:420, :411, deps :702). Each one is another wipe.

Candidates ruled out:
- LOD rung swap: the level is chosen per build (:520-522) and swapped whole at :632-634. No frame without a rung unless the cleanup has already wiped the group.
- Remount on tile change: the layer is keyed statically (:718). groundAt is memoised on [world, verticalScale] (CharacterMode.tsx:230-234). No tile code in the layer.
- Frustum bounds: three r184 InstancedMesh computes its bounding sphere from the instance matrices. The matrices are set before the add (:591-592). The far merge is baked geometry (lod.ts:94-117).
- Shader compile: r184 render() never skips a program that is not ready. isReady is used only in compileAsync (WebGLRenderer.js:1495). A recompile stalls the frame; it does not blank it.
  The materials are still re-patched each build: a new MeshDepthMaterial every time (materials.ts:43), and needsUpdate if CSM replaced the hook (materials.ts:124).
- polygonOffset z-fight: the skirt uses depthWrite:false, offset -2/-4 (:225-227). That would flicker continuously, not stop after seconds. The band is also CUT by ruling 1.
- Cascade swaps: these move shadows only. The layer receives shadows; its geometry does not depend on them.

Probe (none exists): no script records settlement visibility per frame. The proof is only published at build end (:667).
Extend apps/world-studio/scripts/probe-frame-work.mjs, which walks a site and samples window globals.
Add a dev-only counter, e.g. `__STUDIO_SETTLEMENT_DEBUG__.liveChildren` set in useFrame from root.current.children.length, plus a wipe/swap counter.
Sample it every rAF during a scripted walk at the yard and a 10 s stand-still. Any frame with liveChildren==0 after first load is the defect.
Pass: zero such frames, both walking and stopped.

Fix at the root:
1. The cleanup must dispose the live group only on unmount or when baseUrl or bundle change.
   Split it: an unmount-only effect disposes root.current, and the build effect's cleanup only cancels the running job.
   The in-flight `next` is already disposed by the generator's finally (:678-681).
2. Stop the 2 s full-layer retry. Rebuild the incomplete placements only when the terrain reports new tiles (an event or revision from the terrain streamer), not on a wall-clock loop.
   Or keep the loop but let it swap only when the result differs.
3. Minor: reuse one depth material per colour material (a WeakMap). Call reapply only when the hook changed. This avoids per-build program churn and stalls.
