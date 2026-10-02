// Pure helpers of walk_run.mjs (tooling/gpu-lane/walk/README.md); tested in walk-lib.test.mjs.

/** Route bearings are compass radians (0 north = -z, pi/2 east = +x). The follow camera sits at
 * player + (sin yaw, cos yaw) * arm and looks back at the player, so it looks along compass -yaw. */
export const camYaw = (bearing) => -bearing;

/** Compass bearing and distance from a to b ([x, z] metres). */
export function legTo(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return { bearing: Math.atan2(dx, -dz), distM: Math.hypot(dx, dz) };
}

/** A walk is given 1.5x its expected time (distance / speed) and at least 2 s before the teleport fallback. */
export const walkBudgetS = (distM, speedMps) => Math.max(2, (1.5 * distM) / speedMps);

export function parseArgs(argv) {
  const o = { route: null, cdp: "127.0.0.1:9242", t: ["12", "22"], w: "clear", out: null, origin: "http://127.0.0.1:8099",
    base: "/elder-souls-argonia/studio/", width: 1280, height: 720, settle: 10, speed: 3.5, readyTimeout: 150, only: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, ""), v = argv[i + 1];
    if (!(k in o)) throw new Error(`walk_run: unknown flag --${k}`);
    i++;
    if (k === "t") o.t = v.split(",");
    else if (["width", "height", "settle", "speed", "readyTimeout"].includes(k)) o[k] = Number(v);
    else o[k] = v;
  }
  if (!o.route || !o.out) throw new Error("usage: walk_run.mjs --route <route.json> --out <dir> [--cdp host:port] [--t 12,22] [--w clear]");
  return o;
}

/** A pass is "day" when its hour is 07-18; doors are entered on day passes only. */
export const isDay = (t) => { const h = Number(String(t).split(":")[0]); return h >= 7 && h < 19; };

/** Coverage of one run against its route: doors entered/exited, fixtures in a fire action, fallbacks. */
export function coverage(route, passes) {
  const doors = new Map(route.doors.map((d) => [d, { entered: false, exited: false }]));
  const seen = new Set();
  let fallbacks = 0;
  for (const p of passes) {
    for (const w of p.waypoints ?? []) {
      if (w.fallback) fallbacks++;
      for (const a of w.actions ?? []) {
        if (a.type === "door" && doors.has(a.doorId)) {
          const d = doors.get(a.doorId);
          d.entered ||= !!a.entered; d.exited ||= !!a.exited;
        }
        if (a.type === "fire" && a.shots?.length) a.fixtureIds.forEach((f) => seen.add(f));
        if (a.type === "door" && a.fallback) fallbacks++;
      }
    }
  }
  const vals = [...doors.values()];
  return {
    doors: route.doors.length, doorsEntered: vals.filter((d) => d.entered).length, doorsExited: vals.filter((d) => d.exited).length,
    fixtures: route.fixtures.length, fixturesSeen: route.fixtures.filter((f) => seen.has(f)).length, teleportFallbacks: fallbacks,
  };
}
