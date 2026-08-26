/**
 * Multi-point buoyancy + drag against the authoritative water query
 * (module 60 §45). Pure math — the app applies the returned forces to its
 * Rapier bodies (Rapier stays the authoritative rigid-body system; no
 * duplicate water physics, no GPU readback).
 */

import type { Vec3, WorldWaterQuery } from "@elder-souls/contracts";

export interface BuoyancyParams {
  /** Total displaced volume at full submersion (m³) across all points. */
  volumeM3: number;
  /** Linear drag coefficient against water-relative velocity (N·s/m). */
  linearDrag: number;
  /** Fraction of each sample point's local column counted per point. */
  points: Vec3[];
  /** Vertical extent (m) over which a point transitions dry → submerged. */
  pointHeightM?: number;
}

export interface BuoyancyResult {
  force: Vec3;
  /** World-space point → force pairs for torque application. */
  pointForces: { point: Vec3; force: Vec3 }[];
  /** Mean immersion across sample points (0 dry … 1 submerged). */
  immersion: number;
  /** Water-relative speed (m/s) — feed splashes/wakes above a threshold. */
  relativeSpeed: number;
}

const WATER_DENSITY = 1000;
const GRAVITY = 9.81;

export function computeBuoyancy(
  query: WorldWaterQuery,
  epochMinutes: number,
  position: Vec3,
  rotationApply: (local: Vec3) => Vec3,
  velocity: Vec3,
  params: BuoyancyParams,
): BuoyancyResult {
  const n = params.points.length || 1;
  const perPointVolume = params.volumeM3 / n;
  const h = params.pointHeightM ?? 0.4;
  const pointForces: { point: Vec3; force: Vec3 }[] = [];
  let fx = 0;
  let fy = 0;
  let fz = 0;
  let immersionSum = 0;
  let relSpeed = 0;
  for (const local of params.points) {
    const off = rotationApply(local);
    const p = { x: position.x + off.x, y: position.y + off.y, z: position.z + off.z };
    const w = query.sample(p, epochMinutes);
    if (w.depth <= 0) {
      pointForces.push({ point: p, force: { x: 0, y: 0, z: 0 } });
      continue;
    }
    const sub = Math.min(Math.max((w.surfaceHeight - p.y) / h + 0.5, 0), 1);
    immersionSum += sub;
    const buoy = WATER_DENSITY * GRAVITY * perPointVolume * sub;
    const rvx = velocity.x - w.flowVelocity.x;
    const rvy = velocity.y;
    const rvz = velocity.z - w.flowVelocity.z;
    relSpeed = Math.max(relSpeed, Math.hypot(rvx, rvy, rvz) * sub);
    const drag = (params.linearDrag / n) * sub;
    const f = { x: -rvx * drag, y: buoy - rvy * drag, z: -rvz * drag };
    pointForces.push({ point: p, force: f });
    fx += f.x;
    fy += f.y;
    fz += f.z;
  }
  return {
    force: { x: fx, y: fy, z: fz },
    pointForces,
    immersion: immersionSum / n,
    relativeSpeed: relSpeed,
  };
}
