/** Pure parts of pod-capture.mjs (unit-tested in pod-capture-lib.test.mjs). */

/**
 * Screen-middle luma and black share of an RGBA buffer, the same window and threshold
 * webgpu-boot-check.mjs fails a black view on: x 30-70 %, y 40-90 % (clear of the HUD), luma <= 3.
 * Self-contained so pod-capture passes its source into the page (`String(screenMiddle)`).
 */
export function screenMiddle(data, width, height) {
  const x0 = Math.floor(width * 0.3), x1 = Math.floor(width * 0.7), y0 = Math.floor(height * 0.4), y1 = Math.floor(height * 0.9);
  let sum = 0, dark = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 4, l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += l; if (l <= 3) dark++; n++;
  }
  return n ? { luma: Math.round((sum / n) * 100) / 100, blackShare: Math.round((dark / n) * 1000) / 1000 } : { luma: null, blackShare: null };
}

/** Counting dedupe: add(key) per occurrence; list() is [[key, count]] most frequent first. */
export function counter(maxLen = 300) {
  const m = new Map();
  return {
    add(k) { k = String(k).slice(0, maxLen); m.set(k, (m.get(k) ?? 0) + 1); },
    list() { return [...m].sort((a, b) => b[1] - a[1]); },
  };
}

/**
 * Frame times in seconds: every `fastMs` up to `fastUntilS`, then every `slowMs` up to `totalS` (inclusive).
 * Parsed from "--shots 500@60,2000@120" by parseShots.
 */
export function shotSchedule({ fastMs = 500, fastUntilS = 60, slowMs = 2000, totalS = 120 } = {}) {
  const out = [];
  for (let t = 0; t < Math.min(fastUntilS, totalS) * 1000; t += fastMs) out.push(t / 1000);
  for (let t = Math.min(fastUntilS, totalS) * 1000; t <= totalS * 1000; t += slowMs) out.push(t / 1000);
  return out;
}

export function parseShots(spec, totalS) {
  const m = /^(\d+)@(\d+(?:\.\d+)?),(\d+)$/.exec(spec ?? "");
  if (!spec) return shotSchedule({ totalS });
  if (!m) throw new Error(`--shots wants <fastMs>@<fastUntilS>,<slowMs>, got ${spec}`);
  return shotSchedule({ fastMs: +m[1], fastUntilS: +m[2], slowMs: +m[3], totalS });
}

/** "--profile 10@60" -> { seconds: 10, at: 60 } */
export function parseProfile(spec) {
  const m = /^(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)$/.exec(spec ?? "");
  if (!m) throw new Error(`--profile wants <seconds>@<startS>, got ${spec}`);
  return { seconds: +m[1], at: +m[2] };
}

/** CPU profile -> top self and total time by function (ms). */
export function summariseProfile(profile, n = 30) {
  const nodes = new Map(profile.nodes.map((x) => [x.id, x])), parent = new Map();
  profile.nodes.forEach((x) => (x.children ?? []).forEach((c) => parent.set(c, x.id)));
  const key = (x) => `${x.callFrame.functionName || "(anon)"} @ ${x.callFrame.url.split("/").pop()}:${x.callFrame.lineNumber}:${x.callFrame.columnNumber}`;
  const self = new Map(), total = new Map();
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] ?? 0, k = key(nodes.get(id));
    self.set(k, (self.get(k) ?? 0) + dt);
    const seen = new Set();
    for (let c = id; c; c = parent.get(c)) { const kk = key(nodes.get(c)); if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) ?? 0) + dt); } }
  });
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([f, us]) => [f, Math.round(us / 1000)]);
  return { totalMs: Math.round((profile.endTime - profile.startTime) / 1000), selfTop: top(self, n), totalTop: top(total, 15) };
}

/**
 * Heap slope in MB/min over the samples taken after the GPU resource counts went quiet.
 * samples: [{ s, heapMB, buffers, textures }] one per second. The window starts at the first second
 * from which buffers and textures held unchanged for `quietS` seconds (walk 10: a slope read while the
 * world still streams in measured load, not a leak). Least squares; null until `minS` quiet seconds exist.
 */
export function heapSlope(samples, { quietS = 5, minS = 20 } = {}) {
  let quietAt = null;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    let j = i;
    while (j + 1 < samples.length && samples[j + 1].buffers === a.buffers && samples[j + 1].textures === a.textures) j++;
    if (samples[j].s - a.s >= quietS) { quietAt = a.s; break; }
    i = j;
  }
  if (quietAt === null) return { quietAt: null, mbPerMin: null, seconds: 0 };
  const w = samples.filter((x) => x.s >= quietAt && Number.isFinite(x.heapMB));
  const seconds = w.length ? w.at(-1).s - w[0].s : 0;
  if (seconds < minS) return { quietAt, mbPerMin: null, seconds };
  const n = w.length, ms = w.reduce((t, x) => t + x.s, 0) / n, mh = w.reduce((t, x) => t + x.heapMB, 0) / n;
  const num = w.reduce((t, x) => t + (x.s - ms) * (x.heapMB - mh), 0), den = w.reduce((t, x) => t + (x.s - ms) ** 2, 0);
  return { quietAt, mbPerMin: Math.round((num / den) * 60 * 10) / 10, seconds };
}

/** A read is stalled when the renderer frame counter did not advance over the 1 s between its two samples (or is unreadable). */
export function isStalled(a, b) {
  return !(Number.isFinite(a) && Number.isFinite(b) && b > a);
}

/** Keys of the reads (incl. "final") marked `stalled: true`. */
export function stalledReads(reads, final) {
  const keys = Object.keys(reads).filter((k) => reads[k]?.stalled);
  return final?.stalled ? [...keys, "final"] : keys;
}

/** Per-read luma ratio main/compare, keyed like the reads (plus "final"); null when either luma is missing or compare is 0. */
export function lumaRatios(mainReads, compareReads, mainFinal, compareFinal) {
  const ratio = (m, c) => (Number.isFinite(m?.luma) && Number.isFinite(c?.luma) && c.luma > 0 ? Math.round((m.luma / c.luma) * 1000) / 1000 : null);
  const out = {};
  for (const k of Object.keys(mainReads)) out[k] = ratio(mainReads[k], compareReads?.[k]);
  out.final = ratio(mainFinal, compareFinal);
  return out;
}
