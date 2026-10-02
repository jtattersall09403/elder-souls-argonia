// Pure checks behind `measure.mjs --smoke`, `--census` and `--diag` (unit-tested in measure.test.mjs).
export const SPOT_A = "?view=character&x=7.1971&z=0.584&t=22&w=rain";
export const VSYNC_CAP_FPS = 58.5; // a trivial page under Xvfb (README Gotchas)
export const BLACK_LUMA = 8; // mean 0-255; the night shots in tooling/.reports/gpu-lane/r3-ab measure 29 and 36
export const PROBES = ["relink", "heap"];
/** Probes that are a script injected into the page (`probes/<name>.js`); `heap` is read by measure.mjs after GC. */
export const INPAGE_PROBES = ["relink"];

const r2 = (x) => Math.round(x * 100) / 100;

/** Probe names from `--diag a,b` and any `diag=a,b` query flag, checked against PROBES. */
export function diagList(flag, urls = []) {
  const names = new Set((flag || "").split(",").filter(Boolean));
  for (const u of urls) {
    const m = /[?&]diag=([^&]*)/.exec(u);
    if (m) m[1].split(",").filter(Boolean).forEach((n) => names.add(n));
  }
  for (const n of names) if (!PROBES.includes(n)) throw new Error(`unknown --diag probe "${n}" (have ${PROBES.join(", ")})`);
  return [...names];
}

/** Mean luminance (0-255, Rec.601) of RGBA bytes. */
export function meanLuma(rgba) {
  let sum = 0, n = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) { sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]; n++; }
  return n ? sum / n : 0;
}

/** URLs of pages in the browser that this run did not open (`own` is a Set of the pages it opened). */
export function foreignPages(browser, own) {
  const out = [];
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (!own.has(p)) out.push(p.url());
  return out;
}

/**
 * The reasons a smoke run must fail ([] = pass). `r` = {ready, readyS, uncappedFps, luma, consoleErrors,
 * contextLost, foreign}.
 */
export function smokeProblems(r, { readyMaxS = 40, capFps = VSYNC_CAP_FPS, capTol = 1.5, black = BLACK_LUMA } = {}) {
  const bad = [];
  if (!r.ready || r.readyS > readyMaxS) bad.push(`ready gate took ${r.readyS} s (limit ${readyMaxS} s)${r.ready ? "" : ", never passed"}`);
  if (r.uncappedFps != null && Math.abs(r.uncappedFps - capFps) <= capTol) bad.push(`uncapped fps ${r.uncappedFps} agrees with the ${capFps} vsync cap: the frame is capped and the cost numbers are wall time`);
  if (r.luma == null) bad.push("no screenshot to judge for a black frame");
  else if (r.luma < black) bad.push(`black frame: mean luminance ${r2(r.luma)} < ${black}`);
  const gpuErr = (r.consoleErrors ?? []).filter((e) => /webgl|webgpu|\bgpu\b|context lost|context_lost|GL_|GL error|ANGLE|vulkan/i.test(e));
  if (gpuErr.length) bad.push(`GPU/WebGL console error: ${gpuErr[0].slice(0, 160)}`);
  if (r.contextLost) bad.push(`WebGL context lost ${r.contextLost}x`);
  if (r.foreign?.length) bad.push(`${r.foreign.length} page(s) this run did not open: ${r.foreign.join(", ").slice(0, 160)}`);
  return bad;
}

/**
 * Hitches from rAF timestamps (ms, page performance.now base) and a CDP CPU profile: every frame interval
 * over `hitchMs`, with the top self-time functions of the samples inside it. `offsetMs` = the profile
 * clock (profile.startTime / 1000) minus the page performance.now() at the same instant.
 */
export function hitchList(ts, profile, offsetMs, { hitchMs = 20, top = 4 } = {}) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const smp = [];
  let t = profile.startTime / 1000 - offsetMs;
  const { samples = [], timeDeltas = [] } = profile;
  for (let i = 0; i < samples.length; i++) {
    t += (timeDeltas[i] ?? 0) / 1000;
    smp.push({ t, id: samples[i], dt: (timeDeltas[i + 1] ?? 0) / 1000 });
  }
  const out = [];
  for (let i = 1; i < ts.length; i++) {
    const dt = ts[i] - ts[i - 1];
    if (dt <= hitchMs) continue;
    const self = new Map();
    for (const s of smp) {
      if (s.t < ts[i - 1] || s.t >= ts[i]) continue;
      const cf = byId.get(s.id)?.callFrame ?? {};
      const key = `${cf.functionName || "(anon)"} ${cf.url ? cf.url.replace(/^.*\//, "") : "(native)"}:${(cf.lineNumber ?? -1) + 1}:${(cf.columnNumber ?? -1) + 1}`;
      self.set(key, (self.get(key) ?? 0) + s.dt);
    }
    out.push({ atMs: r2(ts[i - 1]), frameMs: r2(dt), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, ms]) => ({ name, selfMs: r2(ms) })) });
  }
  return out;
}

/** Retained bytes by function of a CDP HeapProfiler sampling profile. */
function heapByFunction(sampling) {
  const by = new Map();
  const walk = (n) => {
    const cf = n.callFrame ?? {};
    const k = `${cf.functionName || "(anon)"} ${cf.url ? cf.url.replace(/^.*\//, "") : "(native)"}:${(cf.lineNumber ?? -1) + 1}`;
    by.set(k, (by.get(k) ?? 0) + (n.selfSize ?? 0));
    for (const c of n.children ?? []) walk(c);
  };
  if (sampling?.head) walk(sampling.head);
  return by;
}

/**
 * `heapsample`: the top allocators of ONE sampling profile taken with includeObjectsCollectedByMajorGC/MinorGC,
 * so selfSize is every byte allocated over the window, collected or not (the GC churn source). MB, largest first.
 */
export const heapTopAllocators = (sampling, top = 25) => [...heapByFunction(sampling)].sort((x, y) => y[1] - x[1])
  .slice(0, top).map(([name, bytes]) => ({ name, MB: r2(bytes / 1e6) }));

/** The heap diff: functions whose retained sampled bytes grew from `before` to `after` (MB, largest first). */
export function heapGrowth(before, after, top = 15) {
  const a = heapByFunction(before), b = heapByFunction(after);
  return [...b].map(([name, bytes]) => [name, bytes - (a.get(name) ?? 0)]).filter(([, d]) => d > 0)
    .sort((x, y) => y[1] - x[1]).slice(0, top).map(([name, d]) => ({ name, MB: r2(d / 1e6) }));
}

/** census.txt: the short human read of one census entry. */
export function censusText(c) {
  const d = c.draws;
  const L = [`# ${c.query}${c.ready === false ? " (NOT READY: the scene was still loading or broken)" : ""}`,
    `draws/frame ${d.drawsPerFrame} (empty ${d.emptyDrawsPerFrame}) · distinct materials/frame ${d.distinctMaterialsPerFrame} (over run ${d.distinctMaterialsOverRun}, shared across owners ${d.materialsSharedAcrossOwners}) · programs ${d.programs}`,
    "top owners (draws, empty per frame):", ...d.byOwner.slice(0, 15).map(([k, n, e]) => `  ${n}\t${e}\t${k}`),
    "top materials (name, uuid8, draws, owners):", ...d.byMaterial.slice(0, 10).map((m) => `  ${m.join("\t")}`)];
  const m = c.matrix;
  if (m) L.push(`matrixAutoUpdate on ${m.matrixAutoUpdateOn} of ${m.objects}; not moved in ${m.staticOver} ms: ${m.notMoved}, moved ${m.moved}`);
  L.push(`heap ${c.heap.startMB} MB -> ${c.heap.endMB} MB over ${c.heap.seconds} s: ${c.heap.slopeMBs} MB/s`);
  if (c.heap.sampledGrowth) L.push("heap growth by function (sampled, MB):", ...c.heap.sampledGrowth.slice(0, 6).map((g) => `  ${g.MB}\t${g.name}`));
  L.push(`hitches >20 ms in ${c.hitchWindowS} s: ${c.hitches.length}`);
  for (const h of c.hitches) L.push(`  ${h.frameMs} ms at ${h.atMs}: ${h.top.map((t) => `${t.name} ${t.selfMs}`).join(" | ")}`);
  return L.join("\n");
}
