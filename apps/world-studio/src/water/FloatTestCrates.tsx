import { useRef } from "react";
import { RigidBody, useBeforePhysicsStep, type RapierRigidBody } from "@react-three/rapier";
import type { Vec3, WorldWaterQuery } from "@elder-souls/contracts";
import { computeBuoyancy, type WaterWorld, type BuoyancyParams } from "@elder-souls/game-core/water/index";
import { worldClock } from "../sky/timeState";

/**
 * Buoyancy demo: light, laden and sinking crates dropped near the player.
 * Rapier stays the authoritative rigid-body system; each physics step samples the
 * authoritative water query at four hull points and apply Archimedes + drag
 * impulses (game-core `computeBuoyancy`). First water contact and continued
 * motion emit interaction events, which the renderer turns into foam.
 */

const CRATE = 0.8;
// The ecctrl capsule's Rapier mass is tiny (~0.25 units — default density
// over a small capsule), so a real-mass 100 kg crate is a 400:1 wall the
// player can never push (owner rounds 5-6). Scale crate mass AND its
// hydrodynamic forces by the same factor — identical float dynamics
// (force/mass ratios preserved), pushable inertia. Revisit unit scale
// properly for Phase 9 boats.
const MASS_SCALE = 1 / 100;
const CRATES = [
  { density: 200, color: "#7a5a33" },
  { density: 700, color: "#604125" },
  { density: 1400, color: "#41433e" },
] as const;
const PARAMS: BuoyancyParams = {
  volumeM3: CRATE * CRATE * CRATE,
  linearDrag: 120,
  quadraticDrag: 160,
  forceScale: MASS_SCALE,
  points: [
    { x: -0.2, y: 0, z: -0.2 },
    { x: 0.2, y: 0, z: -0.2 },
    { x: -0.2, y: 0, z: 0.2 },
    { x: 0.2, y: 0, z: 0.2 },
  ],
  pointHeightM: CRATE,
};

function rotate(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
  // quaternion rotation q * v * q⁻¹
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

/** The studio scales terrain height for inspection while crates retain their
 * displayed 80 cm dimensions. Adapt water coordinates into that physics space. */
export function studioScaledWaterQuery(query: WorldWaterQuery, verticalScale: number): WorldWaterQuery {
  const scale = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
  if (scale === 1) return query;
  return {
    sample(position, epoch) {
      const s = query.sample({ x: position.x, y: position.y / scale, z: position.z }, epoch);
      const nx = s.surfaceNormal.x, ny = s.surfaceNormal.y / scale, nz = s.surfaceNormal.z;
      const length = Math.hypot(nx, ny, nz) || 1;
      return { ...s, surfaceHeight: s.surfaceHeight * scale, depth: s.depth * scale,
        surfaceNormal: { x: nx / length, y: ny / length, z: nz / length },
        flowVelocity: { x: s.flowVelocity.x, y: s.flowVelocity.y * scale, z: s.flowVelocity.z } };
    },
    emitInteraction(event) {
      query.emitInteraction({ ...event,
        position: { ...event.position, y: event.position.y / scale },
        velocity: event.velocity ? { ...event.velocity, y: event.velocity.y / scale } : undefined });
    },
  };
}

export function FloatTestCrates({ origin, waterWorld, verticalScale = 1 }: {
  origin: Vec3;
  waterWorld: () => WaterWorld | null;
  verticalScale?: number;
}) {
  const bodies = useRef<(RapierRigidBody | null)[]>([null, null, null]);
  const wasWet = useRef([false, false, false]);
  const wakeTimer = useRef([0, 0, 0]);

  useBeforePhysicsStep((physics) => {
    const ww = waterWorld();
    if (!ww) return;
    const scale = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
    const query = studioScaledWaterQuery(ww, scale);
    const epoch = worldClock.epochMinutes();
    // The studio manually advances fixed steps. Render-frame impulses would
    // accumulate even on frames with no physics, then kick the crates upward.
    const dt = physics.timestep;
    bodies.current.forEach((rb, i) => {
      if (!rb) return;
      const p = rb.translation();
      const v = rb.linvel();
      const rot = rb.rotation();
      const res = computeBuoyancy(query, epoch, p, (local) => rotate(rot, local), v, PARAMS, {
        angularVelocity: rb.angvel(), centerOfMass: rb.worldCom(),
      });
      const water = query.sample(p, epoch);
      const relativeVelocity = {
        x: v.x - water.flowVelocity.x,
        y: (v.y - water.flowVelocity.y) / scale,
        z: v.z - water.flowVelocity.z,
      };
      const surfacePosition = { x: p.x, y: water.surfaceHeight, z: p.z };
      for (const pf of res.pointForces) {
        if (pf.force.x === 0 && pf.force.y === 0 && pf.force.z === 0) continue;
        rb.applyImpulseAtPoint(
          { x: pf.force.x * dt, y: pf.force.y * dt, z: pf.force.z * dt },
          pf.point,
          true,
        );
      }
      if (res.immersion > 0.05 && !wasWet.current[i]) {
        wasWet.current[i] = true;
        query.emitInteraction({
          kind: "splash",
          position: surfacePosition,
          velocity: v,
          actorId: `studio.water.crate-${i}`,
          magnitude: Math.min(Math.hypot(relativeVelocity.x, relativeVelocity.y, relativeVelocity.z) * 25, 130),
          radius: CRATE * 0.6,
        });
      } else if (res.immersion < 0.01) {
        wasWet.current[i] = false;
      }
      wakeTimer.current[i] -= dt;
      const surfaceContact = Math.abs(p.y - water.surfaceHeight) < CRATE * 0.65;
      const horizontalSpeed = Math.hypot(relativeVelocity.x, relativeVelocity.z);
      if (surfaceContact && res.immersion > 0.05 && horizontalSpeed > 0.35 && wakeTimer.current[i] <= 0) {
        wakeTimer.current[i] = Math.max(0.08, CRATE * 0.35 / horizontalSpeed);
        query.emitInteraction({
          kind: "wake", position: surfacePosition, velocity: v,
          actorId: `studio.water.crate-${i}`,
          magnitude: Math.min(80, horizontalSpeed * 20), radius: CRATE * 0.6,
        });
      }
    });
  });

  return (
    <>
      {CRATES.map((crate, i) => (
        <RigidBody
          key={i}
          ref={(r) => {
            bodies.current[i] = r;
          }}
          position={[origin.x + (i - 1) * 1.4, origin.y + 2.5 + i * 0.6, origin.z + 3.5]}
          colliders="cuboid"
          density={crate.density * MASS_SCALE}
          canSleep={false}
          linearDamping={0.2}
          angularDamping={0.9}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[CRATE, CRATE, CRATE]} />
            <meshStandardMaterial color={crate.color} roughness={0.85} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
