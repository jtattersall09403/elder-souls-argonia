import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  AIR_SPECIES,
  AirSwarm,
  airAmounts,
  seededRandom,
  type AirConditions,
} from "./ambientAir";
import { SunShafts, sunShaftIntensity } from "./sunShafts";

/**
 * The ambient air layer: fireflies, midges, pollen, leaf fall and sun shafts
 * (owner 2026-09-10, module 55 polish tier).
 *
 * Deliberately a LEAF in the scene graph. It reads one injected ref, writes
 * to meshes it owns, and touches nothing else — no shared uniforms, no
 * registry, no module singleton (engineering standard 5), so it can be
 * switched off or deleted without any other system noticing. `enabled={false}`
 * or `__STUDIO_AIR__ = 0` in the console removes every draw call it owns.
 *
 * The conditions arrive by REF rather than as props because they change every
 * frame: passing them as props would re-render the React tree at frame rate.
 * The host's frame loop writes the ref; this component reads it.
 */
export interface AmbientAirConditions {
  /** Unit vector toward the sun. */
  sunDir: THREE.Vector3;
  sunAltDeg: number;
  /** Sunlight colour, for the shafts. */
  sunColour: THREE.Color;
  /** Local relative humidity 0..1 at the camera — the marsh/upland axis. */
  humidity: number;
  /** Rain 0..1. */
  rain: number;
  /** Total cloud cover 0..1. */
  cloud: number;
  windSpeed: number;
  /** Unit wind direction in XZ. */
  windDirXZ: [number, number];
  /** Canopy density overhead 0..1. Sun shafts need something to come
   * through; with no canopy value available, leave it 0 and they stay off. */
  canopy: number;
  /** Renderer exposure, so the layer tracks the rest of the scene rather
   * than blowing out at night or vanishing at noon. */
  exposure: number;
}

declare global {
  interface Window {
    /** Debug override: 0 forces the whole layer off, >1 exaggerates it for
     * checking. Undefined leaves the derived amounts alone. */
    __STUDIO_AIR__?: number;
  }
}

export function AmbientAir({
  conditions,
  enabled = true,
}: {
  conditions: RefObject<AmbientAirConditions | null>;
  enabled?: boolean;
}) {
  const { camera, gl } = useThree();
  const clock = useRef(0);

  const swarms = useMemo(() => {
    // One fixed seed: the same swarm every session, on every machine.
    const rand = seededRandom(0x5eeda12);
    return Object.values(AIR_SPECIES).map((s) => new AirSwarm(s, rand));
  }, []);
  const shafts = useMemo(() => new SunShafts(undefined, seededRandom(0x511af75)), []);

  useEffect(
    () => () => {
      for (const s of swarms) s.dispose();
      shafts.dispose();
    },
    [swarms, shafts],
  );

  useFrame((_, delta) => {
    const c = conditions.current;
    const override = typeof window !== "undefined" ? window.__STUDIO_AIR__ : undefined;
    const gain = enabled && c ? (override ?? 1) : 0;
    if (gain <= 0 || !c) {
      for (const s of swarms) s.points.visible = false;
      shafts.mesh.visible = false;
      return;
    }
    // Real seconds, not world time: a firefly blinks at its own rate however
    // fast the world clock is running.
    clock.current += Math.min(delta, 0.1);

    const air: AirConditions = {
      sunAltDeg: c.sunAltDeg,
      humidity: c.humidity,
      rain: c.rain,
      cloud: c.cloud,
      windSpeed: c.windSpeed,
      cameraY: camera.position.y,
    };
    const amounts = airAmounts(air);
    const pr = gl.getPixelRatio();
    for (const s of swarms) {
      s.update(
        (amounts[s.species.id] ?? 0) * gain,
        camera,
        clock.current,
        pr,
        c.sunDir,
        c.windDirXZ,
        c.windSpeed,
      );
    }

    const shaftAmount = sunShaftIntensity({
      sunAltDeg: c.sunAltDeg,
      cloud: c.cloud,
      rain: c.rain,
      canopy: c.canopy,
      humidity: c.humidity,
      cameraY: camera.position.y,
    });
    shafts.update(
      shaftAmount * gain * 0.5 * Math.min(2, c.exposure),
      camera,
      c.sunDir,
      c.sunColour,
    );
  });

  return (
    <>
      {swarms.map((s) => (
        <primitive key={s.species.id} object={s.points} />
      ))}
      <primitive object={shafts.mesh} />
    </>
  );
}
