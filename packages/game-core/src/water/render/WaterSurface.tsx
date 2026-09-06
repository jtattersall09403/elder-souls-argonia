import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWindWaveScale } from "@elder-souls/game-core/water/index";



import { RIPPLE_PATCH_M, RippleSim } from "./RippleSim";


import type { WaterAssets, WaterRuntime } from "./types";
import { WaterEffects } from "./WaterEffects";
import { buildChannelRibbonMeshData } from "../channelRibbons";
import { InlandWaterTiles } from "./InlandWaterTiles";
import { WaterFlowContacts } from "../flowContacts";
import {
  WATER_LAYER,
  MAX_CONTACT_BODIES,
  createWaterMaterial,
  createWaterUniforms,
  type WaterTier,
  type WaterUniforms,
} from "./waterMaterial";

/** Shared material/capture across an ocean horizon grid, fixed inland tiles
 * and native channel triangles. No camera-grid triangle joins inland levels. */

interface GridSpec {
  uniformCell: number;
  uniformRadius: number;
  n: number;
  halfExtent: number;
}

const GRIDS: Record<"low" | "high", GridSpec> = {
  high: { uniformCell: 1.25, uniformRadius: 130, n: 320, halfExtent: 30000 },
  low: { uniformCell: 2.0, uniformRadius: 100, n: 208, halfExtent: 30000 },
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
  const overrides = new Float32Array(n * n * 4);
  for (let i = 3; i < overrides.length; i += 4) overrides[i] = -1;
  geo.setAttribute("waterOverride", new THREE.BufferAttribute(overrides, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
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
  meshes: THREE.Mesh[];
  materials: { above: THREE.MeshPhysicalMaterial; below: THREE.MeshPhysicalMaterial };
  effects: WaterEffects;
}

export function WaterSurfaceMesh({ assets, tier, verticalScale, farExtentM, ripple, contactBodies, onReady, runtime }: {
  runtime: WaterRuntime;
  assets: WaterAssets;
  tier: WaterTier;
  verticalScale: number;
  /** Water draw distance — walk mode needs ~6 km, the flyover 30 km. */
  farExtentM?: number;
  ripple?: RippleSim | null;
  /** Live churn sources (player wading, splashes); read every frame. */
  contactBodies?: () => ContactBody[];
  onReady?: (handle: WaterSurfaceHandle) => void;
}) {
  const csm = runtime.csm;
  const uniforms = useMemo(() => createWaterUniforms(assets), [assets]);
  const materials = useMemo(
    () => ({
      above: createWaterMaterial("above", { csm, applyAerial: runtime.applyAerial, assets, uniforms, tier }),
      below: createWaterMaterial("below", { csm, applyAerial: runtime.applyAerial, assets, uniforms, tier }),
    }),
    [csm, assets, uniforms, tier],
  );
  const geometry = useMemo(
    () => buildWaterGeometry({ ...GRIDS[tier.name], halfExtent: farExtentM ?? GRIDS[tier.name].halfExtent }),
    [tier.name, farExtentM],
  );
  const meshRef = useRef<THREE.Mesh>(null);
  const inland = useMemo(() => new InlandWaterTiles(assets.data, tier.name === "low"), [assets, tier]);
  const allMeshes = useMemo<THREE.Mesh[]>(() => [], [assets]);
  useEffect(() => () => inland.dispose(), [inland]);
  const ribbonMesh = useMemo(() => {
    const { positions, indices, groundHeights } = buildChannelRibbonMeshData(assets.meta.ribbons ?? []);
    const overrides = new Float32Array(positions.length / 3 * 4);
    for (let i = 0; i < positions.length; i += 9) {
      const x = (positions[i] + positions[i + 3] + positions[i + 6]) / 3;
      const z = (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3;
      const sample = assets.data.ribbons.sample(x, z);
      for (let j = 0; j < 3; j++) overrides.set([positions[i + j * 3 + 1], sample?.flowX ?? 0, sample?.flowZ ?? 0, 1], (i / 3 + j) * 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("waterOverride", new THREE.BufferAttribute(overrides, 4));
    geometry.setAttribute("waterGround", new THREE.BufferAttribute(groundHeights, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials.above);
    mesh.layers.set(WATER_LAYER);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    return mesh;
  }, [assets, materials]);
  useEffect(() => () => ribbonMesh.geometry.dispose(), [ribbonMesh]);
  const effects = useMemo(() => new WaterEffects({
    maxParticles: tier.name === "high" ? 768 : 256,
    onReentry: e => ripple?.addDrop(e.position.x, e.position.z, e.radius ?? 0.1, 0.006),
  }), [tier, ripple]);
  useEffect(() => () => effects.dispose(), [effects]);
  /** Splash events become decaying, spreading foam rings (world-time secs). */
  const splashes = useRef<{ x: number; z: number; radius: number; strength: number; bornS: number }[]>([]);
  const stampTimer = useRef(0);
  const rainTick = useRef(-1);
  const flowContacts = useMemo(() => new WaterFlowContacts(), [assets]);

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
      allMeshes.splice(0, allMeshes.length, mesh, ribbonMesh);
      onReadyRef.current?.({ uniforms, mesh, meshes: allMeshes, materials, effects });
    }
  }, [materials, uniforms, effects, ribbonMesh]);
  useEffect(() => () => {
    materials.above.dispose();
    materials.below.dispose();
  }, [materials]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    inland.update(camera.position.x, camera.position.z, mesh.material as THREE.Material, verticalScale);
    allMeshes.splice(0, allMeshes.length, mesh, ribbonMesh, ...inland.meshes);
    const cell = GRIDS[tier.name].uniformCell;
    mesh.position.set(
      Math.round(camera.position.x / cell) * cell,
      0,
      Math.round(camera.position.z / cell) * cell,
    );
    const epoch = runtime.epochMinutes();
    // Waves/foam run on the always-live water clock (the world clock is
    // usually paused for reproducible URLs); tide/season stay on the epoch.
    runtime.advanceClock(delta);
    uniforms.uWaveTime.value = runtime.waveTimeS();
    // Weather wind scales wave energy — same value the CPU water query uses
    // (game-core setWindWaveScale, written by WorldSky each frame).
    uniforms.uWindWave.value = getWindWaveScale();

    const offsets = assets.world.levelOffsets(epoch);
    uniforms.uLevelTide.value = offsets.tide;
    uniforms.uLevelSeason.value = offsets.season;
    runtime.onLevels(offsets.tide, offsets.season, getWindWaveScale());
    uniforms.uVerticalScale.value = verticalScale;
    // interaction events → spreading foam rings + real sim ripples
    const nowS = runtime.waveTimeS();
    for (const e of assets.world.drainInteractions()) {
      effects.emit(e);
      if (e.kind === "splash" || e.kind === "enter" || e.kind === "wake") {
        splashes.current.push({
          x: e.position.x,
          z: e.position.z,
          radius: e.radius ?? 0.8,
          strength: Math.min((e.magnitude ?? 40) / 60, 1.2),
          bornS: nowS,
        });
        ripple?.addDrop(
          e.position.x,
          e.position.z,
          (e.radius ?? 0.8) * 0.9,
          Math.min((e.magnitude ?? 40) / 300, 0.5) * (e.kind === "wake" ? 0.4 : 1),
        );
      }
    }
    // Rain stamps small impulses into the ripple patch (research §3: the sim
    // was built to take arbitrary impulses). Hashed positions, no RNG.
    const rain = runtime.rainIntensity();
    uniforms.uRainRipple.value = rain;
    if (ripple && rain > 0.05 && Math.floor(nowS * 24) !== rainTick.current) {
      // Denser stamping over the widened patch (round 2): the 64 m patch
      // needs ~3× the drops of the old 36 m one for the same visual density.
      const n = Math.min(14, Math.ceil(rain * 12));
      const tick = Math.floor(nowS * 24);
      rainTick.current = tick;
      for (let k = 0; k < n; k += 1) {
        let h = (Math.imul(tick, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
        const rx = (h % 4096) / 4096;
        h = (Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0);
        const rz = (h % 4096) / 4096;
        ripple.addDrop(
          ripple.center.x + (rx - 0.5) * RIPPLE_PATCH_M,
          ripple.center.y + (rz - 0.5) * RIPPLE_PATCH_M,
          0.3,
          0.03 + 0.05 * rain,
        );
      }
    }
    // wading churn stamps small continuous drops
    stampTimer.current -= delta;
    if (stampTimer.current <= 0) {
      stampTimer.current = 0.12;
      for (const b of contactBodies?.() ?? []) {
        if (b.strength > 0.05) ripple?.addDrop(b.x, b.z, 0.45, 0.045 * b.strength);
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
    if (ripple) {
      uniforms.uRipple.value = ripple.texture;
      uniforms.uRippleInfo.value.set(ripple.center.x, ripple.center.y, RIPPLE_PATCH_M, 1);
    }
    const light = runtime.ambient.value;
    flowContacts.update(assets.world, epoch, { x: camera.position.x, y: camera.position.y / verticalScale, z: camera.position.z }, delta,
      (id, event, rate, dt) => effects.emitContinuous(id, event, rate, dt));
    // Compiled physical descent sites drive bounded spray and plunge foam.
    let emitters = 0;
    for (const fall of assets.meta.cascades ?? []) {
      if (Math.hypot(fall.plunge.x - camera.position.x, fall.plunge.z - camera.position.z) > 90) continue;
      if (emitters++ >= 8) break;
      const sample = assets.world.sample(fall.plunge, epoch);
      if (!sample.waterBodyId) continue;
      effects.emitContinuous(fall.id, {
        kind: "splash", actorId: fall.id,
        position: { x: fall.plunge.x, y: sample.surfaceHeight, z: fall.plunge.z },
        velocity: { x: fall.direction.x * 2, y: -Math.sqrt(19.62 * fall.dropM), z: fall.direction.z * 2 },
        radius: Math.min(2.5, fall.widthM * 0.25), magnitude: Math.min(120, fall.dropM * fall.widthM * 3),
      }, 3, delta, { mist: Math.min(1, fall.dropM / 8) });
    }
    effects.setLighting(new THREE.Color().setRGB(Math.min(light.x * 10, 1.4), Math.min(light.y * 10, 1.4), Math.min(light.z * 10, 1.4)));
    effects.update(delta, nowS, assets.world, epoch, {
      x: camera.position.x, y: camera.position.y / verticalScale, z: camera.position.z,
    }, runtime.windVelocity());
    effects.object3d.scale.y = verticalScale;
  });

  return (
    <>
    <primitive object={effects.object3d} />
    <primitive object={ribbonMesh} />
    <primitive object={inland.group} />
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={materials.above}
      frustumCulled={false}
      receiveShadow
    />
    </>
  );
}
