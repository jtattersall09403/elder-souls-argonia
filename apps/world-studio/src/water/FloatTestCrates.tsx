import { useContext, useEffect, useMemo, useRef } from "react";
import { MeshStandardMaterial } from "three";
import { RigidBody, useBeforePhysicsStep, type RapierRigidBody } from "@react-three/rapier";
import type { Vec3, WorldWaterQuery } from "@elder-souls/contracts";
import { PhysicsMassUnits, WaterRigidBodyDriver, type WaterWorld, type BuoyancyParams } from "@elder-souls/game-core/water/index";
import { worldClock } from "../sky/timeState";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import { applyAerialPerspective } from "../sky/aerial";
import { wetnessUniforms } from "./groundWetness";
import { applySubmergedCaustics } from "@elder-souls/game-core/water/render/causticReceiver";
import { studioScaledWaterQuery } from "./studioScaledWaterQuery";

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
// (force/mass ratios preserved), pushable inertia. Collider and force adapters
// now consume one explicit unit boundary; the calibrated player is unchanged.
const MASS_UNITS = new PhysicsMassUnits(1 / 100);
const CRATES = [
  { density: 200, color: "#7a5a33" },
  { density: 700, color: "#604125" },
  { density: 1400, color: "#41433e" },
] as const;
const PARAMS: BuoyancyParams = {
  volumeM3: CRATE * CRATE * CRATE,
  linearDrag: 120,
  quadraticDrag: 160,
  points: [
    { x: -0.2, y: 0, z: -0.2 },
    { x: 0.2, y: 0, z: -0.2 },
    { x: -0.2, y: 0, z: 0.2 },
    { x: 0.2, y: 0, z: 0.2 },
  ],
  pointHeightM: CRATE,
};

export function FloatTestCrates({ origin, waterWorld, verticalScale = 1 }: {
  origin: Vec3;
  waterWorld: () => WaterWorld | null;
  verticalScale?: number;
}) {
  const { csm } = useContext(SkyContext);
  const materials = useMemo(() => CRATES.map(crate => {
    const material = new MeshStandardMaterial({ color: crate.color, roughness: 0.85 });
    csm?.setupMaterial(material);
    applyAerialPerspective(material, sharedAerialUniforms);
    applySubmergedCaustics(material, wetnessUniforms, { value: verticalScale });
    return material;
  }), [csm, verticalScale]);
  useEffect(() => () => { for (const material of materials) material.dispose(); }, [materials]);
  const bodies = useRef<(RapierRigidBody | null)[]>([null, null, null]);
  const drivers = useMemo(() => CRATES.map((_, i) => new WaterRigidBodyDriver({
    actorId: `studio.water.crate-${i}`, buoyancy: PARAMS, massUnits: MASS_UNITS,
    halfExtentsM: { x: CRATE / 2, y: CRATE / 2, z: CRATE / 2 }, contactRadiusM: CRATE * 0.6,
  })), [origin.x, origin.y, origin.z]);
  const queryCache = useRef<{ source: WorldWaterQuery; scale: number; query: WorldWaterQuery } | null>(null);
  useEffect(() => () => { for (const driver of drivers) driver.dispose(); }, [drivers]);

  useBeforePhysicsStep((physics) => {
    const ww = waterWorld();
    if (!ww) return;
    const scale = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
    if (queryCache.current?.source !== ww || queryCache.current.scale !== scale) {
      queryCache.current = { source: ww, scale, query: studioScaledWaterQuery(ww, scale) };
    }
    const query = queryCache.current.query;
    const epoch = worldClock.epochMinutes();
    // The studio manually advances fixed steps. Render-frame impulses would
    // accumulate even on frames with no physics, then kick the crates upward.
    const dt = physics.timestep;
    bodies.current.forEach((rb, i) => {
      if (!rb) return;
      drivers[i].step(query, epoch, rb, dt);
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
          density={MASS_UNITS.density(crate.density)}
          canSleep={false}
          linearDamping={0.2}
          angularDamping={0.9}
        >
          <mesh castShadow receiveShadow material={materials[i]}>
            <boxGeometry args={[CRATE, CRATE, CRATE]} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
