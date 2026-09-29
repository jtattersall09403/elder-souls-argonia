import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  fillDue,
  GC_CORE_M,
  GC_SECTORS,
  generateBudgetMs,
  SectorCuller,
  sectorOf,
  viewPriority,
} from "./groundcoverSchedule";

/** The ring as Groundcover keeps it at medium quality: 16 m tiles out to the
 * far radius (145 m) plus the 14 m overlap. */
const TILE = 16;
const KEEP_M = 145 + 14;
const RING_M = 75;
const NEAR_PHASE_M = RING_M * 0.4 + 14;
const MID_PHASE_M = RING_M + 14;

interface Tile { tx: number; tz: number; nearest: number; cx: number; cz: number; instances: number }

function ring(focusX: number, focusZ: number): Tile[] {
  const out: Tile[] = [];
  const reach = Math.ceil(KEEP_M / TILE);
  const ftx = Math.floor(focusX / TILE); const ftz = Math.floor(focusZ / TILE);
  for (let tz = ftz - reach; tz <= ftz + reach; tz++) {
    for (let tx = ftx - reach; tx <= ftx + reach; tx++) {
      const cx = (tx + 0.5) * TILE; const cz = (tz + 0.5) * TILE;
      const nearest = Math.hypot(
        Math.max(0, Math.abs(focusX - cx) - TILE / 2),
        Math.max(0, Math.abs(focusZ - cz) - TILE / 2));
      if (nearest > KEEP_M) continue;
      // Density as the fill writes it: every tier's copies inside the mid
      // ring, the FAR thin (35 %) outside it.
      const instances = nearest <= MID_PHASE_M ? 100 : 35;
      out.push({ tx, tz, nearest, cx, cz, instances });
    }
  }
  return out;
}

function camera(yawDeg: number): THREE.PerspectiveCamera {
  // Third-person: 4 m behind the feet, 1.8 m up, looking along the yaw.
  const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
  const a = (yawDeg * Math.PI) / 180;
  const fx = Math.cos(a); const fz = Math.sin(a);
  cam.position.set(-4 * fx, 1.8, -4 * fz);
  cam.lookAt(20 * fx, 0.5, 20 * fz);
  cam.updateMatrixWorld();
  return cam;
}

function boxOf(t: Tile): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(t.tx * TILE, -1, t.tz * TILE),
    new THREE.Vector3((t.tx + 1) * TILE, 4, (t.tz + 1) * TILE));
}

function measureCull(sectors: number, yawDeg: number) {
  const tiles = ring(0, 0);
  const cam = camera(yawDeg);
  const exact = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const slots = sectors === 1 ? 1 : sectors + 1;
  const culler = new SectorCuller(slots);
  const perSlot = new Array(slots).fill(0);
  let total = 0; let inView = 0;
  for (const t of tiles) {
    const s = sectorOf(t.cx, t.cz, 0, 0, t.nearest, sectors);
    const b = boxOf(t);
    culler.add(s, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z);
    perSlot[s] += t.instances;
    total += t.instances;
    if (exact.intersectsBox(b)) inView += t.instances;
  }
  let submitted = total;
  let visibleSlots = slots;
  if (slots > 1) {
    visibleSlots = culler.test(culler.frustumOf(cam));
    submitted = 0;
    for (let s = 0; s < slots; s++) if (culler.visible[s]) submitted += perSlot[s];
  }
  return { total, inView, submitted, visibleSlots, slots };
}

describe("ground-cover wedge culling", () => {
  it("submits what is in view, never less", () => {
    const rows: string[] = [];
    for (const yaw of [0, 37, 90, 180, 250]) {
      const before = measureCull(1, yaw);
      const after = measureCull(GC_SECTORS, yaw);
      const four = measureCull(4, yaw);
      rows.push(`  4 wedges: submitted ${four.submitted}, slots ${four.visibleSlots}/${four.slots}`);
      // Never cull a tile that is in view.
      expect(after.submitted).toBeGreaterThanOrEqual(after.inView);
      // The single ring mesh submits everything (its sphere holds the camera).
      expect(before.submitted).toBe(before.total);
      // The wedges cut at least 40 % of the submitted instances.
      expect(after.submitted).toBeLessThan(0.6 * before.submitted);
      rows.push(`yaw ${yaw}: total ${before.total}, in view ${after.inView}, `
        + `submitted ${before.submitted} -> ${after.submitted}, slots ${after.visibleSlots}/${after.slots}`);
    }
    process.stderr.write(`[gc cull]\n${rows.join("\n")}\n`);
  });

  it("the core disc holds every tile near the feet, whatever the bearing", () => {
    expect(sectorOf(8, -30, 0, 0, GC_CORE_M, 8)).toBe(0);
    expect(sectorOf(100, 0, 0, 0, 90, 8)).toBeGreaterThan(0);
    expect(sectorOf(100, 0, 0, 0, 90, 1)).toBe(0);
  });

  it("orders in-view tiles ahead of behind tiles at the same distance", () => {
    expect(viewPriority(60, 60, 0, 1, 0)).toBeLessThan(viewPriority(60, -60, 0, 1, 0));
    expect(viewPriority(10, -10, 0, 1, 0)).toBe(10);
  });
});

/**
 * Startup replay (walk 5): the ring fills from empty while the terrain's
 * LOD 1 chunks arrive. Tile cost model from the owner's HUD (M2,
 * 2026-09-29): a plain tile ~4 ms, one in 20 beside a road clearance ~45 ms
 * ("cand 49.2 ms"), a far-thinned tile 35 % of that. The frame is 16.7 ms
 * plus whatever the ground cover spends.
 *
 * AFTER's road tile is 4 + 41 / 3.5 ms: the polygon grid (e32109e9) cut the
 * candidate test beside a road 70 -> 20 ms in node on the published patches.
 *
 * BEFORE is the pre-walk-5 useFrame: budget 14 ms while > 40 tiles are
 * wanted else 5 ms, at most 8 tiles a call, a fill every 0.25 s while
 * generating and on every chunk arrival, tiles generated on whatever LOD is
 * loaded. AFTER is `generateBudgetMs` + `fillDue` + LOD 1 only.
 */
function replayStartup(policy: "before" | "after") {
  const tiles = ring(0, 0);
  const cost = (t: Tile, i: number) => {
    const road = policy === "before" ? 45 : 4 + 41 / 3.5;
    const base = (i * 7919) % 20 === 0 ? road : 4;
    return t.nearest > MID_PHASE_M ? base * 0.35 : base;
  };
  const byIndex = tiles.map((t, i) => ({ t, ms: cost(t, i), done: false, coarse: false }));
  // Terrain: LOD 4 everywhere at 0.3 s, LOD 1 under the ring at 1.2 s (one
  // chunk), 1.6 s (two more), 2.4 s (the fourth).
  const lod1At = (t: Tile) => (t.cx < 0 && t.cz < 0 ? 1.2 : t.cx >= 0 && t.cz >= 0 ? 2.4 : 1.6);
  const lod4At = 0.3;
  const arrivals = [0.3, 1.2, 1.6, 1.6, 2.4];
  let clock = 0; let lastFill = 0; let sinceFill = 0; let fills = 0;
  let phases = 0; let genStart: number | null = null; let lastRemaining = Infinity;
  let mean = 2;
  let maxFrameMs = 0; let settledS = 0; let arrived = 0; let wavesAfterNear = 0;
  for (let frame = 0; frame < 3000; frame++) {
    let spent = 0;
    // Chunk arrivals (the old code refilled the ring on each).
    while (arrived < arrivals.length && arrivals[arrived] <= clock) {
      arrived++;
      if (policy === "before") { fills++; }
    }
    const ready = (t: Tile) => policy === "before"
      ? clock >= lod4At
      : clock >= lod1At(t);
    const wanted = byIndex.filter((e) => !e.done)
      .sort((a, b) => a.t.nearest - b.t.nearest);
    if (genStart === null) genStart = clock;
    const budget = policy === "before"
      ? (wanted.length > 40 ? 14 : 5)
      : generateBudgetMs(clock - genStart, lastRemaining);
    const maxTiles = policy === "before" ? 8 : 12;
    let generated = 0; let attempted = 0; let i = 0; let waiting = 0;
    const lookahead = policy === "before" ? 0 : mean;
    const missingWithin = [0, 0];
    const countMissing = (t: Tile) => {
      if (t.nearest <= NEAR_PHASE_M) missingWithin[0]++;
      if (t.nearest <= MID_PHASE_M) missingWithin[1]++;
    };
    for (; i < wanted.length; i++) {
      if (attempted > 0 && (spent + lookahead > budget || generated >= maxTiles)) break;
      const e = wanted[i];
      attempted++;
      if (!ready(e.t)) { waiting++; countMissing(e.t); continue; }
      spent += e.ms;
      mean += (e.ms - mean) * 0.2;
      e.done = true;
      e.coarse = policy === "before" && clock < lod1At(e.t);
      generated++;
    }
    for (let k = i; k < wanted.length; k++) countMissing(wanted[k].t);
    const remaining = wanted.length - i;
    const missing = remaining + waiting;
    lastRemaining = remaining;
    sinceFill += generated;
    let fill = false;
    if (policy === "before") {
      fill = sinceFill > 0 && (remaining === 0 || clock - lastFill > 0.25);
    } else {
      const due = fillDue({
        generatedSinceFill: sinceFill, remaining: missing, remainingWithin: missingWithin,
        phasesFilled: phases, cold: true, sinceLastFillS: clock - lastFill,
      });
      fill = due.fill;
      if (fill) phases = due.phase;
    }
    if (fill) {
      fills++; lastFill = clock; sinceFill = 0;
      if (missingWithin[0] === 0 && missing > 0) wavesAfterNear++;
    }
    if (spent > maxFrameMs) maxFrameMs = spent;
    clock += (16.7 + spent) / 1000;
    if (missing === 0 && sinceFill === 0) { settledS = clock; break; }
  }
  const coarse = byIndex.filter((e) => e.coarse).length;
  return { tiles: tiles.length, fills, settledS, maxFrameMs, coarse, wavesAfterNear };
}

describe("ground-cover startup replay", () => {
  it("fills in phases, builds every tile once on LOD 1, and settles no later", () => {
    const before = replayStartup("before");
    const after = replayStartup("after");
    process.stderr.write(`[gc startup] tiles ${before.tiles}; fills ${before.fills} -> ${after.fills}; `
      + `tiles on coarse heights ${before.coarse} -> ${after.coarse}; `
      + `settled ${before.settledS.toFixed(2)} -> ${after.settledS.toFixed(2)} s; `
      + `max build ms/frame ${before.maxFrameMs.toFixed(1)} -> ${after.maxFrameMs.toFixed(1)}; `
      + `fills after the near band ${before.wavesAfterNear} -> ${after.wavesAfterNear}\n`);
    expect(after.coarse).toBe(0);
    expect(after.fills).toBeLessThanOrEqual(8);
    expect(after.fills).toBeLessThan(before.fills / 3);
    expect(after.settledS).toBeLessThanOrEqual(before.settledS + 0.5);
  });

  it("never fills with nothing new, and fills at the drain", () => {
    const base = { remaining: 10, remainingWithin: [0, 5], phasesFilled: 0, cold: true, sinceLastFillS: 0 };
    expect(fillDue({ ...base, generatedSinceFill: 0 }).fill).toBe(false);
    expect(fillDue({ ...base, generatedSinceFill: 3 })).toEqual({ fill: true, phase: 1 });
    expect(fillDue({ ...base, generatedSinceFill: 3, phasesFilled: 1 }).fill).toBe(false);
    expect(fillDue({ ...base, generatedSinceFill: 3, phasesFilled: 1, sinceLastFillS: 2 }).fill).toBe(true);
    expect(fillDue({ ...base, generatedSinceFill: 1, remaining: 0, remainingWithin: [0, 0] }).fill).toBe(true);
  });
});
