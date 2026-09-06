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
  /** Quadratic drag coefficient (N·s²/m²), including area and fluid density. */
  quadraticDrag?: number;
  /** Equal-volume probe centres in body-local metres. More probes resolve
   * irregular hulls; this column approximation is not a clipped hull solver. */
  points: Vec3[];
  /** Vertical extent (m) over which a point transitions dry → submerged. */
  pointHeightM?: number;
  /** Physics mass units per kg. Defaults to SI (1). Scale forces here rather
   * than falsifying the displaced volume when adapting legacy mass units. */
  forceScale?: number;
}

export interface BuoyancyMotion {
  /** World-space angular velocity in radians/second. */
  angularVelocity?: Vec3;
  /** World-space centre of mass; defaults to the supplied body position. */
  centerOfMass?: Vec3;
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

const GRAVITY = 9.81;

export function computeBuoyancy(
  query: WorldWaterQuery,
  epochMinutes: number,
  position: Vec3,
  rotationApply: (local: Vec3) => Vec3,
  velocity: Vec3,
  params: BuoyancyParams,
  motion: BuoyancyMotion = {},
): BuoyancyResult {
  const n = params.points.length || 1;
  const perPointVolume = params.volumeM3 / n;
  const h = params.pointHeightM ?? 0.4;
  const scale = params.forceScale ?? 1;
  const quadraticDrag = params.quadraticDrag ?? 0;
  if (![params.volumeM3, params.linearDrag, quadraticDrag, scale].every(
    (value) => Number.isFinite(value) && value >= 0,
  ) || !Number.isFinite(h) || h <= 0) {
    throw new RangeError("Buoyancy requires non-negative finite volume/drag/scale and positive point height");
  }
  const omega = motion.angularVelocity ?? { x: 0, y: 0, z: 0 };
  const com = motion.centerOfMass ?? position;
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
    // Intersect the probe's volume column with the water column. Counting
    // volume below the bed makes shallow puddles float an entire crate.
    const wetBottom = Math.max(p.y - h / 2, w.surfaceHeight - w.depth);
    const wetTop = Math.min(p.y + h / 2, w.surfaceHeight);
    const sub = Math.min(Math.max((wetTop - wetBottom) / h, 0), 1);
    immersionSum += sub;
    // The water query normalises salinity: 0 fresh … 1 seawater. This is a
    // bulk-density approximation; temperature effects are negligible here.
    const density = 1000 + 25 * Math.min(Math.max(w.salinity, 0), 1);
    const buoy = density * GRAVITY * perPointVolume * sub;
    const rx = p.x - com.x;
    const ry = p.y - com.y;
    const rz = p.z - com.z;
    // Each probe moves at v + ω × r. Centre velocity alone cannot damp
    // rolling/pitching and produces spurious drag on a co-moving body.
    const rvx = velocity.x + omega.y * rz - omega.z * ry - w.flowVelocity.x;
    const rvy = velocity.y + omega.z * rx - omega.x * rz - w.flowVelocity.y;
    const rvz = velocity.z + omega.x * ry - omega.y * rx - w.flowVelocity.z;
    const speed = Math.hypot(rvx, rvy, rvz);
    relSpeed = Math.max(relSpeed, speed * sub);
    const drag = ((params.linearDrag + quadraticDrag * speed) / n) * sub;
    const f = { x: -rvx * drag * scale, y: (buoy - rvy * drag) * scale, z: -rvz * drag * scale };
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
