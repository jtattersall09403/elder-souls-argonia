// Uniform upload counter. Injected before the page's scripts (measure.mjs, `diag=uniforms` spots only).
// Names which uniform three re-sends with a changed value (setValueV3f cache miss): counts uniform3f/3fv
// calls per (program SHADER_NAME, uniform name), plus uniform4f/4fv and uniformMatrix4fv totals for scale,
// and rAF frames so per-frame rates follow. Read: window.__DIAG__.uniforms().
// This probe wraps per-draw GL calls on purpose: diagnosis only, never on a headline spot (README "Probe rules").
(() => {
  const D = (window.__DIAG__ ??= {});
  const G = window.WebGL2RenderingContext?.prototype;
  if (!G) return;
  const names = new WeakMap(), progName = new WeakMap(), locName = new WeakMap();
  const counts = new Map(); // "shader\u0000uniform" -> calls
  const tot = { u3: 0, u4: 0, m4: 0 };
  let cur = null, frames = 0;
  const t0 = performance.now();
  const ss = G.shaderSource, at = G.attachShader, gl = G.getUniformLocation, up = G.useProgram;
  G.shaderSource = function (s, src) {
    const m = /#define SHADER_NAME (.*)/.exec(src);
    names.set(s, m ? m[1].trim() : (src.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "").slice(0, 60));
    return ss.call(this, s, src);
  };
  G.attachShader = function (p, s) { if (!progName.has(p)) progName.set(p, names.get(s)); return at.call(this, p, s); };
  G.getUniformLocation = function (p, n) { const l = gl.call(this, p, n); if (l) locName.set(l, n); return l; };
  G.useProgram = function (p) { cur = p; return up.call(this, p); };
  const key = (l) => `${(cur && progName.get(cur)) || "?"}\u0000${(l && locName.get(l)) || "?"}`;
  const count3 = (l) => { tot.u3++; const k = key(l); counts.set(k, (counts.get(k) ?? 0) + 1); };
  for (const f of ["uniform3f", "uniform3fv"]) { const o = G[f]; G[f] = function (l, ...a) { count3(l); return o.call(this, l, ...a); }; }
  for (const f of ["uniform4f", "uniform4fv"]) { const o = G[f]; G[f] = function (...a) { tot.u4++; return o.apply(this, a); }; }
  { const o = G.uniformMatrix4fv; G.uniformMatrix4fv = function (...a) { tot.m4++; return o.apply(this, a); }; }
  const tick = () => { frames++; requestAnimationFrame(tick); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
  const pf = (n) => (frames ? Math.round((n / frames) * 100) / 100 : null);
  D.uniforms = () => {
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, calls]) => {
      const [shaderName, uniformName] = k.split("\u0000");
      return { shaderName, uniformName, calls, callsPerFrame: pf(calls) };
    });
    return { frames, ms: Math.round(performance.now() - t0), distinct: counts.size,
      perFrame: { uniform3: pf(tot.u3), uniform4: pf(tot.u4), uniformMatrix4fv: pf(tot.m4) }, totals: tot, top };
  };
})();
