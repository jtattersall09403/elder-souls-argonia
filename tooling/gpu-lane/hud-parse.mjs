// Parse the world studio's perf HUD text (apps/world-studio/src/character/CharacterMode.tsx,
// PerfHudSection and its lines) into numbers. Pure: text in, object out.
//   veg line:   "veg: 58 fps · gpu ~12.3/20.1 ms · cpu 4.2/8 ms · calls 512 · ..."  (or "veg: off · 58 fps · ...")
//   line 3:     "tris 3.2M / budget 4.0M: terrain 1.0M+0.5M · veg 1.2M+0.3M (near .. · card ..) · hidden 3c/2s"
//   line 4:     "gpu by pass: pre 0.1 · sky 0.4 · scene 6.2 (max 9.0) · ..."  (or "gpu(wall, not work on Metal): ..."; "n/a")
//   line 5:     "cpu by stage: pre 0.2 · veg 1.1 · ..."
const num = (s) => (s === undefined ? null : Number(s));
const M = (s) => Math.round(Number(s) * 1e6);

/** "label avg (max x) · label avg" -> { label: { avg, max? } } */
export function parseSegments(text) {
  const out = {};
  for (const part of text.split("·")) {
    const m = /^\s*([a-z]+)\s+([\d.]+)(?:\s+\(max\s+([\d.]+)\))?\s*$/.exec(part);
    if (m) out[m[1]] = m[3] ? { avg: num(m[2]), max: num(m[3]) } : { avg: num(m[2]) };
  }
  return out;
}

export function parseHud(text) {
  const lines = String(text ?? "").split("\n").map((l) => l.trim());
  const find = (re) => lines.find((l) => re.test(l));
  const hud = { fps: null, gpuMs: null, gpuMaxMs: null, gpuWall: false, cpuMs: null, cpuMaxMs: null, drawCalls: null,
    tris: null, trisBudget: null, trisByGroup: {}, hidden: null, gpuByPass: null, cpuByStage: null, raw: [] };
  const veg = find(/^veg:/);
  if (veg) {
    hud.raw.push(veg);
    hud.fps = num(/(\d+(?:\.\d+)?) fps/.exec(veg)?.[1]);
    const g = /gpu (~?)([\d.]+)\/([\d.]+) ms/.exec(veg);
    if (g) { hud.gpuWall = g[1] === "~"; hud.gpuMs = num(g[2]); hud.gpuMaxMs = num(g[3]); }
    const c = /cpu ([\d.]+)\/([\d.]+) ms/.exec(veg);
    if (c) { hud.cpuMs = num(c[1]); hud.cpuMaxMs = num(c[2]); }
    hud.drawCalls = num(/calls (\d+)/.exec(veg)?.[1]);
  }
  const tris = find(/^tris [\d.]+M \/ budget/);
  if (tris) {
    hud.raw.push(tris);
    const h = /^tris ([\d.]+)M \/ budget ([\d.]+)M:(.*)$/.exec(tris);
    hud.tris = M(h[1]); hud.trisBudget = M(h[2]);
    for (const m of h[3].matchAll(/([a-z]+) ([\d.]+)M\+([\d.]+)M/g)) hud.trisByGroup[m[1]] = { main: M(m[2]), shadow: M(m[3]) };
    const hid = /hidden (\d+)c\/(\d+)s/.exec(h[3]);
    if (hid) hud.hidden = { chunks: num(hid[1]), sectors: num(hid[2]) };
  }
  const gpu = find(/^(gpu by pass|gpu\(wall[^)]*\)):/);
  if (gpu) {
    hud.raw.push(gpu);
    if (gpu.startsWith("gpu(wall")) hud.gpuWall = true;
    const body = gpu.slice(gpu.indexOf(":") + 1).trim();
    hud.gpuByPass = body === "n/a" || body === "—" ? null : parseSegments(body);
  }
  const cpu = find(/^cpu by stage:/);
  if (cpu) {
    hud.raw.push(cpu);
    const body = cpu.slice(cpu.indexOf(":") + 1).trim();
    hud.cpuByStage = body === "—" ? null : parseSegments(body);
  }
  return hud;
}
