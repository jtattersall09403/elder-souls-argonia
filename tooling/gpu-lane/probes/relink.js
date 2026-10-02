// Program-relink counter. Injected before the page's scripts (measure.mjs --diag relink).
// Counts gl.linkProgram calls (every three.js program compile/relink) with the time each took on
// the main thread, and the programs that were linked more than once. Read: window.__DIAG__.relink().
(() => {
  const D = (window.__DIAG__ ??= {});
  const st = { links: 0, ms: 0, perProgram: new Map(), events: [] };
  const G = window.WebGL2RenderingContext?.prototype;
  if (!G) return;
  const o = G.linkProgram;
  G.linkProgram = function (p) {
    const t = performance.now();
    const r = o.call(this, p);
    const dt = performance.now() - t;
    st.links++; st.ms += dt;
    st.perProgram.set(p, (st.perProgram.get(p) ?? 0) + 1);
    if (st.events.length < 2000) st.events.push([Math.round(t), Math.round(dt * 100) / 100]);
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
