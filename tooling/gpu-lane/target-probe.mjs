/**
 * `pod-capture.mjs --probe-targets` (diagnosis only; never a bar row; webgpu-diag14 Q2). Splits "native WebGPU renders
 * black" into the stage that loses the picture: the scene/water pass target, three's frame-buffer (output) target, the
 * bloom mip 0 and the canvas. Installed by the init script before the app's scripts; `win.__targetProbe.capture()` is
 * called once after the settled read.
 *
 * capture(): over one whole rAF frame it logs every renderer.setRenderTarget (target id, size, samples, type, depth,
 * texture name; null = canvas) and, on WebGPU, every GPUCommandEncoder.beginRenderPass descriptor
 * (`recordPassDescriptor`: colour view's texture label/format/sampleCount/size, canvas or not, resolveTarget, loadOp,
 * storeOp, clearValue, depth loadOp) with the renderer's render target and needsFrameBufferTarget at that moment. Then it
 * reads back, through renderer.readRenderTargetPixelsAsync (both backends), the centre pixel and the 9-point mean
 * (x, y in 0.25/0.5/0.75 of the size) of every target the frame set, labelling `fb` (in renderer._frameBufferTargets),
 * `scene` (the first non-fb target the frame set: WaterPipeline pass 1 drawTarget) and `bloom` (the largest remaining
 * target followed in the log by one of half its width: the mip chain's mip 0). Luma is Rec.709 of linear RGB as stored
 * (float targets unclamped; 8-bit targets / 255). The canvas luma comes from the harness's screenshot (0..1).
 * Self-contained: stringified into the page with `recordPassDescriptor` passed in.
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
  wrap(win.GPUCommandEncoder?.prototype, "beginRenderPass", (f) => function (d) {
    if (P.armed && P.passes.length < 200) {
      try {
        const rec = recordPass(d, (v) => { const t = viewTex.get(v); return t ? info(t) : null; });
        const r = win.__RENDERER__, rt = r?.getRenderTarget?.();
        rec.rendererTarget = rt ? { id: rt.id ?? rt.uuid ?? null, samples: rt.samples ?? 0 } : null;
        try { rec.needsFrameBufferTarget = r ? Boolean(r.needsFrameBufferTarget) : null; } catch { rec.needsFrameBufferTarget = null; }
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
    P.passes = []; P.rts = [];
    r.setRenderTarget = function (rt, ...a) {
      if (P.armed && P.rts.length < 400) {
        P.rts.push(rt ? { id: rt.id ?? rt.uuid, w: rt.width, h: rt.height, samples: rt.samples ?? 0, type: rt.texture?.type, depth: Boolean(rt.depthBuffer), name: rt.texture?.name ?? "" } : null);
        if (rt && !seen.has(rt.id ?? rt.uuid)) seen.set(rt.id ?? rt.uuid, rt);
      }
      return set.call(this, rt, ...a);
    };
    await raf(); P.armed = true; await raf(); await raf(); P.armed = false;
    r.setRenderTarget = set;
    const fbs = new Set();
    try { for (const t of r._frameBufferTargets?.values?.() ?? []) fbs.add(t); } catch {}
    if (r._frameBufferTarget) fbs.add(r._frameBufferTarget);
    const all = [...seen.values()], order = P.rts.filter(Boolean).map((x) => x.id);
    const label = new Map();
    for (const t of fbs) label.set(t, "fb");
    const firstNonFb = all.find((t) => !fbs.has(t));
    if (firstNonFb) label.set(firstNonFb, "scene");
    const rest = all.filter((t) => !label.has(t)).sort((a, b) => b.width * b.height - a.width * a.height);
    const bloom = rest.find((t) => { const i = order.indexOf(t.id ?? t.uuid); return all.some((u) => u !== t && Math.abs(u.width - Math.round(t.width / 2)) <= 1 && order.indexOf(u.id ?? u.uuid) > i); });
    if (bloom) label.set(bloom, "bloom");
    const read = async (rt) => {
      const pts = [];
      for (const fy of [0.25, 0.5, 0.75]) for (const fx of [0.25, 0.5, 0.75]) pts.push([Math.min(rt.width - 1, Math.floor(rt.width * fx)), Math.min(rt.height - 1, Math.floor(rt.height * fy))]);
      const out = { label: label.get(rt) ?? "other", id: rt.id ?? rt.uuid, size: [rt.width, rt.height], samples: rt.samples ?? 0, type: rt.texture?.type, name: rt.texture?.name ?? "" };
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
    return { backend: r.backend?.isWebGPUBackend ? "webgpu" : "webgl2", rendererSamples: samples, targets, setRenderTarget: P.rts, passes: P.passes };
  };
}

/** The summary cell: 9-point luma mean of the labelled stages, e.g. "not-a-bar; scene 0.41 / fb 0.40 / bloom 0.02 / canvas 0.003". */
export function targetsLine(p) {
  if (!p) return null;
  if (p.err) return `not-a-bar; probe unread (${String(p.err).slice(0, 60)})`;
  const f = (x) => (x == null || !Number.isFinite(x) ? "?" : x >= 0.1 ? x.toFixed(2) : x.toPrecision(1));
  const of = (l) => p.targets?.find((t) => t.label === l);
  const parts = ["scene", "fb", "bloom"].map((l) => { const t = of(l); return `${l} ${t ? (t.err ? "err" : f(t.mean9)) : "-"}`; });
  parts.push(`canvas ${p.canvas ? f(p.canvas.mean9) : "-"}`);
  return `not-a-bar; ${parts.join(" / ")}`;
}

/** Canvas centre and 9-point luma (0..1) from screenshot RGBA, at the same 0.25/0.5/0.75 points as the targets. */
export function canvasNine(data, w, h) {
  const ls = [];
  for (const fy of [0.25, 0.5, 0.75]) for (const fx of [0.25, 0.5, 0.75]) {
    const i = (Math.min(h - 1, Math.floor(h * fy)) * w + Math.min(w - 1, Math.floor(w * fx))) * 4;
    ls.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
  }
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  return { centre: r4(ls[4]), mean9: r4(ls.reduce((s, v) => s + v, 0) / 9) };
}
