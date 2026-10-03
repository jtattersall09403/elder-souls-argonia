// B1 (perf-diag23b): is the bracken clump dark because of receiveShadow or the material side?
// Read: await window.__DIAG__.bracken() (after capture-lib.js). Finds the Vegetation InstancedMeshes (userData.perfTag === "veg")
// whose mesh, geometry or material name contains "espfernbrakencluster05" (Vegetation.tsx tags no species: with no match it falls
// back to the 4 veg meshes with the nearest instances, says `byName:false` and lists the names it saw). Captures the mean luma of the
// clump region (the projected boxes of the 12 nearest instances) and of the whole frame for: as is, receiveShadow=false,
// side=FrontSide; each restored after.
(() => {
  const D = (window.__DIAG__ ??= {});
  const SPECIES = /espfernbrakencluster05/i;
  D.bracken = async () => {
    const { R, scene, camera } = D.grab ?? {};
    if (!R || !scene) return { error: "no renderer/scene captured" };
    const V3 = camera.position.constructor; // THREE.Vector3 without importing three
    const veg = [];
    scene.traverse((o) => { if (o.isInstancedMesh && o.userData?.perfTag === "veg" && (o.count ?? 0) > 0) veg.push(o); });
    const nm = (o) => [o.name, o.geometry?.name, ...[].concat(o.material).map((m) => m?.name)].filter(Boolean).join("|");
    const dists = (o) => { // [distSq, x, y, z] of every instance, nearest first
      const a = o.instanceMatrix.array, p = camera.position, arr = [];
      for (let i = 0; i < o.count; i++) { const dx = a[i * 16 + 12] - p.x, dy = a[i * 16 + 13] - p.y, dz = a[i * 16 + 14] - p.z; arr.push([dx * dx + dy * dy + dz * dz, a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]]); }
      return arr.sort((x, y) => x[0] - y[0]);
    };
    let meshes = veg.filter((o) => SPECIES.test(nm(o)));
    const byName = meshes.length > 0;
    if (!byName) meshes = veg.map((o) => [o, dists(o)[0]?.[0] ?? 1e18]).sort((a, b) => a[1] - b[1]).slice(0, 4).map((x) => x[0]);
    const pts = meshes.flatMap((o) => dists(o).slice(0, 12)).sort((x, y) => x[0] - y[0]).slice(0, 12);
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, used = 0;
    const v = new V3();
    for (const q of pts) for (const dx of [-1, 1]) for (const dy of [0, 1.5]) for (const dz of [-1, 1]) {
      v.set(q[1] + dx, q[2] + dy, q[3] + dz).project(camera);
      if (v.z > 1) continue;
      x0 = Math.min(x0, (v.x + 1) / 2); x1 = Math.max(x1, (v.x + 1) / 2); y0 = Math.min(y0, (1 - v.y) / 2); y1 = Math.max(y1, (1 - v.y) / 2); used++;
    }
    const clamp = (t) => Math.max(0, Math.min(1, t));
    const rect = used && x1 > x0 && y1 > y0 ? { x0: clamp(x0), y0: clamp(y0), x1: clamp(x1), y1: clamp(y1) } : null;
    const mats = [...new Set(meshes.flatMap((o) => [].concat(o.material)))];
    const shoot = async () => { await D.nextFrame(); return { clump: D.frameLuma(rect), frame: D.frameLuma(null) }; };
    const out = { byName, meshes: meshes.length, instances: meshes.reduce((s, o) => s + o.count, 0), nearestM: pts[0] ? Math.round(Math.sqrt(pts[0][0]) * 100) / 100 : null, rect, names: meshes.slice(0, 6).map(nm), vegMeshes: veg.length };
    out.asIs = await shoot();
    const rs = meshes.map((o) => o.receiveShadow);
    meshes.forEach((o) => { o.receiveShadow = false; }); mats.forEach((m) => { m.needsUpdate = true; });
    out.noReceiveShadow = await shoot();
    meshes.forEach((o, i) => { o.receiveShadow = rs[i]; }); mats.forEach((m) => { m.needsUpdate = true; });
    const sides = mats.map((m) => m.side);
    mats.forEach((m) => { m.side = 0; m.needsUpdate = true; }); // THREE.FrontSide
    out.frontSide = await shoot();
    mats.forEach((m, i) => { m.side = sides[i]; m.needsUpdate = true; });
    out.sides = sides; out.receiveShadow = rs;
    return out;
  };
})();
