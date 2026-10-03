// Per-frame draw counter. Injected before the page's scripts (measure.mjs, `diag=draws` spots only).
// Per rAF frame: page ms, total draw calls, total instances and draws per program SHADER_NAME (top 6).
// Wraps drawElements/drawArrays/(Instanced) and useProgram; frames are cut by a requestAnimationFrame hook.
// Ring of the last 4000 frames. Read: window.__DIAG__.draws().
// This probe wraps per-draw GL calls on purpose: diagnosis only, never on a headline spot (README "Probe rules").
(() => {
  const D = (window.__DIAG__ ??= {});
  const G = window.WebGL2RenderingContext?.prototype;
  if (!G) return;
  const RING = 4000;
  const names = new WeakMap(), progName = new WeakMap();
  const nameId = new Map(), nameList = []; // shaderName -> id (index into nameList)
  const idOf = (n) => { let i = nameId.get(n); if (i === undefined) { i = nameList.length; nameId.set(n, i); nameList.push(n); } return i; };
  const counts = []; // counts[id] = draws this frame (reused array)
  let curId = idOf("?"), draws = 0, inst = 0;
  const ring = new Array(RING);
  let head = 0, n = 0;
  const ss = G.shaderSource, at = G.attachShader, up = G.useProgram;
  G.shaderSource = function (s, src) {
    const m = /#define SHADER_NAME (.*)/.exec(src);
    names.set(s, m ? m[1].trim() : (src.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "").slice(0, 60));
    return ss.call(this, s, src);
  };
  G.attachShader = function (p, s) { if (!progName.has(p)) progName.set(p, idOf(names.get(s) ?? "?")); return at.call(this, p, s); };
  G.useProgram = function (p) { curId = (p && progName.get(p)) ?? 0; return up.call(this, p); };
  const hit = (k) => { draws++; inst += k; counts[curId] = (counts[curId] | 0) + 1; };
  for (const f of ["drawElements", "drawArrays"]) { const o = G[f]; G[f] = function (...a) { hit(1); return o.apply(this, a); }; }
  { const o = G.drawElementsInstanced; G.drawElementsInstanced = function (...a) { hit(a[4] | 0); return o.apply(this, a); }; }
  { const o = G.drawArraysInstanced; G.drawArraysInstanced = function (...a) { hit(a[3] | 0); return o.apply(this, a); }; }
  const cut = () => {
    const top = [];
    for (let i = 0; i < counts.length; i++) if (counts[i]) top.push([i, counts[i]]);
    top.sort((a, b) => b[1] - a[1]);
    ring[head] = { t: Math.round(performance.now() * 10) / 10, draws, inst, top: top.slice(0, 6).map(([i, c]) => [nameList[i], c]) };
    head = (head + 1) % RING; if (n < RING) n++;
    counts.fill(0); draws = 0; inst = 0;
  };
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    return raf.call(this, (t) => { cut(); return cb(t); });
  };
  D.draws = () => {
    const frames = [];
    for (let i = 0; i < n; i++) frames.push(ring[(head - n + i + RING * 2) % RING]);
    return { frames, shaderNames: nameList.slice() };
  };
})();
