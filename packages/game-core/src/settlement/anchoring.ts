import type {
  SettlementBundle,
  SettlementGroundAudit,
  SettlementPlacement,
  SettlementPlacementGroundAudit,
  SettlementAnchorClass,
  SettlementKitAssetMeta,
  SettlementRun,
  TerrainHeight,
} from "./types";
import * as THREE from "three";

export interface AnchoredPlacement {
  y: number;
  gapM: number;
  buryM: number;
  requestedBuryM: number;
  overBuryM: number;
  terrainMinM: number;
  terrainMaxM: number;
  groundLineM: number;
  pivotToBaseM: number;
  complete: boolean;
}

const GROUND_EPSILON_M = 0.001;

/**
 * The ONE rotation for a placed piece, used by the draw transform, the
 * collider and every test (16h item 3).
 *
 * The compile, the export, the footprints and the connectors all rotate with
 * `wx = cx + x·cosθ − z·sinθ; wz = cz + x·sinθ + z·cosθ` (audit §5). three.js
 * `setFromAxisAngle((0,1,0), +θ)` is that convention's R(−θ), so the runtime
 * rotates by **−yawDeg**. Never "fix" this by changing the compile.
 *
 * `pitchDeg` (16e span placements) is applied after the yaw about the piece's
 * own local X axis — Euler order YXZ — so a span tilts along its length.
 */
export function placementQuaternion(yawDeg: number, pitchDeg = 0): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(pitchDeg),
    -THREE.MathUtils.degToRad(yawDeg),
    0,
    "YXZ",
  ));
}

/** The world matrix of a placement whose height has already been decided. */
export function placementTransform(placement: SettlementPlacement, y: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(placement.positionM[0], y, placement.positionM[2]),
    placementQuaternion(placement.yawDeg, placement.pitchDeg ?? 0),
    new THREE.Vector3(placement.scale, placement.scale, placement.scale),
  );
}

/**
 * Re-ground a placed kit from the streamed terrain.
 *
 * The height comes from the asset's own **designed sink** — how far below the
 * ground line its makers put its pivot (`designedSinkM.p50` on the kit
 * manifest, 16h item 1) — never from a per-class bury table. The ground
 * reference is the MEAN of the samples for every fit, stilts included (the
 * old stilt exemption and the anchor-to-the-highest-sample rule both lifted
 * pieces off the slope they stand on, audit §2), except a `dug-in` fit, which
 * anchors on the LOWEST sample: its uphill side buries deeper and nothing
 * hovers (97 §C). `fit` is the manifest's `placement.evidence.policyId`.
 *
 * `designedSinkM` is positive when the pivot sits below the ground line and is
 * in the asset's own metres, so it scales with the placement.
 */
export function anchorPlacement(
  placement: SettlementPlacement,
  groundAt: TerrainHeight,
  designedSinkM: number,
  fit?: string,
): AnchoredPlacement {
  if (!Number.isFinite(designedSinkM)) {
    throw new Error(
      `${placement.id}: ${placement.kit}/${placement.assetId} has no designedSinkM on its kit `
      + "manifest; refusing to place it on a class bury table",
    );
  }
  const samples = placement.anchor.mode === "streamed-perimeter" && placement.footprintM.length
    ? placement.footprintM
    : [[placement.positionM[0], placement.positionM[2]] as [number, number]];
  const heights = samples.map(([x, z]) => groundAt(x, z));
  const known = heights.filter((h): h is number => h !== null && Number.isFinite(h));
  const pivotToBase = placement.anchor.originOffsetM[2] * placement.scale;
  if (known.length !== heights.length || !known.length) {
    return {
      y: placement.positionM[1], gapM: Infinity, buryM: 0,
      requestedBuryM: 0, overBuryM: 0,
      terrainMinM: NaN, terrainMaxM: NaN, groundLineM: NaN,
      pivotToBaseM: pivotToBase,
      complete: false,
    };
  }
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const mean = known.reduce((sum, h) => sum + h, 0) / known.length;
  const sink = designedSinkM * placement.scale;
  const groundLine = fit === "dug-in" ? lo : mean;
  const y = groundLine - sink;
  return {
    // The designed sink IS the answer, so requested and applied are the same
    // number; `buryCapM` survives only as the cap on the policy fallback the
    // export now reports as a gap, and can no longer clamp a mined value.
    y,
    // The piece's base is `pivotToBase` BELOW its pivot (originOffsetM[2] is
    // the pivot's height over the measured LOD0 min); the residual gap is how
    // far that base still floats over the LOWEST sample under the footprint.
    gapM: Math.max(0, y - pivotToBase - lo),
    buryM: sink,
    requestedBuryM: sink,
    overBuryM: 0,
    terrainMinM: lo,
    terrainMaxM: hi,
    groundLineM: groundLine,
    pivotToBaseM: pivotToBase,
    complete: true,
  };
}

/** How far a run joint may step off its mined rise before it is a defect. */
export const RUN_JOINT_TOLERANCE_M = 0.005;

/**
 * Seat a modular run (walls, fences, docks) as ONE rigid chain, as the
 * compile lays it (compile_settlement.py, the `pieces` branch: one datum for
 * the run, each piece at datum + its cumulative mined rise). The datum is
 * taken from the streamed ground here, not the compile's survey datum (the
 * highest parcel sample minus BURY_M), so the run's height can differ from
 * the compiled one while its joints cannot. Seating each piece on its own
 * ground stepped the joints by the terrain's difference under neighbouring
 * pieces (16h check-in 3 §2).
 *
 * Datum = the member with the highest mean ground under its own footprint;
 * its pivot sits at that mean minus its designed sink; every other member
 * sits at the datum's pivot plus (its riseM - the datum's riseM), so adjacent
 * pieces differ by exactly their mined rise. Returns null while any member's
 * terrain is missing; throws on a malformed run record.
 */
export function anchorRun(
  members: readonly SettlementPlacement[],
  groundAt: TerrainHeight,
  designedSinkOf: (p: SettlementPlacement) => number,
): Map<string, AnchoredPlacement> | null {
  const runId = members[0]?.run?.id ?? "?";
  const indices = members.map((m) => m.run?.index);
  const sorted = [...indices].sort((a, b) => (a ?? -1) - (b ?? -1));
  if (sorted.some((index, i) => index !== i)) {
    throw new Error(`run ${runId}: member indices ${JSON.stringify(indices)} are not 0..${members.length - 1}`);
  }
  for (const m of members) {
    if (m.run?.id !== runId || !Number.isFinite(m.run.riseM)) {
      throw new Error(`${m.id}: run member carries no finite riseM for run ${runId}`);
    }
  }
  const own = members.map((m) => anchorPlacement(m, groundAt, designedSinkOf(m)));
  if (own.some((a) => !a.complete)) return null;
  let datum = 0;
  own.forEach((a, i) => { if (a.groundLineM > own[datum].groundLineM) datum = i; });
  const yDatum = own[datum].y;
  const riseDatum = (members[datum].run as SettlementRun).riseM;
  const out = new Map<string, AnchoredPlacement>();
  members.forEach((m, i) => {
    const y = yDatum + (m.run as SettlementRun).riseM - riseDatum;
    const a = own[i];
    out.set(m.id, {
      ...a,
      y,
      gapM: Math.max(0, y - a.pivotToBaseM - a.terrainMinM),
      overBuryM: 0,
    });
  });
  return out;
}

/** One drawn run member: its run record and the pivot height it was drawn at. */
export interface RunJointSample {
  placementId: string;
  run: SettlementRun;
  y: number;
}

/**
 * The run-joint gate: every pair of adjacent members of a run (both drawn)
 * must step by its mined rise within RUN_JOINT_TOLERANCE_M. Returns one line
 * per failing joint.
 */
export function runJointErrors(samples: readonly RunJointSample[]): string[] {
  const byRun = new Map<string, RunJointSample[]>();
  for (const s of samples) {
    const rows = byRun.get(s.run.id) ?? [];
    rows.push(s);
    byRun.set(s.run.id, rows);
  }
  const errors: string[] = [];
  for (const [runId, rows] of byRun) {
    rows.sort((a, b) => a.run.index - b.run.index);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      if (b.run.index !== a.run.index + 1) continue;
      const off = (b.y - a.y) - (b.run.riseM - a.run.riseM);
      if (Math.abs(off) > RUN_JOINT_TOLERANCE_M) {
        errors.push(`run ${runId}: ${a.placementId} -> ${b.placementId} steps `
          + `${(off * 1000).toFixed(1)} mm off its mined rise`);
      }
    }
  }
  return errors.sort();
}

/**
 * The one final world transform for every architecture tier.
 *
 * Near instances and far merged geometry must both start here, after streamed
 * terrain (including compiled pad grades) has supplied the final anchor.  LOD
 * selection is deliberately absent: changing visual detail may never change
 * the placement transform.
 */
export function finalPlacementTransform(
  placement: SettlementPlacement,
  anchored: AnchoredPlacement,
): THREE.Matrix4 {
  if (!anchored.complete) {
    throw new Error(`${placement.id}: final transform requested before terrain anchoring completed`);
  }
  return placementTransform(placement, anchored.y);
}

/**
 * A child mounted on another placement (anchor class wall / hanging / deck):
 * its parent's FINAL runtime transform, then the mined mount offset in the
 * parent's local frame, then the child's own yaw/pitch. Terrain is never
 * sampled for one of these (16h item 2).
 */
export function mountedTransform(
  parent: THREE.Matrix4,
  placement: SettlementPlacement,
): THREE.Matrix4 {
  const offset = placement.mountOffsetM;
  if (!offset) {
    throw new Error(
      `${placement.id}: ${placement.anchorClass} child names parent `
      + `${placement.parentPlacementId} but carries no mountOffsetM`,
    );
  }
  return parent.clone()
    .multiply(new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]))
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(
      placementQuaternion(placement.yawDeg, placement.pitchDeg ?? 0),
    ));
}

/**
 * A hull or other `water` child floats on the recorded level of the body its
 * berth names, sunk by its designed waterline. The ground under the water is
 * never sampled (16h item 2).
 */
export function waterPlacementY(
  placement: SettlementPlacement,
  designedWaterlineM: number,
): number {
  if (!Number.isFinite(placement.waterLevelM)) {
    throw new Error(`${placement.id}: water-class placement carries no waterLevelM`);
  }
  if (!Number.isFinite(designedWaterlineM)) {
    throw new Error(
      `${placement.id}: ${placement.kit}/${placement.assetId} has no designedWaterlineM on its kit manifest`,
    );
  }
  return (placement.waterLevelM as number) - designedWaterlineM * placement.scale;
}

/** Apply the asset part's measured local transform after the final anchor. */
export function finalPartTransform(
  placement: SettlementPlacement,
  anchored: AnchoredPlacement,
  localMatrix: THREE.Matrix4,
): THREE.Matrix4 {
  return finalPlacementTransform(placement, anchored).multiply(localMatrix);
}

export function placementGroundAudit(
  placement: SettlementPlacement,
  anchored: AnchoredPlacement,
): SettlementPlacementGroundAudit {
  const floating = anchored.complete && anchored.gapM > GROUND_EPSILON_M;
  const overBuried = anchored.complete && anchored.overBuryM > GROUND_EPSILON_M;
  const status = !anchored.complete ? "terrain-unavailable"
    : floating && overBuried ? "floating-and-over-buried"
    : floating ? "floating"
    : overBuried ? "over-buried"
    : "grounded";
  return {
    placementId: placement.id,
    settlementId: placement.sourceId,
    status,
    terrainMinM: anchored.complete ? anchored.terrainMinM : null,
    terrainMaxM: anchored.complete ? anchored.terrainMaxM : null,
    groundLineM: anchored.complete ? anchored.groundLineM : null,
    pivotToBaseM: anchored.pivotToBaseM,
    configuredBuryM: placement.anchor.buryM,
    requestedBuryM: anchored.complete ? anchored.requestedBuryM : null,
    appliedBuryM: anchored.complete ? anchored.buryM : null,
    buryCapM: placement.anchor.buryCapM,
    gapM: anchored.complete ? anchored.gapM : null,
    overBuryM: anchored.complete ? anchored.overBuryM : null,
  };
}

/** Keep reports settlement-shaped so a bad place cannot hide in province totals. */
export function settlementGroundAudits(
  settlements: SettlementBundle["settlements"],
  placements: readonly SettlementPlacementGroundAudit[],
): SettlementGroundAudit[] {
  const byId = new Map(placements.map((placement) => [placement.placementId, placement]));
  return settlements.map((settlement) => {
    const rows = settlement.placementIds
      .map((id) => byId.get(id))
      .filter((row): row is SettlementPlacementGroundAudit => row?.settlementId === settlement.id)
      .sort((a, b) => a.placementId.localeCompare(b.placementId));
    const has = (status: string, part: string) => status === part || status.includes(part);
    return {
      settlementId: settlement.id,
      placementsExpected: settlement.placementIds.length,
      placementsAudited: rows.length,
      terrainUnavailable: rows.filter((row) => row.status === "terrain-unavailable").length,
      floating: rows.filter((row) => has(row.status, "floating")).length,
      overBuried: rows.filter((row) => has(row.status, "over-buried")).length,
      maxGapM: Math.max(0, ...rows.map((row) => row.gapM ?? 0)),
      maxOverBuryM: Math.max(0, ...rows.map((row) => row.overBuryM ?? 0)),
      placements: rows,
    };
  });
}

export function footprintDiagonalM(placement: SettlementPlacement): number {
  const points = placement.footprintM;
  if (!points.length) return 8;
  let best = 0;
  for (const a of points) for (const b of points) {
    best = Math.max(best, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return Math.max(1, best);
}

/** Where a resolved placement stands: its world matrix, and its terrain audit
 * when it was grounded (a mounted or floating piece has none). */
export interface ResolvedPlacement {
  matrix: THREE.Matrix4;
  anchored: AnchoredPlacement | null;
}

/**
 * The one anchor-class rule (16h item 2), shared by the layer and the tests.
 *
 *  - `water`   — sits at the berth's recorded level minus its designed waterline.
 *  - `wall` / `hanging` — REQUIRE a placed parent (from a mined mount pair);
 *    with none, a named error, never a drop onto the ground.
 *  - `deck`    — with a parent, seated on that parent's final transform plus
 *    the mined/derived `mountOffsetM`; with none (the compile found no placed
 *    parent whose footprint contains its pivot) it is grounded on terrain
 *    exactly like `ground`.
 *  - `ground`  — sinks by `designedSinkM.p50` on the streamed terrain.
 *
 * `null` means "not yet": a parent or a terrain sample has not arrived.
 */
export function resolvePlacement(
  placement: SettlementPlacement,
  anchorClass: SettlementAnchorClass,
  lookup: {
    groundAt: TerrainHeight;
    designedSinkM: number;
    designedWaterlineM: number;
    /** The manifest fit (`placement.evidence.policyId`); see anchorPlacement. */
    fit?: string;
    parentTransform: () => THREE.Matrix4 | null;
  },
): ResolvedPlacement | null {
  if (anchorClass === "water") {
    return {
      matrix: placementTransform(placement, waterPlacementY(placement, lookup.designedWaterlineM)),
      anchored: null,
    };
  }
  if (placement.parentPlacementId) {
    const parent = lookup.parentTransform();
    if (!parent) return null;
    return { matrix: mountedTransform(parent, placement), anchored: null };
  }
  if (anchorClass === "wall" || anchorClass === "hanging") {
    throw new Error(`${placement.id}: ${anchorClass} placement names no parentPlacementId`);
  }
  const anchored = anchorPlacement(placement, lookup.groundAt, lookup.designedSinkM, lookup.fit);
  if (!anchored.complete) return null;
  return { matrix: finalPlacementTransform(placement, anchored), anchored };
}

/**
 * The one resolver the layer and the shipped-bundle gate both use: each
 * placement's final transform, children after their parent, memoised. The
 * anchor class is the placement's own, else its kit manifest's, else ground.
 * `null` means "not yet" (a manifest or terrain chunk has not arrived); a
 * record the runtime cannot realise throws with the placement id.
 */
export function createPlacementResolver(
  placements: readonly SettlementPlacement[],
  metaOf: (p: SettlementPlacement) => SettlementKitAssetMeta | undefined,
  groundAt: TerrainHeight,
): (p: SettlementPlacement) => ResolvedPlacement | null {
  const byId = new Map(placements.map((p) => [p.id, p]));
  const byRun = new Map<string, SettlementPlacement[]>();
  for (const p of placements) {
    if (!p.run) continue;
    const rows = byRun.get(p.run.id) ?? [];
    rows.push(p);
    byRun.set(p.run.id, rows);
  }
  const resolved = new Map<string, ResolvedPlacement>();
  /** Seat a whole run at once (anchorRun); every member lands in `resolved`. */
  const resolveRun = (runId: string): boolean => {
    const members = byRun.get(runId) as SettlementPlacement[];
    const metas = members.map(metaOf);
    if (metas.some((meta) => !meta)) return false;
    const seats = anchorRun(members, groundAt,
      (m) => metas[members.indexOf(m)]?.designedSinkM?.p50 as number);
    if (!seats) return false;
    for (const m of members) {
      const anchored = seats.get(m.id) as AnchoredPlacement;
      resolved.set(m.id, { matrix: finalPlacementTransform(m, anchored), anchored });
    }
    return true;
  };
  const resolve = (p: SettlementPlacement, chain: string[]): ResolvedPlacement | null => {
    const cached = resolved.get(p.id);
    if (cached) return cached;
    if (chain.includes(p.id)) {
      throw new Error(`settlement mount cycle: ${[...chain, p.id].join(" -> ")}`);
    }
    const meta = metaOf(p);
    if (!meta) return null;
    const anchorClass = p.anchorClass ?? meta.anchorClass ?? "ground";
    if (p.run && !p.parentPlacementId && anchorClass !== "water"
        && anchorClass !== "wall" && anchorClass !== "hanging") {
      return resolveRun(p.run.id) ? resolved.get(p.id) ?? null : null;
    }
    let parentResolved: ResolvedPlacement | null = null;
    if (p.parentPlacementId) {
      const parent = byId.get(p.parentPlacementId);
      if (!parent) {
        throw new Error(
          `${p.id}: ${anchorClass} child names parent ${p.parentPlacementId}, `
          + "which is in no placement in this bundle");
      }
      parentResolved = resolve(parent, [...chain, p.id]);
      if (!parentResolved) return null;
    }
    const out = resolvePlacement(p, anchorClass, {
      groundAt,
      designedSinkM: meta.designedSinkM?.p50 as number,
      designedWaterlineM: meta.designedWaterlineM as number,
      fit: meta.fit,
      parentTransform: () => parentResolved?.matrix ?? null,
    });
    if (!out) return null;
    resolved.set(p.id, out);
    return out;
  };
  return (p) => resolve(p, []);
}
