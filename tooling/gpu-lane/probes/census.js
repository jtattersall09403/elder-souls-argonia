// Per-draw census recorder. Injected before the page's scripts by measure.mjs --census (WebGL renderer).
// Hooks WebGLRenderer.renderBufferDirect (found through the instance assignment) and records, for
// the frames while D.census.on, every draw by owner (the object's top two named ancestors), layer mask,
// geometry and material uuid, plus whether the draw was empty. Read with window.__DIAG__.censusReport().
(() => {
  const D = (window.__DIAG__ ??= {});
  const S = (D.census = { on: false, frames: 0, R: null, scenes: new Set(), cur: null, acc: [] });
  const owner = (o) => { const c = []; let x = o; while (x && x.parent) { if (x.name) c.push(x.name); x = x.parent; } return c.slice(-2).reverse().join("/") || `(anon ${o.type})`; };
  const isEmpty = (geo, obj) => {
    if (obj.isInstancedMesh && obj.count === 0) return true;
    if (geo.isInstancedBufferGeometry && geo.instanceCount === 0) return true;
    const dr = geo.drawRange;
    if (dr && dr.count === 0) return true;
    const n = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
    return n === 0;
  };
  Object.defineProperty(Object.prototype, "renderBufferDirect", { configurable: true, set(v) {
    const R = this; S.R = R;
    const w = function (cam, scene, geo, mat, obj, grp) {
      if (S.on && S.cur) {
        if (scene) S.scenes.add(scene);
        const k = `${owner(obj)} | L${obj.layers?.mask ?? "?"}`;
        const e = (S.cur.own[k] ??= { draws: 0, empty: 0, mats: new Set() });
        e.draws++; e.mats.add(mat.uuid); if (isEmpty(geo, obj)) { e.empty++; S.cur.empty++; }
        S.cur.draws++; S.cur.mats.add(mat.uuid);
        const mo = (S.cur.matOwner[mat.uuid] ??= { name: mat.name || mat.type, owners: new Set(), draws: 0 }); mo.owners.add(k); mo.draws++;
      }
      return v.call(R, cam, scene, geo, mat, obj, grp);
    };
    Object.defineProperty(this, "renderBufferDirect", { value: w, writable: true, enumerable: true, configurable: true });
  } });
  // frame loop while on: one record per rAF.
  const tick = () => {
    if (S.on) {
      if (S.cur) S.acc.push(S.cur);
      S.cur = { draws: 0, empty: 0, own: {}, mats: new Set(), matOwner: {} };
      S.frames++;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // Static-matrix census: objects with matrixAutoUpdate on whose local matrix did not change in `ms`.
  D.matrixCensus = (ms) => new Promise((res) => {
    const scene = [...S.scenes].sort((a, b) => { let x = 0, y = 0; a.traverse(() => x++); b.traverse(() => y++); return y - x; })[0];
    if (!scene) return res(null);
    const snap = new Map(); let total = 0;
    scene.traverse((o) => { total++; if (o.matrixAutoUpdate) snap.set(o, o.matrix.elements.slice()); });
    const top = (o) => { let x = o; let n = null; while (x && x.parent) { if (x.name) n = x.name; x = x.parent; } return n ?? `(anon ${o.type})`; };
    setTimeout(() => {
      let still = 0, moved = 0; const by = {};
      for (const [o, e] of snap) {
        const same = o.matrix.elements.every((v, i) => v === e[i]);
        const m = (by[top(o)] ??= [0, 0]); if (same) { still++; m[0]++; } else { moved++; m[1]++; }
      }
      res({ objects: total, matrixAutoUpdateOn: snap.size, staticOver: ms, notMoved: still, moved,
        notMovedByTop: Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 15) });
    }, ms);
  });
  D.censusReport = () => {
    const F = S.acc.length || 1;
    const own = {}; const mats = new Set(); const matOwners = {};
    for (const f of S.acc) {
      for (const [k, e] of Object.entries(f.own)) { const o = (own[k] ??= { draws: 0, empty: 0 }); o.draws += e.draws / F; o.empty += e.empty / F; }
      for (const m of f.mats) mats.add(m);
      for (const [u, v] of Object.entries(f.matOwner)) { const t = (matOwners[u] ??= { name: v.name, owners: new Set(), draws: 0 }); t.draws += v.draws / F; for (const k of v.owners) t.owners.add(k); }
    }
    const last = S.acc[S.acc.length - 1];
    const r1 = (x) => Math.round(x * 10) / 10;
    return {
      frames: S.acc.length,
      drawsPerFrame: r1(S.acc.reduce((s, f) => s + f.draws, 0) / F),
      emptyDrawsPerFrame: r1(S.acc.reduce((s, f) => s + f.empty, 0) / F),
      distinctMaterialsPerFrame: r1(S.acc.reduce((s, f) => s + f.mats.size, 0) / F),
      distinctMaterialsOverRun: mats.size,
      materialsSharedAcrossOwners: Object.values(matOwners).filter((m) => m.owners.size > 1).length,
      byMaterial: Object.entries(matOwners).sort((a, b) => b[1].draws - a[1].draws).slice(0, 20).map(([u, m]) => [m.name, u.slice(0, 8), r1(m.draws), m.owners.size]),
      programs: S.R?.info?.programs?.length ?? null,
      byOwner: Object.entries(own).sort((a, b) => b[1].draws - a[1].draws).map(([k, e]) => [k, r1(e.draws), r1(e.empty)]),
      lastFrameDraws: last?.draws ?? null,
    };
  };
})();
