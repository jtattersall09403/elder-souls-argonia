import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, type RapierRigidBody } from "@react-three/rapier";
import type { Vec3 } from "@elder-souls/contracts";
import { computeBuoyancy, type WaterWorld, type BuoyancyParams } from "@elder-souls/game-core/water/index";
import { worldClock } from "../sky/timeState";

/**
 * Phase 8b buoyancy demo: three wooden crates dropped near the player.
 * Rapier stays the authoritative rigid-body system; each frame we sample the
 * authoritative water query at four hull points and apply Archimedes + drag
 * impulses (game-core `computeBuoyancy`). First water contact and continued
 * motion emit interaction events, which the renderer turns into foam.
 */

const CRATE = 0.8;
const PARAMS: BuoyancyParams = {
  volumeM3: CRATE * CRATE * CRATE,
  linearDrag: 260,
  points: [
    { x: -0.3, y: -0.1, z: -0.3 },
    { x: 0.3, y: -0.1, z: -0.3 },
    { x: -0.3, y: -0.1, z: 0.3 },
    { x: 0.3, y: -0.1, z: 0.3 },
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

export function FloatTestCrates({ origin, waterWorld }: {
  origin: Vec3;
  waterWorld: () => WaterWorld | null;
}) {
  const bodies = useRef<(RapierRigidBody | null)[]>([null, null, null]);
  const wasWet = useRef([false, false, false]);
  const wakeTimer = useRef([0, 0, 0]);

  useFrame((_, delta) => {
    const ww = waterWorld();
    if (!ww) return;
    const epoch = worldClock.epochMinutes();
    const dt = Math.min(delta, 0.05);
    bodies.current.forEach((rb, i) => {
      if (!rb || rb.isSleeping()) return;
      const p = rb.translation();
      const v = rb.linvel();
      const rot = rb.rotation();
      const res = computeBuoyancy(ww, epoch, p, (local) => rotate(rot, local), v, PARAMS);
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
        ww.emitInteraction({
          kind: "splash",
          position: p,
          magnitude: Math.min(Math.abs(v.y) * 25 + 25, 130),
          radius: 0.9,
        });
      } else if (res.immersion < 0.01) {
        wasWet.current[i] = false;
      }
      wakeTimer.current[i] -= dt;
      if (res.immersion > 0.15 && res.relativeSpeed > 0.6 && wakeTimer.current[i] <= 0) {
        wakeTimer.current[i] = 0.5;
        ww.emitInteraction({ kind: "wake", position: p, magnitude: 30, radius: 0.8 });
      }
    });
  });

  return (
    <>
      {[0, 1, 2].map((i) => (
        <RigidBody
          key={i}
          ref={(r) => {
            bodies.current[i] = r;
          }}
          position={[origin.x + (i - 1) * 1.4, origin.y + 2.5 + i * 0.6, origin.z + 3.5]}
          colliders="cuboid"
          density={380}
          linearDamping={0.2}
          angularDamping={0.9}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[CRATE, CRATE, CRATE]} />
            <meshStandardMaterial color="#7a5a33" roughness={0.85} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
