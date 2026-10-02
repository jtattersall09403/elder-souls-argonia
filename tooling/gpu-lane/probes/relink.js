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
  G.linkProgram = function (p) {
    const t = performance.now();
    const r = o.call(this, p);
    const dt = performance.now() - t;
    st.links++; st.ms += dt;
    st.perProgram.set(p, (st.perProgram.get(p) ?? 0) + 1);
    if (st.events.length < 2000) st.events.push([Math.round(t), Math.round(dt * 100) / 100, progName.get(p) ?? ""]);
    return r;
  };
  D.relink = () => {
    const per = [...st.perProgram.values()];
    return { links: st.links, linkMs: Math.round(st.ms * 100) / 100, distinctPrograms: per.length,
      relinked: per.filter((n) => n > 1).length, maxLinksOfOneProgram: per.length ? Math.max(...per) : 0,
      lastLinkAtMs: st.events.length ? st.events[st.events.length - 1][0] : null,
      linksAfter30s: st.events.filter(([t]) => t > 30000).length, events: st.events.slice(-40) };
  };
})();
