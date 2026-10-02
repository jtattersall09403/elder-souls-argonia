/**
 * `pod-capture.mjs --probe-targets` (diagnosis only; never a bar row; webgpu-diag14 Q2, diag15). Splits "native WebGPU
 * renders black" into the stage that loses the picture. Installed by the init script before the app's scripts;
 * `win.__targetProbe.capture()` is called once after the settled read.
 *
 * capture(): over two whole rAF frames it logs every renderer.setRenderTarget (target id, size, samples, type, depth,
 * texture name, draws issued until the next setRenderTarget; null = canvas) and, on WebGPU, every
 * GPUCommandEncoder.beginRenderPass descriptor (`recordPassDescriptor`) with the draws issued until its end(). Draws
 * are counted at the API (GPURenderPassEncoder draw*, WebGL2 draw*), so both backends report them.
 * The scene target is found by identity: the target the frame set that is registered with deferBuildsInto
 * (renderer.esBuildQueue.frameTargets, the WaterPipeline pass-1 drawTarget); without a queue, the depth target that
 * received the most draws (`sceneBy` says which). `fb` = renderer._frameBufferTargets; `bloom` = the largest remaining
 * target followed by one of half its width. A multisampled target (samples > 1) is never read directly: it is listed
 * with `skipped`. Readback (renderer.readRenderTargetPixelsAsync) gives centre and 9-point mean luma (Rec.709 of
 * linear RGB as stored). `queue`: skippedDraws delta over the window, per frame, and the not-ready (pending) count.
 * The canvas luma is the harness's screenshot screen-middle luma (pod-capture.mjs). Self-contained: stringified.
 */

/** One beginRenderPass descriptor as a plain record. `texOf(view)` maps a GPUTextureView to its texture info. */
export function recordPassDescriptor(d, texOf) {
  const c = d?.colorAttachments?.[0] ?? null, ds = d?.depthStencilAttachment ?? null;
  const tex = (v) => (v ? (texOf(v) ?? { label: "?" }) : null);
  return {
    label: d?.label ?? "",
    colour: c ? { texture: tex(c.view), resolveTarget: tex(c.resolveTarget), loadOp: c.loadOp ?? null, storeOp: c.storeOp ?? null,
      clearValue: c.clearValue == null ? null : Array.isArray(c.clearValue) ? [...c.clearValue] : { ...c.clearValue } } : null,
    attachments: d?.colorAttachments?.length ?? 0,
    depth: ds ? { texture: tex(ds.view), loadOp: ds.depthLoadOp ?? null, storeOp: ds.depthStoreOp ?? null } : null,
  };
}

export function installTargetProbe(win, recordPass) {
  const P = (win.__targetProbe = { passes: [], rts: [], armed: false });
  const texInfo = new WeakMap(), viewTex = new WeakMap(), canvasTex = new WeakSet();
  const info = (t) => texInfo.get(t) ?? { label: t?.label ?? "", format: t?.format, sampleCount: t?.sampleCount, size: [t?.width, t?.height], canvas: canvasTex.has(t) };
  const wrap = (proto, name, make) => { if (proto && typeof proto[name] === "function") proto[name] = make(proto[name]); };
  wrap(win.GPUCanvasContext?.prototype, "getCurrentTexture", (f) => function () { const t = f.call(this); try { canvasTex.add(t); texInfo.delete(t); } catch {} return t; });
  wrap(win.GPUTexture?.prototype, "createView", (f) => function (...a) { const v = f.apply(this, a); try { viewTex.set(v, this); } catch {} return v; });
  const drew = () => { if (!P.armed) return; if (P.curPass) P.curPass.draws++; if (P.curRt) P.curRt.draws++; };
  for (const n of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect"]) wrap(win.GPURenderPassEncoder?.prototype, n, (f) => function (...a) { drew(); return f.apply(this, a); });
  wrap(win.GPURenderPassEncoder?.prototype, "end", (f) => function (...a) { P.curPass = null; return f.apply(this, a); });
  for (const n of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) wrap(win.WebGL2RenderingContext?.prototype, n, (f) => function (...a) { drew(); return f.apply(this, a); });
  wrap(win.GPUCommandEncoder?.prototype, "beginRenderPass", (f) => function (d) {
    P.curPass = null;
    if (P.armed && P.passes.length < 200) {
      try {
        const rec = recordPass(d, (v) => { const t = viewTex.get(v); return t ? info(t) : null; });
        const r = win.__RENDERER__, rt = r?.getRenderTarget?.();
        rec.rendererTarget = rt ? { id: rt.id ?? rt.uuid ?? null, samples: rt.samples ?? 0 } : null;
        try { rec.needsFrameBufferTarget = r ? Boolean(r.needsFrameBufferTarget) : null; } catch { rec.needsFrameBufferTarget = null; }
        rec.draws = 0; P.curPass = rec;
        P.passes.push(rec);
      } catch (e) { P.passes.push({ err: String(e.message) }); }
    }
    return f.call(this, d);
  });
  const raf = () => new Promise((res) => (win.requestAnimationFrame ? win.requestAnimationFrame(() => res()) : setTimeout(res, 16)));
  const halfToFloat = (h) => {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    return e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
  };
  const toRgb = (a, rt) => {
    if (!a) return null;
    const t = rt.texture?.type, HALF = 1016; // three HalfFloatType
    const v = (i) => (a instanceof Uint16Array && (t === HALF || !t) ? halfToFloat(a[i]) : a instanceof Uint8Array || a instanceof Uint8ClampedArray ? a[i] / 255 : a[i]);
    return [v(0), v(1), v(2)];
  };
  const luma = (c) => (c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : null);
  const r4 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 1e4) / 1e4);
  P.capture = async () => {
    const r = win.__RENDERER__;
    if (!r) return { err: "no __RENDERER__" };
    const set = r.setRenderTarget, seen = new Map();
    const drawsTo = new Map(), q = r.esBuildQueue ?? null, FRAMES = 2;
    P.passes = []; P.rts = []; P.curRt = null; P.curPass = null;
    r.setRenderTarget = function (rt, ...a) {
      P.curRt = null;
      if (P.armed && P.rts.length < 400) {
        const rec = { id: rt ? rt.id ?? rt.uuid : null, w: rt?.width, h: rt?.height, samples: rt?.samples ?? 0, type: rt?.texture?.type, depth: Boolean(rt?.depthBuffer), name: rt?.texture?.name ?? "", draws: 0, canvas: !rt };
        P.rts.push(rec); P.curRt = rec;
        if (rt) { if (!seen.has(rec.id)) seen.set(rec.id, rt); const l = drawsTo.get(rt) ?? []; l.push(rec); drawsTo.set(rt, l); }
      }
      return set.call(this, rt, ...a);
    };
    await raf();
    const skipped0 = q ? q.skippedDraws : null;
    P.armed = true; await raf(); await raf(); P.armed = false; P.curRt = null; P.curPass = null;
    const skipped1 = q ? q.skippedDraws : null;
    r.setRenderTarget = set;
    const draws = (t) => (drawsTo.get(t) ?? []).reduce((s, x) => s + x.draws, 0);
    const fbs = new Set();
    try { for (const t of r._frameBufferTargets?.values?.() ?? []) fbs.add(t); } catch {}
    if (r._frameBufferTarget) fbs.add(r._frameBufferTarget);
    const all = [...seen.values()], order = P.rts.filter(Boolean).map((x) => x.id);
    const label = new Map();
    for (const t of fbs) label.set(t, "fb");
    let scene = q?.frameTargets ? all.find((t) => !fbs.has(t) && q.frameTargets.has(t)) : undefined, sceneBy = scene ? "deferBuildsInto" : null;
    if (!scene) { scene = all.filter((t) => !fbs.has(t) && t.depthBuffer).sort((a, b) => draws(b) - draws(a))[0]; if (scene) sceneBy = "maxDraws"; }
    if (scene) label.set(scene, "scene");
    const rest = all.filter((t) => !label.has(t)).sort((a, b) => b.width * b.height - a.width * a.height);
    const bloom = rest.find((t) => { const i = order.indexOf(t.id ?? t.uuid); return all.some((u) => u !== t && Math.abs(u.width - Math.round(t.width / 2)) <= 1 && order.indexOf(u.id ?? u.uuid) > i); });
    if (bloom) label.set(bloom, "bloom");
    const read = async (rt) => {
      const pts = [];
      for (const fy of [0.25, 0.5, 0.75]) for (const fx of [0.25, 0.5, 0.75]) pts.push([Math.min(rt.width - 1, Math.floor(rt.width * fx)), Math.min(rt.height - 1, Math.floor(rt.height * fy))]);
      const out = { label: label.get(rt) ?? "other", id: rt.id ?? rt.uuid, size: [rt.width, rt.height], samples: rt.samples ?? 0, type: rt.texture?.type, name: rt.texture?.name ?? "", draws: draws(rt) };
      if ((rt.samples ?? 0) > 1) { out.skipped = `multisampled (samples ${rt.samples}): never read directly; read its resolve`; return out; }
      try {
        const ls = [];
        for (const [x, y] of pts) ls.push(luma(toRgb(await r.readRenderTargetPixelsAsync(rt, x, y, 1, 1), rt)));
        out.centre = r4(ls[4]); out.mean9 = r4(ls.reduce((s, v) => s + v, 0) / ls.length);
      } catch (e) { out.err = String(e.message ?? e).slice(0, 200); }
      return out;
    };
    const targets = [];
    for (const t of [...fbs, ...all.filter((t) => !fbs.has(t))].slice(0, 16)) targets.push(await read(t));
    let samples = null; try { samples = r.samples ?? r._samples ?? null; } catch {}
    const queue = q ? { skippedDraws: skipped1 - skipped0, frames: FRAMES, skippedPerFrame: (skipped1 - skipped0) / FRAMES, notReady: q.pending ?? null, timedOut: q.timedOut?.size ?? null } : { err: "no esBuildQueue on the renderer" };
    return { backend: r.backend?.isWebGPUBackend ? "webgpu" : "webgl2", rendererSamples: samples, sceneBy, queue, targets, setRenderTarget: P.rts, passes: P.passes };
  };
}

/** The summary cell, e.g. "not-a-bar; scene 0.41 (773 draws) / fb skip / bloom 0.02 / canvas luma 17.5 / skipped 3.0/frame, 2 not ready". */
export function targetsLine(p) {
  if (!p) return null;
  if (p.err) return `not-a-bar; probe unread (${String(p.err).slice(0, 60)})`;
  const f = (x) => (x == null || !Number.isFinite(x) ? "?" : x >= 0.1 ? x.toFixed(2) : x.toPrecision(1));
  const of = (l) => p.targets?.find((t) => t.label === l);
  const parts = ["scene", "fb", "bloom"].map((l) => { const t = of(l); return `${l} ${!t ? "-" : t.skipped ? "skip" : t.err ? "err" : f(t.mean9)}${t && l === "scene" ? ` (${t.draws ?? "?"} draws)` : ""}`; });
  parts.push(`canvas luma ${Number.isFinite(p.canvas?.luma) ? p.canvas.luma : "-"}`);
  if (p.queue && !p.queue.err) parts.push(`skipped ${p.queue.skippedPerFrame.toFixed(1)}/frame, ${p.queue.notReady ?? "?"} not ready`);
  return `not-a-bar; ${parts.join(" / ")}`;
}
