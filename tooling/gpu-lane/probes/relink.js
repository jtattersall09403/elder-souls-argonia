// Program-relink counter. Injected before the page's scripts (measure.mjs --diag relink).
// Counts gl.linkProgram calls (every three.js program compile/relink) with the time each took on
// the main thread, and the programs that were linked more than once. Read: window.__DIAG__.relink().
(() => {
  const D = (window.__DIAG__ ??= {});
  const st = { links: 0, ms: 0, perProgram: new Map(), events: [] };
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
  // The object and material behind a link: three links programs inside renderBufferDirect (draw, shadow
  // depth pass, warm-up render), so the hook records its material and object for the call's duration.
  // A link outside it (renderer.compile) is tagged owner "(outside draw)" with the type read from the program name.
  const cur = { mat: null, obj: null };
  const chain = (o, max = 3) => { const a = []; for (let n = o?.parent; n && a.length < max; n = n.parent) a.push(n.name || n.type); return a; };
  // An owner with no name: enough to find it in the scene without a second run.
  const detail = (m, o) => ({ objName: o?.name || "", objType: o?.type || "", userData: Object.keys(o?.userData || {}).slice(0, 5),
    parents: chain(o, 5), matName: m?.name || "", matUuid: String(m?.uuid ?? "").slice(0, 8) });
  const prev = Object.getOwnPropertyDescriptor(Object.prototype, "renderBufferDirect");
  Object.defineProperty(Object.prototype, "renderBufferDirect", { configurable: true, set(v) {
    if (prev?.set) { prev.set.call(this, v); v = this.renderBufferDirect; }
    const R = this;
    const w = function (cam, scene, geo, mat, obj, grp) {
      const pm = cur.mat, po = cur.obj; cur.mat = mat; cur.obj = obj;
      try { return v.call(R, cam, scene, geo, mat, obj, grp); } finally { cur.mat = pm; cur.obj = po; }
    };
    Object.defineProperty(this, "renderBufferDirect", { value: w, writable: true, enumerable: true, configurable: true });
  } });
  const describe = (p, t) => {
    const m = cur.mat, o = cur.obj;
    if (!m) return { type: progName.get(p) || "unknown", name: "", owner: "(outside draw)", parents: [], depth: false, transparent: null, defines: [], key: "", t };
    let key = ""; try { key = String(m.customProgramCacheKey?.() ?? "").slice(0, 80); } catch { key = "(throws)"; }
    const own = o?.material, override = m.type === "MeshDepthMaterial" || m.type === "MeshDistanceMaterial" || (own != null && (Array.isArray(own) ? !own.includes(m) : own !== m));
    const r = { type: m.type, name: m.name || "", owner: o?.name || o?.type || "(unnamed object)", parents: chain(o),
      depth: override, transparent: !!m.transparent, defines: Object.keys(m.defines || {}), key, t };
    if (!o?.name) r.detail = detail(m, o);
    return r;
  };
  G.linkProgram = function (p) {
    const info = describe(p, Math.round(performance.now()));
    const t = performance.now();
    const r = o.call(this, p);
    const dt = performance.now() - t;
    st.links++; st.ms += dt;
    st.perProgram.set(p, (st.perProgram.get(p) ?? 0) + 1);
    if (st.events.length < 2000) st.events.push([Math.round(t), Math.round(dt * 100) / 100, progName.get(p) ?? "", info]);
    return r;
  };
  D.relink = () => {
    const per = [...st.perProgram.values()];
    return { links: st.links, linkMs: Math.round(st.ms * 100) / 100, distinctPrograms: per.length,
      relinked: per.filter((n) => n > 1).length, maxLinksOfOneProgram: per.length ? Math.max(...per) : 0,
      lastLinkAtMs: st.events.length ? st.events[st.events.length - 1][0] : null,
      linksAfter30s: st.events.filter(([t]) => t > 30000).length, events: st.events.slice(-400) };
  };
})();
