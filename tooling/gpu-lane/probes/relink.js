// Program-relink counter. Injected before the page's scripts (measure.mjs --diag relink).
// Counts gl.linkProgram calls (every three.js program compile/relink) with the time each took on
// the main thread, and the programs that were linked more than once. Read: window.__DIAG__.relink().
(() => {
  const D = (window.__DIAG__ ??= {});
  const st = { links: 0, ms: 0, perProgram: new Map(), events: [], recs: [] };
  const G = window.WebGL2RenderingContext?.prototype;
  if (!G) return;
  // Each event names its program: three's `#define SHADER_NAME` (the material's name) or its first
  // vertex-shader line, so a link during a walk can be traced to the object that first drew it.
  const names = new WeakMap(), progName = new WeakMap();
  const ss = G.shaderSource, at = G.attachShader, o = G.linkProgram;
  G.shaderSource = function (s, src) {
    const m = /#define SHADER_NAME (.*)/.exec(src);
    names.set(s, m ? m[1].trim() : (src.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "").slice(0, 60));
    return ss.call(this, s, src);
  };
  G.attachShader = function (p, s) { if (!progName.has(p)) progName.set(p, names.get(s)); return at.call(this, p, s); };
  // Nothing here wraps a function three calls per draw at steady state (README "Probe rules"; perf-diag6 C1).
  // The owner of a draw link comes from a `renderBufferDirect` hook that exists only while links happen: armed
  // when the renderer is built and re-armed by any link, removed after IDLE_MS with no link, so a settled frame
  // calls three's own function. A link while it is disarmed (or inside renderer.compile) reads owner
  // "(outside draw)" with the type from the program name; a disarmed link re-arms the hook.
  const IDLE_MS = 5000;
  const cur = { mat: null, obj: null, warm: 0, warmMats: [] };
  // Every material a compile/compileAsync was handed (C3: a draw link of a material never warmed is `first`).
  const warmed = new WeakSet();
  const chain = (o, max = 8) => { const a = []; for (let n = o?.parent; n && a.length < max; n = n.parent) a.push(n.name || n.type); return a; };
  // An owner with no name: enough to find it in the scene without a second run.
  const detail = (m, o) => ({ objName: o?.name || "", objType: o?.type || "", userData: Object.keys(o?.userData || {}).slice(0, 8),
    parents: chain(o, 8), matName: m?.name || "", matUuid: String(m?.uuid ?? "").slice(0, 8) });
  // The materials a compile call warms, read from its arguments: every object under the scene/object
  // argument(s) (a material or a material array) and each scene's overrideMaterial.
  const materialsOf = (args) => {
    const out = new Set();
    const add = (m) => { if (Array.isArray(m)) m.forEach(add); else if (m?.isMaterial) out.add(m); };
    const walk = (o) => { if (!o || typeof o !== "object") return; add(o.material); for (const c of o.children ?? []) walk(c); };
    for (const x of args) { if (x?.isCamera) continue; add(x?.overrideMaterial); walk(x); }
    return [...out];
  };
  // compile / compileAsync are wrapped for good: three calls them only to warm, never per draw. Links inside
  // the synchronous call are `warm` (compileAsync links in its sync part; its promise is never awaited, so a
  // promise that never settles changes nothing). Wrapped one tick after the renderer's constructor.
  const hookWarm = (R) => {
    for (const k of ["compile", "compileAsync"]) {
      const f = R[k];
      if (typeof f !== "function") continue;
      R[k] = function (...a) {
        const mats = materialsOf(a), before = cur.warmMats;
        for (const m of mats) warmed.add(m);
        cur.warm++; cur.warmMats = mats;
        try { return f.apply(this, a); } finally { cur.warm--; cur.warmMats = before; }
      };
    }
  };
  const hook = { R: null, orig: null, wrap: null, armed: false, timer: 0 };
  const put = (fn) => Object.defineProperty(hook.R, "renderBufferDirect", { value: fn, writable: true, enumerable: true, configurable: true });
  const disarm = () => { if (hook.armed) { put(hook.orig); hook.armed = false; } };
  const arm = () => {
    if (!hook.R) return;
    const st_ = window.setTimeout ? window : globalThis;
    st_.clearTimeout?.(hook.timer);
    hook.timer = st_.setTimeout?.(disarm, IDLE_MS);
    if (!hook.armed) { put(hook.wrap); hook.armed = true; }
  };
  D.relinkHookArmed = () => hook.armed;
  const prev = Object.getOwnPropertyDescriptor(Object.prototype, "renderBufferDirect");
  Object.defineProperty(Object.prototype, "renderBufferDirect", { configurable: true, set(v) {
    if (prev?.set) { prev.set.call(this, v); v = this.renderBufferDirect; }
    const R = this;
    st.renderer = R;
    Promise.resolve().then(() => hookWarm(R));
    hook.R = R; hook.orig = v; hook.armed = false;
    hook.wrap = function (cam, scene, geo, mat, obj, grp) {
      const pm = cur.mat, po = cur.obj; cur.mat = mat; cur.obj = obj;
      try { return v.call(R, cam, scene, geo, mat, obj, grp); } finally { cur.mat = pm; cur.obj = po; }
    };
    arm();
  } });
  // A warm link's material: the one material the compile was handed, else the one whose name (or type) is the program's SHADER_NAME.
  const warmMat = (p) => {
    const ms = cur.warmMats;
    if (ms.length === 1) return ms[0];
    const n = progName.get(p), hit = ms.filter((m) => (m.name || m.type) === n);
    return hit.length === 1 ? hit[0] : null;
  };
  const describe = (p, t) => {
    const m = cur.mat, o = cur.obj, warm = cur.warm > 0;
    if (!m) return { type: progName.get(p) || "unknown", name: "", owner: "(outside draw)", parents: [], depth: false, transparent: null, defines: [], key: "", t, warm,
      matUuid: warm ? String(warmMat(p)?.uuid ?? "") : "" };
    let key = ""; try { key = String(m.customProgramCacheKey?.() ?? "").slice(0, 80); } catch { key = "(throws)"; }
    const own = o?.material, override = m.type === "MeshDepthMaterial" || m.type === "MeshDistanceMaterial" || (own != null && (Array.isArray(own) ? !own.includes(m) : own !== m));
    const r = { type: m.type, name: m.name || "", owner: o?.name || o?.type || "(unnamed object)", parents: chain(o),
      depth: override, transparent: !!m.transparent, defines: Object.keys(m.defines || {}), key, t, warm, matUuid: String(m.uuid ?? "") };
    if (!warm && !warmed.has(m)) r.first = true;
    if (!o?.name) r.detail = detail(m, o);
    return r;
  };
  // 32-bit FNV-1a of the full key, hex.
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
  // three's WebGLProgram (renderer.info.programs) is pushed AFTER its link, so a link's full cacheKey is
  // read at report time, by the GL program object.
  const keyOf = (p) => { const e = (st.renderer?.info?.programs ?? []).find((x) => x.program === p); return e?.cacheKey == null ? null : String(e.cacheKey); };
  D.relink = () => {
    const per = [...st.perProgram.values()];
    const full = new Map();
    for (const r of st.recs) { if (!full.has(r.p)) full.set(r.p, keyOf(r.p)); }
    const fill = (info, p) => { const k = full.get(p) ?? keyOf(p); info.progKey = k == null ? null : k.slice(0, 400); info.progKeyHash = k == null ? null : hash(k); };
    for (const r of st.recs) fill(r.info, r.p);
    // Per material uuid: every warm key and every draw key (full cacheKey, one per hash). A draw key not among
    // the warm keys is a mismatch: the nearest warm key (fewest differing fields) and every differing
    // ','-separated field (index, warm value, draw value).
    const by = new Map();
    for (const r of st.recs) {
      const u = r.info.matUuid, k = full.get(r.p); if (!u || k == null) continue;
      const e = by.get(u) ?? by.set(u, { warm: new Map(), draw: new Map() }).get(u);
      e[r.info.warm ? "warm" : "draw"].set(hash(k), k);
    }
    const diffs = (w, d) => {
      const a = w.split(","), b = d.split(","), out = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) out.push({ index: i, warm: String(a[i] ?? "").slice(0, 120), draw: String(b[i] ?? "").slice(0, 120) });
      return out;
    };
    const materials = {};
    for (const [u, e] of by) {
      if (!e.warm.size || !e.draw.size) continue;
      const mismatches = [];
      for (const [dh, dk] of e.draw) {
        if (e.warm.has(dh)) continue;
        let best = null;
        for (const [wh, wk] of e.warm) { const d = diffs(wk, dk); if (!best || d.length < best.diffs.length) best = { nearestWarmHash: wh, diffs: d }; }
        mismatches.push({ drawHash: dh, ...best });
      }
      materials[u.slice(0, 8)] = { warmHashes: [...e.warm.keys()], drawHashes: [...e.draw.keys()], same: !mismatches.length, mismatches };
    }
    return { links: st.links, linkMs: Math.round(st.ms * 100) / 100, distinctPrograms: per.length,
      relinked: per.filter((n) => n > 1).length, maxLinksOfOneProgram: per.length ? Math.max(...per) : 0,
      lastLinkAtMs: st.events.length ? st.events[st.events.length - 1][0] : null,
      linksAfter30s: st.events.filter(([t]) => t > 30000).length, materials, events: st.events.slice(-400) };
  };
  G.linkProgram = function (p) {
    const info = describe(p, Math.round(performance.now()));
    const t = performance.now();
    const r = o.call(this, p);
    arm();
    const dt = performance.now() - t;
    st.links++; st.ms += dt;
    st.perProgram.set(p, (st.perProgram.get(p) ?? 0) + 1);
    if (st.events.length < 2000) { st.events.push([Math.round(t), Math.round(dt * 100) / 100, progName.get(p) ?? "", info]); st.recs.push({ p, info }); }
    return r;
  };
})();
