// Spot lists, the per-round summary table and the leak slope: pure helpers of measure.mjs.

/**
 * The `rate=` every capture URL carries: the studio clock (timeState.ts applyTimeParams -> worldClock.rate) counts
 * world MINUTES per real second, and the game runs at GAME_TIME_SCALE = 30 world SECONDS per real second
 * (packages/world-time/src/clock.ts), so the game's own speed is 30 / 60 = 0.5 (GAME_RATE_MIN_PER_S). A 3 min spot
 * drifts 90 game minutes. `rate=30` ran the clock 60 times the game's speed (30 game hours per real minute).
 */
export const CAPTURE_RATE = 0.5;

/**
 * A spot file has one spot per line: `<name> <query> [--aim yaw,pitch] [walk=<s> | steps=<seq>] [x<N>]`; the query
 * starts with "?"; blank lines and lines starting with "#" are skipped; `x<N>` repeats the spot N times in a row (names
 * <name>, <name>2, <name>3, ...). `walk=<s>` is sugar for `steps=w:<s>`. Probe tokens make the spot a diagnosis row
 * (never judged against the bar, README "Probe rules"): `diag=<probe,..>`, `trace`, `trace-gpu` (implies trace),
 * `memory-infra` (implies trace), `heapsample`, `profile` (a 200 us CPU profile over the settled window). Returns [{name, query, aim, steps, probes}], probes =
 * {diag: [names], trace, traceGpu, memoryInfra, heapsample, profile}.
 */
export function parseSpots(text) {
  const spots = [];
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const tok = line.split(/\s+/);
    const probes = { diag: [], trace: false, traceGpu: false, memoryInfra: false, heapsample: false, profile: false };
    const spot = { name: tok[0], query: "", aim: "", steps: [], probes };
    let times = 1;
    for (let k = 1; k < tok.length; k++) {
      if (tok[k].startsWith("?")) spot.query = tok[k];
      else if (tok[k] === "--aim") spot.aim = tok[++k] ?? "";
      else if (/^x\d+$/.test(tok[k])) times = Number(tok[k].slice(1));
      else if (/^walk=\d+(\.\d+)?$/.test(tok[k])) spot.steps = [{ w: Number(tok[k].slice(5)) }];
      else if (tok[k].startsWith("steps=")) spot.steps = parseSteps(tok[k].slice(6), `spots line ${i + 1}`);
      else if (/^diag=[\w,]+$/.test(tok[k])) probes.diag = tok[k].slice(5).split(",").filter(Boolean);
      else if (tok[k] === "trace") probes.trace = true;
      else if (tok[k] === "trace-gpu") probes.traceGpu = probes.trace = true;
      else if (tok[k] === "memory-infra") probes.memoryInfra = probes.trace = true;
      else if (tok[k] === "heapsample") probes.heapsample = true;
      else if (tok[k] === "profile") probes.profile = true;
      else throw new Error(`spots line ${i + 1}: cannot read "${tok[k]}" (want ?query, --aim yaw,pitch, walk=<s>, steps=<seq>, diag=<probes>, trace, trace-gpu, memory-infra, heapsample, profile)`);
    }
    if (!/^[\w.-]+$/.test(spot.name) || !spot.query) throw new Error(`spots line ${i + 1}: need "<name> <?query>"`);
    for (let n = 1; n <= times; n++) {
      const name = n === 1 ? spot.name : `${spot.name}${n}`;
      if (spots.some((s) => s.name === name)) throw new Error(`spots line ${i + 1}: duplicate name ${name}`);
      spots.push({ ...spot, name });
    }
  }
  if (!spots.length) throw new Error("spot file has no spots");
  return spots;
}

/**
 * A motion sequence "w:7,yaw:+1.2,w:6": `w:<s>` holds W for s seconds, `yaw:<+|-rad>` turns the follow camera by rad
 * (relative; W stays held). At least one w segment. Returns [{w} | {yaw}].
 */
export function parseSteps(seq, where = "steps") {
  const steps = String(seq).split(",").map((seg) => {
    let m = /^w:(\d+(?:\.\d+)?)$/.exec(seg);
    if (m && Number(m[1]) > 0) return { w: Number(m[1]) };
    m = /^yaw:([+-]\d+(?:\.\d+)?)$/.exec(seg);
    if (m) return { yaw: Number(m[1]) };
    throw new Error(`${where}: bad step "${seg}" (want w:<s> or yaw:<+|-rad>)`);
  });
  if (!steps.some((x) => x.w)) throw new Error(`${where}: steps need at least one w:<s>`);
  return steps;
}

/** Seconds of W held over a step sequence: the length of the motion window. */
export const stepsSeconds = (steps) => steps.reduce((a, x) => a + (x.w ?? 0), 0);

/** "--bar fps,p1low" -> {fps, p1low}. */
export function parseBar(s) {
  const [fps, p1low] = String(s).split(",").map(Number);
  if (!(fps > 0) || !(p1low > 0)) throw new Error(`--bar wants "fps,p1low" (e.g. 83,69), got "${s}"`);
  return { fps, p1low };
}

/**
 * The rows of one url entry: its static settle, and for a walk spot its walk window too (each judged on its own);
 * pass = settled fps >= bar.fps and p1Low (fps of the slowest 1 % of frame intervals) >= bar.p1low.
 */
export function spotRows(name, u, bar) {
  return [row(name, u, u, bar), ...(u.walk ? [row(`${name} (walk ${u.walk.seconds} s)`, u, u.walk, bar)] : [])];
}

/**
 * A diagnosis spot: any probe on it (its own tokens, a `diag=` in its query) or any global probe flag
 * (`g` = {diag: [names], trace, profile, census}). Its rows print `diag` and never count toward the bar.
 */
export const isDiagnosisSpot = (spot, g = {}) => {
  const p = spot.probes ?? {};
  return !!(p.diag?.length || p.trace || p.traceGpu || p.memoryInfra || p.heapsample || p.profile || /[?&]diag=/.test(spot.query ?? "")
    || g.diag?.length || g.trace || g.profile > 0 || g.census);
};

function row(spot, u, s, bar) {
  const pass = u.diagnosis ? "diag" : s.settledFps >= bar.fps && s.p1LowFps >= bar.p1low;
  return { spot, fps: s.settledFps, p1Low: s.p1LowFps, uncapped: s.uncappedFps ?? null,
    p1LowUncapped: s.p1LowUncapped ?? null, maxMs: s.frameTimes?.maxMs ?? null, over20: s.over20, over33: s.over33,
    ready: u.ready, pass };
}

export function summaryTable(rows, bar) {
  const f = (x) => (x == null ? "-" : x);
  const L = [`bar: settled fps >= ${bar.fps}, p1Low >= ${bar.p1low}`,
    "| spot | settled fps | p1Low | uncapped | p1LowUncapped | max ms | over20 | over33 | pass |", "|---|---|---|---|---|---|---|---|---|"];
  for (const r of rows) {
    L.push(`| ${r.spot}${r.ready === false ? " (NOT READY)" : ""} | ${f(r.fps)} | ${f(r.p1Low)} | ${f(r.uncapped)} | ${f(r.p1LowUncapped)} | ${f(r.maxMs)} | ${f(r.over20)} | ${f(r.over33)} | ${r.pass === "diag" ? "diag" : r.pass ? "pass" : "FAIL"} |`);
  }
  const judged = rows.filter((r) => r.pass !== "diag");
  L.push(`${judged.filter((r) => r.pass).length} of ${judged.length} spots pass (${rows.length - judged.length} diagnosis rows, not judged)`);
  return L.join("\n");
}

/** Least-squares slope of heap samples [{tS, MB}] in MB per minute (null under two samples). */
export function heapSlope(samples) {
  const n = samples.length;
  if (n < 2) return null;
  const mt = samples.reduce((a, s) => a + s.tS, 0) / n, mm = samples.reduce((a, s) => a + s.MB, 0) / n;
  let num = 0, den = 0;
  for (const s of samples) { num += (s.tS - mt) * (s.MB - mm); den += (s.tS - mt) ** 2; }
  return den ? Math.round((num / den) * 60 * 100) / 100 : null;
}
