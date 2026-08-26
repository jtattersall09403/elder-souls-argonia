import { useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { worldClock } from "../sky/timeState";
import { advanceWaterClock, waterTimeS } from "./waterClock";
import { SkyContext, sharedAerialUniforms } from "../sky/WorldSky";
import type { WaterAssets } from "./waterAssets";
import {
  WATER_LAYER,
  MAX_CONTACT_BODIES,
  createWaterMaterial,
  createWaterUniforms,
  type WaterTier,
  type WaterUniforms,
} from "./waterMaterial";

/**
 * One continuous camera-following water surface for the whole province
 * (decision 0025): a grid dense (≈`uniformCell` m) inside `uniformRadius`,
 * growing exponentially to `halfExtent` (open sea to the horizon). The
 * vertex shader lifts it to the compiled still-water height + waves; where
 * the province is dry the surface sits `buryM` under the terrain and the
 * fragment's scene-depth test culls it.
 */

interface GridSpec {
  uniformCell: number;
  uniformRadius: number;
  n: number;
  halfExtent: number;
}

const GRIDS: Record<"low" | "high", GridSpec> = {
  high: { uniformCell: 2.6, uniformRadius: 260, n: 320, halfExtent: 30000 },
  low: { uniformCell: 3.6, uniformRadius: 160, n: 208, halfExtent: 30000 },
};

/** Symmetric axis mapping: uniform centre, exponential fringe. */
function axisCoords(spec: GridSpec): Float32Array {
  const { uniformCell, uniformRadius, n, halfExtent } = spec;
  const half = n / 2;
  const uniformSteps = Math.floor(uniformRadius / uniformCell);
  const expSteps = half - uniformSteps;
  // growth g: uniformCell * sum_{k=1..expSteps} g^k = halfExtent - uniformRadius
  let lo = 1.0001;
  let hi = 2.0;
  const target = halfExtent - uniformSteps * uniformCell;
  for (let it = 0; it < 60; it++) {
    const g = (lo + hi) / 2;
    const sum = (uniformCell * (Math.pow(g, expSteps) - 1) * g) / (g - 1);
    if (sum > target) hi = g;
    else lo = g;
  }
  const g = (lo + hi) / 2;
  const coords = new Float32Array(n + 1);
  for (let i = 0; i <= half; i++) {
    let x: number;
    if (i <= uniformSteps) x = i * uniformCell;
    else x = uniformSteps * uniformCell + (uniformCell * (Math.pow(g, i - uniformSteps) - 1) * g) / (g - 1);
    coords[half + i] = x;
    coords[half - i] = -x;
  }
  return coords;
}

function buildWaterGeometry(spec: GridSpec): THREE.BufferGeometry {
  const axis = axisCoords(spec);
  const n = spec.n + 1;
  const pos = new Float32Array(n * n * 3);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = (z * n + x) * 3;
      pos[i] = axis[x];
      pos[i + 1] = 0;
      pos[i + 2] = axis[z];
    }
  }
  const idx = new Uint32Array(spec.n * spec.n * 6);
  let k = 0;
  for (let z = 0; z < spec.n; z++) {
    for (let x = 0; x < spec.n; x++) {
      const a = z * n + x;
      idx[k++] = a;
      idx[k++] = a + n;
      idx[k++] = a + 1;
      idx[k++] = a + 1;
      idx[k++] = a + n;
      idx[k++] = a + n + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), spec.halfExtent * 2);
  return geo;
}

/** Churn sources for contact foam: id → world pos/radius/strength/ttl. */
export interface ContactBody {
  x: number;
  z: number;
  radius: number;
  strength: number;
}

export interface WaterSurfaceHandle {
  uniforms: WaterUniforms;
  mesh: THREE.Mesh;
  materials: { above: THREE.MeshPhysicalMaterial; below: THREE.MeshPhysicalMaterial };
}

export function WaterSurfaceMesh({ assets, tier, verticalScale, contactBodies, onReady }: {
  assets: WaterAssets;
  tier: WaterTier;
  verticalScale: number;
  /** Live churn sources (player wading, splashes); read every frame. */
  contactBodies?: () => ContactBody[];
  onReady?: (handle: WaterSurfaceHandle) => void;
}) {
  const { csm } = useContext(SkyContext);
  const uniforms = useMemo(() => createWaterUniforms(assets), [assets]);
  const materials = useMemo(
    () => ({
      above: createWaterMaterial("above", { csm, aerial: sharedAerialUniforms, assets, uniforms, tier }),
      below: createWaterMaterial("below", { csm, aerial: sharedAerialUniforms, assets, uniforms, tier }),
    }),
    [csm, assets, uniforms, tier],
  );
  const geometry = useMemo(() => buildWaterGeometry(GRIDS[tier.name]), [tier.name]);
  const meshRef = useRef<THREE.Mesh>(null);
  /** Splash events become decaying, spreading foam rings (world-time secs). */
  const splashes = useRef<{ x: number; z: number; radius: number; strength: number; bornS: number }[]>([]);

  // onReady rides a ref: an inline callback from a parent that re-renders
  // per HUD tick must NEVER re-trigger this effect — round 1's perf collapse
  // was this effect disposing the live materials every parent render, which
  // forced the big water+CSM shaders to recompile continuously (and raced
  // three's compileAsync into 'isReady of undefined' crashes).
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      mesh.layers.set(WATER_LAYER);
      onReadyRef.current?.({ uniforms, mesh, materials });
    }
  }, [materials, uniforms]);
  useEffect(() => () => {
    materials.above.dispose();
    materials.below.dispose();
  }, [materials]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const cell = GRIDS[tier.name].uniformCell;
    mesh.position.set(
      Math.round(camera.position.x / cell) * cell,
      0,
      Math.round(camera.position.z / cell) * cell,
    );
    const epoch = worldClock.epochMinutes();
    // Waves/foam run on the always-live water clock (the world clock is
    // usually paused for reproducible URLs); tide/season stay on the epoch.
    advanceWaterClock(delta, worldClock.rate);
    uniforms.uWaveTime.value = waterTimeS();
    const offsets = assets.world.levelOffsets(epoch);
    uniforms.uLevelTide.value = offsets.tide;
    uniforms.uLevelSeason.value = offsets.season;
    uniforms.uVerticalScale.value = verticalScale;
    // interaction events → spreading, fading churn rings
    const nowS = waterTimeS();
    for (const e of assets.world.drainInteractions()) {
      if (e.kind === "splash" || e.kind === "enter" || e.kind === "wake") {
        splashes.current.push({
          x: e.position.x,
          z: e.position.z,
          radius: e.radius ?? 0.8,
          strength: Math.min((e.magnitude ?? 40) / 60, 1.2),
          bornS: nowS,
        });
      }
    }
    splashes.current = splashes.current.filter((s) => nowS - s.bornS < 2.0).slice(-MAX_CONTACT_BODIES);
    const bodies: ContactBody[] = [
      ...(contactBodies?.() ?? []),
      ...splashes.current.map((s) => {
        const age = Math.max(nowS - s.bornS, 0);
        return {
          x: s.x,
          z: s.z,
          radius: s.radius + age * 1.6,
          strength: s.strength * Math.max(1 - age / 2.0, 0),
        };
      }),
    ];
    uniforms.uBodyCount.value = Math.min(bodies.length, MAX_CONTACT_BODIES);
    for (let i = 0; i < uniforms.uBodyCount.value; i++) {
      const b = bodies[i];
      uniforms.uBodies.value[i].set(b.x, b.z, b.radius, b.strength);
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={materials.above}
      frustumCulled={false}
      receiveShadow
    />
  );
}
