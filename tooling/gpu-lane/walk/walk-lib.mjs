// Pure helpers of walk_run.mjs (tooling/gpu-lane/walk/README.md); tested in walk-lib.test.mjs.

/** Route bearings are compass radians (0 north = -z, pi/2 east = +x). The follow camera sits at
 * player + (sin yaw, cos yaw) * arm and looks back at the player, so it looks along compass -yaw. */
export const camYaw = (bearing) => -bearing;

/** Compass bearing and distance from a to b ([x, z] metres). */
export function legTo(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return { bearing: Math.atan2(dx, -dz), distM: Math.hypot(dx, dz) };
}

/** Follow camera: the view ray passes through this look target over the feet (walk_route.LOOK_ABOVE_FEET_M);
 * a close-up's pitch stays in [-MAX_UP_RAD, MAX_DOWN_RAD] (walk_route.CLOSE_MAX_UP_RAD, MAX_DOWN_RAD). */
export const LOOK_ABOVE_FEET_M = 1.45, MAX_UP_RAD = 0.12, MAX_DOWN_RAD = 0.6;
/** Stop distance of an indoor walk (audit10 H8: 0.4 m missed on a 0.5 m end and fell to the exterior teleport). */
export const INDOOR_STOP_M = 1.0;

/** Compass bearing and follow-camera pitch (positive down, clamped) from feet at [x, groundY, z] to aimM [x, y, z]. */
export function aimFrom(feet, aimM) {
  const { bearing, distM } = legTo([feet[0], feet[2]], [aimM[0], aimM[2]]);
  const p = Math.atan2(feet[1] + LOOK_ABOVE_FEET_M - aimM[1], Math.max(0.5, distM));
  return { bearing, pitch: Math.max(-MAX_UP_RAD, Math.min(MAX_DOWN_RAD, p)) };
}

/** Door-entry wait predicate (audit10 H8): inside, settled, and in a cell other than the one the body was in
 * when E was pressed, so a stale interior state left by a failed exit never reads as an entry. */
export const enteredCell = (cellBefore) => (s) => s.insideInterior && !s.transitioning && !!s.cellId && s.cellId !== cellBefore;

/** A walk is given 1.5x its expected time (distance / speed) and at least 2 s before the teleport fallback. */
export const walkBudgetS = (distM, speedMps) => Math.max(2, (1.5 * distM) / speedMps);

/** A lost DevTools connection (tunnel drop, closed tab or browser), as opposed to a page-side error. */
export const cdpLost = (e) => /Target (page, context or browser )?(has been )?closed|Target closed|Browser has been closed|Session closed|WebSocket|ECONNRESET|ECONNREFUSED/i.test(String(e));

export function parseArgs(argv) {
  const o = { route: null, cdp: "127.0.0.1:9242", t: ["12", "22"], w: ["clear"], rate: 0.5, out: null, origin: "http://127.0.0.1:8099",
    base: "/elder-souls-argonia/studio/", width: 1280, height: 720, settle: 10, speed: 3.5, readyTimeout: 150, only: null, smoke: false, pod: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, ""), v = argv[i + 1];
    if (!(k in o)) throw new Error(`walk_run: unknown flag --${k}`);
    if (k === "smoke") { o.smoke = true; continue; }
    i++;
    if (k === "t") o.t = v.split(",");
    else if (k === "w") o.w = v.split(",");
    else if (["width", "height", "settle", "speed", "readyTimeout", "rate"].includes(k)) o[k] = Number(v);
    else o[k] = v;
  }
  if (!o.route || !o.out) throw new Error("usage: walk_run.mjs --route <route.json> --out <dir> [--cdp host:port] [--t 12,22] [--w clear,rain] [--rate 0.5] [--smoke]");
  if (o.w.length !== 1 && o.w.length !== o.t.length) throw new Error(`walk_run: --w has ${o.w.length} values for ${o.t.length} passes (give one, or one per --t)`);
  o.w = o.t.map((_, i) => o.w[o.w.length === 1 ? 0 : i]);
  return o;
}

/** The smoke route (README: a 1-view smoke run precedes every full walk run): the start, the first
 * door action and the first fire action only, each waypoint reached by teleport, no freeWalk. */
export function smokeRoute(route) {
  let door = null, fire = null;
  const waypoints = [];
  for (const [i, w] of route.waypoints.entries()) {
    const actions = [];
    for (const a of w.actions ?? []) {
      if (a.type === "door" && !door) { door = a; actions.push(a); }
      else if (a.type === "fire" && !fire) { fire = a; actions.push(a); }
    }
    if (i === 0 || actions.length) waypoints.push({ ...w, arrive: "teleport", actions });
  }
  return { ...route, smoke: true, freeWalk: null, waypoints,
    doors: door ? [door.doorId] : [], fixtures: fire ? [...fire.fixtureIds] : [] };
}

/** Exposure has settled when the newest luma read and the newest one at least 1 s older differ by under 2 %. */
export function lumaSettled(reads, tol = 0.02) {
  const b = reads[reads.length - 1];
  const a = b && [...reads].reverse().find((r) => b.t - r.t >= 1000);
  if (!a) return false;
  return Math.abs(b.luma - a.luma) <= tol * Math.max(a.luma, b.luma, 1);
}

/** The leg targets of one waypoint, [x, z]: its detour points (route field `detourM`, if given), then the waypoint. */
export const legTargets = (w) => [...(w.detourM ?? []), [w.xM, w.zM]];

/** The out-shot stand point and aim of a door action (route schemaVersion 2), or null without one. Pitch: positive looks down. */
export const outShotPlan = (a) => (a?.outShot?.standM ? { standM: a.outShot.standM, yaw: a.outShot.yaw, pitch: a.outShot.pitch ?? 0.1 } : null);

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
