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
 * `sceneGrid`: the scene target read whole and sampled on a 64x36 grid: NaN, Inf, black (luma < 0.001), lit, mean luma,
 * 8 raw RGBA samples, and the depth texture's raw min/max/mean with counts below 0.001 / above 0.999 when the backend can
 * copy it (else `skipped` with the reason).
 * `heldDraws`: each draw the build queue skipped in the window (object, parents, material, attributes, pass camera, wait).
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
  const num3 = (v) => (v && ["x", "y", "z"].every((k) => typeof v[k] === "number") ? [v.x, v.y, v.z] : v && ["r", "g", "b"].every((k) => typeof v[k] === "number") ? [v.r, v.g, v.b] : null);

  /** diag17 state block: camera matrices, viewport/scissor, drawing buffer, sun uniforms, each with NaN/Inf flags. */
  function readState(r, camera, scene) {
    const st = {};
    if (!camera) st.camera = "unreachable";
    else {
      const projectionMatrix = camera.projectionMatrix?.elements ? Array.from(camera.projectionMatrix.elements) : null;
      const matrixWorldInverse = camera.matrixWorldInverse?.elements ? Array.from(camera.matrixWorldInverse.elements) : null;
      const vals = [...(projectionMatrix ?? []), ...(matrixWorldInverse ?? []), camera.near, camera.far];
      st.camera = { projectionMatrix, matrixWorldInverse, near: camera.near, far: camera.far, anyNaN: vals.some(Number.isNaN), anyInf: vals.some((v) => v === Infinity || v === -Infinity) };
    }
    try {
      const vec = () => ({ x: 0, y: 0, z: 0, w: 0, set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; return this; }, copy(o) { Object.assign(this, o); return this; } });
      const flat = (v) => (v ? { x: v.x, y: v.y, w: v.z ?? v.width, h: v.w ?? v.height } : null);
      st.viewport = r.getViewport ? flat(r.getViewport(vec())) : null;
      st.scissor = r.getScissor ? flat(r.getScissor(vec())) : null;
      st.scissorTest = r.getScissorTest ? Boolean(r.getScissorTest()) : null;
      if (r.getDrawingBufferSize) { const t = { x: 0, y: 0, set(a, b) { this.x = a; this.y = b; return this; }, copy(o) { this.x = o.x; this.y = o.y; return this; } }; const o = r.getDrawingBufferSize(t) ?? t; st.drawingBuffer = { w: o.x ?? o.width, h: o.y ?? o.height }; } else st.drawingBuffer = null;
    } catch (e) { st.viewportErr = String(e.message ?? e).slice(0, 80); }
    const sun = {};
    try {
      for (const [k, v] of Object.entries(scene?.userData ?? {})) {
        if (!/sun/i.test(k)) continue;
        const a = num3(v) ?? num3(v?.value) ?? num3(v?.direction) ?? num3(v?.color);
        if (a) sun[k] = { value: a, anyNaN: a.some(Number.isNaN), anyInf: a.some((x) => x === Infinity || x === -Infinity) };
      }
    } catch {}
    st.sun = Object.keys(sun).length ? sun : "unreachable";
    return st;
  }
  const texInfo = new WeakMap(), viewTex = new WeakMap(), canvasTex = new WeakSet();
  const info = (t) => texInfo.get(t) ?? { label: t?.label ?? "", format: t?.format, sampleCount: t?.sampleCount, size: [t?.width, t?.height], canvas: canvasTex.has(t) };
  const wrap = (proto, name, make) => { if (proto && typeof proto[name] === "function") proto[name] = make(proto[name]); };
  wrap(win.GPUCanvasContext?.prototype, "getCurrentTexture", (f) => function () { const t = f.call(this); try { canvasTex.add(t); texInfo.delete(t); } catch {} return t; });
  wrap(win.GPUTexture?.prototype, "createView", (f) => function (...a) { const v = f.apply(this, a); try { viewTex.set(v, this); } catch {} return v; });
  const drew = () => { if (!P.armed) return; P.totalDraws = (P.totalDraws ?? 0) + 1; if (P.curPass) P.curPass.draws++; if (P.curRt) P.curRt.draws++; };
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
  // Held draws (webgpu10 c7): the build queue's request() runs once per draw it skips (shaderBuildQueue.ts). It is hooked
  // once the renderer's esBuildQueue exists (polled 4/s for 10 min, and again at capture): a Map lookup per SKIPPED draw
  // (never per drawn one) keeps when each key first waited; the per-draw context is recorded only inside capture().
  const pnow = () => (win.performance?.now ? win.performance.now() : Date.now());
  const firstSeen = new Map();
  let hold = null;
  const hookQueue = (q) => {
    if (!q || typeof q.request !== "function" || q.__targetProbeHooked) return;
    const req = q.request;
    q.request = function (key, ...a) {
      if (!firstSeen.has(key) && firstSeen.size < 5000) firstSeen.set(key, pnow());
      if (hold?.cur) { try { hold.note(this, key, hold.cur); } catch {} }
      return req.call(this, key, ...a);
    };
    Object.defineProperty(q, "__targetProbeHooked", { value: pnow(), configurable: true });
  };
  if (typeof win.setInterval === "function") {
    let n = 0;
    const poll = win.setInterval(() => { const q = win.__RENDERER__?.esBuildQueue; if (q) hookQueue(q); if (q || ++n > 2400) win.clearInterval(poll); }, 250);
  }
  const heldRecord = (q, key, c) => {
    const o = c.object, m = c.material, parents = [];
    for (let p = o?.parent, i = 0; p && i < 4; p = p.parent, i++) parents.push({ name: p.name ?? "", type: p.type ?? null });
    const t0 = firstSeen.get(key);
    return { object: { name: o?.name ?? "", type: o?.type ?? null, uuid: o?.uuid ?? null }, parents, material: { type: m?.type ?? null, name: m?.name ?? "" },
      geometryAttributes: Object.keys(o?.geometry?.attributes ?? {}), camera: c.camera, target: c.target ? (c.target.texture?.name ?? "") || "unnamed target" : "canvas",
      key: String(key).slice(0, 160), waitedMs: t0 === undefined ? null : Math.round(pnow() - t0), running: q.running?.has?.(key) ?? null, timedOut: q.timedOut?.has?.(key) ?? null, count: 0 };
  };
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
    // Targets keyed by OBJECT: a three RenderTarget has no id/uuid, so keying by id kept only the first target set (sceneBy null, diag16).
    const set = r.setRenderTarget, seen = new Set(), tid = (rt) => (rt ? rt.id ?? rt.texture?.id ?? rt.uuid ?? null : null);
    const drawsTo = new Map(), q = r.esBuildQueue ?? null, FRAMES = 2;
    P.passes = []; P.rts = []; P.curRt = null; P.curPass = null;
    r.setRenderTarget = function (rt, ...a) {
      P.curRt = null;
      if (P.armed && P.rts.length < 400) {
        const rec = { id: tid(rt), w: rt?.width, h: rt?.height, samples: rt?.samples ?? 0, type: rt?.texture?.type, depth: Boolean(rt?.depthBuffer), name: rt?.texture?.name ?? "", draws: 0, canvas: !rt };
        P.rts.push(rec); P.curRt = rec;
        if (rt) { seen.add(rt); const l = drawsTo.get(rt) ?? []; l.push(rec); drawsTo.set(rt, l); }
      }
      return set.call(this, rt, ...a);
    };
    // Not-ready pipelines: Pipelines.isReady false at the draw (Renderer._renderObjectDirect), counted over the window.
    const pl = r._pipelines, isReady0 = pl?.isReady, nr = { count: 0, names: new Map(), fields: new Set() };
    if (typeof isReady0 === "function") pl.isReady = function (ro) {
      const ok = isReady0.call(this, ro);
      if (!ok && P.armed) {
        nr.count++;
        try {
          const name = ro?.material?.name || ro?.material?.type || "?";
          if (nr.names.size < 20 || nr.names.has(name)) {
            let pipelineNull = null, error = null;
            try {
              const data = this.get(ro), rop = data?.pipeline, bd = rop ? this.backend?.get?.(rop) : null;
              if (data) for (const k of Object.keys(data)) nr.fields.add("data." + k);
              if (bd) for (const k of Object.keys(bd)) nr.fields.add("backend." + k);
              pipelineNull = !bd || bd.pipeline === undefined || bd.pipeline === null;
              const e = bd?.error ?? data?.error ?? null;
              error = e == null ? null : String(e.message ?? e).slice(0, 200);
            } catch (e) { error = "probe: " + String(e.message ?? e).slice(0, 100); }
            const cur = nr.names.get(name) ?? { material: name, pipelineNull, error, count: 0 };
            cur.count++; cur.pipelineNull = pipelineNull; cur.error = error ?? cur.error;
            nr.names.set(name, cur);
          }
        } catch {}
      }
      return ok;
    };
    // State (diag17): the camera/scene of the largest renderer.render call in the window.
    const renderFn = r.render, renderAsyncFn = r.renderAsync, big = { draws: -1, camera: null, scene: null };
    const keep = (sc, cam, d) => { if (P.armed && d >= big.draws) { big.draws = d; big.camera = cam; big.scene = sc; } };
    if (typeof renderFn === "function") r.render = function (sc, cam, ...a) { const d0 = P.totalDraws ?? 0; const out = renderFn.call(this, sc, cam, ...a); keep(sc, cam, (P.totalDraws ?? 0) - d0); return out; };
    if (typeof renderAsyncFn === "function") r.renderAsync = async function (sc, cam, ...a) { const d0 = P.totalDraws ?? 0; const out = await renderAsyncFn.call(this, sc, cam, ...a); keep(sc, cam, (P.totalDraws ?? 0) - d0); return out; };
    // Held draws: the draw in progress (object, material, camera, target) is kept while the queue's _renderObjectDirect runs
    hookQueue(q);
    const rod = r._renderObjectDirect, held = new Map();
    let heldCount = 0;
    if (q && typeof rod === "function") {
      hold = { cur: null, note(qq, key, c) {
        heldCount++;
        const id = `${c.object?.uuid ?? "?"}|${String(key)}`;
        let h = held.get(id);
        if (!h && held.size < 20) { h = heldRecord(qq, key, c); held.set(id, h); }
        if (h) { h.count++; h.waitedMs = firstSeen.has(key) ? Math.round(pnow() - firstSeen.get(key)) : null; }
      } };
      r._renderObjectDirect = function (object, material, scene, camera, ...a) {
        const prev = hold.cur;
        hold.cur = P.armed ? { object, material, camera, target: this._renderTarget ?? null } : null;
        try { return rod.call(this, object, material, scene, camera, ...a); } finally { hold.cur = prev; }
      };
    }
    await raf();
    const skipped0 = q ? q.skippedDraws : null;
    P.armed = true; await raf(); await raf(); P.armed = false; P.curRt = null; P.curPass = null;
    const skipped1 = q ? q.skippedDraws : null;
    r.setRenderTarget = set;
    if (typeof renderFn === "function") r.render = renderFn;
    if (typeof renderAsyncFn === "function") r.renderAsync = renderAsyncFn;
    if (typeof isReady0 === "function") pl.isReady = isReady0;
    if (hold) { r._renderObjectDirect = rod; hold = null; }
    let heldDraws;
    try {
      const pass = (cam, h) => (cam && cam === big.camera ? "main" : cam?.isOrthographicCamera || /shadow/i.test(h.target) ? "shadow/ortho" : "other");
      heldDraws = !q ? { err: "no esBuildQueue on the renderer" } : typeof rod !== "function" ? { err: "no renderer._renderObjectDirect" } : {
        perFrame: heldCount / FRAMES, twinsHeld: q.twinsHeld ?? null, hookedAt: q.__targetProbeHooked ?? null,
        objects: [...held.values()].map((h) => ({ ...h, pass: pass(h.camera, h), camera: h.camera ? { type: h.camera.type ?? null, name: h.camera.name ?? "" } : null })) };
    } catch (e) { heldDraws = { err: String(e.message ?? e).slice(0, 200) }; }
    let notReadyPipelines; try { notReadyPipelines = typeof isReady0 === "function" ? { perFrame: nr.count / FRAMES, names: [...nr.names.values()], fields: [...nr.fields] } : { err: "no renderer._pipelines.isReady" }; } catch (e) { notReadyPipelines = { err: String(e.message ?? e).slice(0, 200) }; }
    const exposure = {};
    try { exposure.toneMappingExposure = r.toneMappingExposure ?? null; exposure.toneMapping = r.toneMapping ?? null; exposure.outputColorSpace = r.outputColorSpace ?? null; } catch (e) { exposure.err = String(e.message ?? e); }
    const draws = (t) => (drawsTo.get(t) ?? []).reduce((s, x) => s + x.draws, 0);
    const fbs = new Set();
    try { for (const t of r._frameBufferTargets?.values?.() ?? []) fbs.add(t); } catch {}
    if (r._frameBufferTarget) fbs.add(r._frameBufferTarget);
    const all = [...seen], firstSet = (t) => P.rts.findIndex((x) => drawsTo.get(t)?.includes(x));
    const label = new Map();
    for (const t of fbs) label.set(t, "fb");
    let scene = q?.frameTargets ? all.find((t) => !fbs.has(t) && q.frameTargets.has(t)) : undefined, sceneBy = scene ? "deferBuildsInto" : null;
    if (!scene) { scene = all.filter((t) => !fbs.has(t) && t.depthBuffer && (t.samples ?? 0) <= 1).sort((a, b) => draws(b) - draws(a))[0]; if (scene) sceneBy = "maxDraws"; }
    if (scene) label.set(scene, "scene");
    const rest = all.filter((t) => !label.has(t)).sort((a, b) => b.width * b.height - a.width * a.height);
    const bloom = rest.find((t) => { const i = firstSet(t); return all.some((u) => u !== t && Math.abs(u.width - Math.round(t.width / 2)) <= 1 && firstSet(u) > i); });
    if (bloom) label.set(bloom, "bloom");
    const read = async (rt) => {
      const pts = [];
      for (const fy of [0.25, 0.5, 0.75]) for (const fx of [0.25, 0.5, 0.75]) pts.push([Math.min(rt.width - 1, Math.floor(rt.width * fx)), Math.min(rt.height - 1, Math.floor(rt.height * fy))]);
      const out = { label: label.get(rt) ?? "other", id: tid(rt), size: [rt.width, rt.height], samples: rt.samples ?? 0, type: rt.texture?.type, name: rt.texture?.name ?? "", draws: draws(rt) };
      if ((rt.samples ?? 0) > 1) { out.skipped = `multisampled (samples ${rt.samples}): never read directly; read its resolve`; return out; }
      try {
        const ls = [];
        for (const [x, y] of pts) ls.push(luma(toRgb(await r.readRenderTargetPixelsAsync(rt, x, y, 1, 1), rt)));
        out.centre = r4(ls[4]); out.mean9 = r4(ls.reduce((s, v) => s + v, 0) / ls.length);
      } catch (e) { out.err = String(e.message ?? e).slice(0, 200); }
      return out;
    };
    // The scene target on a 64x36 grid (diag16: black = NaN, Inf, black colour, or near depth over the screen?).
    // WebGPU cannot copy the depth aspect of depth24plus(-stencil8) to a buffer; resolve the GPU format name (GPUTexture, a string format, or three's constants).
    const depthFormat = (dt) => {
      const g = r.backend?.get?.(dt)?.texture?.format ?? dt.format;
      if (typeof g === "string") return g;
      if (dt.format === 1027) return "depth24plus-stencil8"; // three DepthStencilFormat
      return dt.type === 1015 ? "depth32float" : dt.type === 1012 ? "depth16unorm" : "depth24plus";
    };
    const sceneGrid = async (rt) => {
      const W = rt.width, H = rt.height, GX = 64, GY = 36, half = rt.texture?.type === 1016;
      const out = { grid: [GX, GY], nan: 0, inf: 0, black: 0, lit: 0, meanLuma: null, samples: [] };
      let a;
      try { a = await r.readRenderTargetPixelsAsync(rt, 0, 0, W, H); } catch (e) { return { err: String(e.message ?? e).slice(0, 200) }; }
      if (!a || a.length < W * 4) return { err: `readback ${a?.length ?? 0} values for ${W}x${H}` };
      const stride = H > 1 ? Math.floor((a.length - W * 4) / (H - 1)) : W * 4; // WebGPU rows are padded to 256 bytes
      if (stride < W * 4) return { err: `readback ${a.length} values for ${W}x${H}` };
      const v = (i) => (half || (a instanceof Uint16Array && rt.texture?.type == null) ? halfToFloat(a[i]) : a instanceof Uint8Array || a instanceof Uint8ClampedArray ? a[i] / 255 : a[i]);
      let sum = 0, n = 0;
      for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
        const x = Math.min(W - 1, Math.floor(((gx + 0.5) * W) / GX)), y = Math.min(H - 1, Math.floor(((gy + 0.5) * H) / GY)), o = y * stride + x * 4;
        const px = [v(o), v(o + 1), v(o + 2), v(o + 3)];
        if (px.some(Number.isNaN)) out.nan++;
        else if (px.some((c) => !Number.isFinite(c))) out.inf++;
        else { const l = luma(px); sum += l; n++; if (l < 0.001) out.black++; else out.lit++; }
        if ((gy * GX + gx) % 288 === 144) out.samples.push({ x, y, rgba: px.map((c) => (Number.isFinite(c) ? r4(c) : String(c))) });
      }
      out.meanLuma = n ? r4(sum / n) : null;
      // Depth: three's readback reads colour attachments only; the depth texture goes through the backend copy (raw values; reversed-z flips near).
      const dt = rt.depthTexture;
      if (!dt) out.depth = { skipped: "target has no depthTexture" };
      else if (((fmt) => fmt === "depth24plus" || fmt === "depth24plus-stencil8")(depthFormat(dt))) out.depth = { depthReadback: "skipped (depth24plus not copyable)", format: depthFormat(dt), size: [W, H] };
      else if (typeof r.backend?.copyTextureToBuffer !== "function") out.depth = { skipped: "backend has no copyTextureToBuffer" };
      else {
        try {
          const d = await r.backend.copyTextureToBuffer(dt, 0, 0, W, H, 0), ds = H > 1 ? Math.floor((d.length - W) / (H - 1)) : W;
          let mn = Infinity, mx = -Infinity, s = 0, k = 0, lo = 0, hi = 0;
          const scale = d instanceof Uint32Array ? 2 ** -32 : d instanceof Uint16Array ? 1 / 65535 : 1;
          for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
            const x = Math.min(W - 1, Math.floor(((gx + 0.5) * W) / GX)), y = Math.min(H - 1, Math.floor(((gy + 0.5) * H) / GY)), z = d[y * ds + x] * scale;
            if (!Number.isFinite(z)) continue; mn = Math.min(mn, z); mx = Math.max(mx, z); s += z; k++; if (z < 0.001) lo++; if (z > 0.999) hi++;
          }
          out.depth = { min: r4(mn), max: r4(mx), mean: k ? r4(s / k) : null, below0001: lo, above0999: hi, reversed: Boolean(r.reversedDepthBuffer ?? r.backend?.reversedDepthBuffer ?? false) };
        } catch (e) { out.depth = { skipped: "depth copy failed: " + String(e.message ?? e).slice(0, 150) }; }
      }
      return out;
    };
    const targets = [];
    for (const t of [...fbs, ...all.filter((t) => !fbs.has(t))].slice(0, 16)) targets.push(await read(t));
    let samples = null; try { samples = r.samples ?? r._samples ?? null; } catch {}
    let queue; try { queue = q ? { skippedDraws: skipped1 - skipped0, frames: FRAMES, skippedPerFrame: (skipped1 - skipped0) / FRAMES, notReady: q.pending ?? null, timedOut: q.timedOut?.size ?? null } : { err: "no esBuildQueue on the renderer" }; } catch (e) { queue = { err: String(e.message ?? e).slice(0, 200) }; }
    let grid; try { grid = scene && (scene.samples ?? 0) <= 1 ? await sceneGrid(scene) : { skipped: scene ? "multisampled" : "no scene target" }; } catch (e) { grid = { err: String(e.message ?? e).slice(0, 200) }; }
    let state; try { state = readState(r, big.camera, big.scene); } catch (e) { state = { err: String(e.message ?? e).slice(0, 200) }; }
    return { backend: r.backend?.isWebGPUBackend ? "webgpu" : "webgl2", rendererSamples: samples, sceneBy, sceneGrid: grid, queue, notReadyPipelines, heldDraws, exposure, state, targets, setRenderTarget: P.rts, passes: P.passes };
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
  const tail = ` notReady ${p.notReadyPipelines?.perFrame ?? "?"} exp ${p.exposure?.toneMappingExposure ?? "?"}`;
  const g = p.sceneGrid, gn = g?.grid ? g.grid[0] * g.grid[1] : 2304;
  const scene = g && !g.err && !g.skipped ? ` scene nan ${g.nan} inf ${g.inf} black ${g.black}/${gn}` : ` scene grid ${g?.err ?? g?.skipped ?? "-"}`.slice(0, 80);
  const c = p.state?.camera, d = p.state?.drawingBuffer;
  const st = ` cam nan ${c && typeof c === "object" ? (c.anyNaN || c.anyInf ? "Y" : "N") : "?"} vp ${d ? `${d.w}x${d.h}` : "?"}`;
  return `not-a-bar; ${parts.join(" / ")}${tail}${scene}${st}`;
}
