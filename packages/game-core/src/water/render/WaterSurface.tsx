import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getWindWaveScale } from "@elder-souls/game-core/water/index";



import { RIPPLE_PATCH_M, RippleSim } from "./RippleSim";


import type { WaterAssets, WaterRuntime } from "./types";
import { WaterEffects } from "./WaterEffects";
import { UnderwaterBubbles } from "./UnderwaterBubbles";
import { WaterCascadeSources } from "./WaterCascadeSources";
import { InlandWaterTiles } from "./InlandWaterTiles";
import { WaterRibbonTiles } from "./WaterRibbonTiles";
import { WaterGeometryCamera } from "./waterStreaming";
import { SpectralOceanTextures } from "./SpectralOceanTextures";
import { WaterFlowContacts } from "../flowContacts";
import { HeroPoolSurface } from './HeroPoolSurface';
import { oceanAxisCoords, oceanGridCentre } from './oceanGrid';
import { NativeWaterAtlas } from './NativeWaterAtlas';
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

function buildWaterGeometry(spec: GridSpec): THREE.BufferGeometry {
  const axis = oceanAxisCoords(spec);
  const n = spec.n + 1;
  const pos = new Float32Array(n * n * 3);
  const cellSize = new Float32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = (z * n + x) * 3;
      pos[i] = axis[x];
      pos[i + 1] = 0;
      pos[i + 2] = axis[z];
      cellSize[z * n + x] = Math.max(axis[Math.min(x + 1, n - 1)] - axis[x], axis[x] - axis[Math.max(0, x - 1)],
        axis[Math.min(z + 1, n - 1)] - axis[z], axis[z] - axis[Math.max(0, z - 1)]);
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
  geo.setAttribute("waterCellSize", new THREE.BufferAttribute(cellSize, 1));
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
  bubbles?: UnderwaterBubbles;
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
  const oceanTextures = useMemo(() => assets.world.spectralOcean ? new SpectralOceanTextures(assets.world.spectralOcean) : null, [assets]);
  useEffect(() => () => oceanTextures?.dispose(), [oceanTextures]);
  const geometryCamera = useMemo(() => new WaterGeometryCamera(), []);
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
  const inland = useMemo(() => new InlandWaterTiles(assets.data, tier.name === "low", { stage: assets }), [assets, tier]);
  const allMeshes = useMemo<THREE.Mesh[]>(() => [], [assets]);
  const nativeAtlas = useMemo(() => new NativeWaterAtlas(assets.data.nativeGround), [assets]);
  const renderer = useThree(state => state.gl);
  useEffect(() => {
    const restore = () => nativeAtlas.invalidate();
    renderer.domElement.addEventListener('webglcontextrestored', restore);
    return () => { renderer.domElement.removeEventListener('webglcontextrestored', restore); nativeAtlas.dispose(); };
  }, [nativeAtlas, renderer]);
  const hero = useMemo(() => new HeroPoolSurface(assets, nativeAtlas), [assets, nativeAtlas]);
  const cascadeSources = useMemo(() => new WaterCascadeSources(assets.meta.cascades ?? []), [assets]);
  useEffect(() => () => { hero.dispose(); runtime.onLocalSurface?.(null); }, [hero]);
  useEffect(() => () => inland.dispose(), [inland]);
  const ribbons = useMemo(() => new WaterRibbonTiles(assets.data, tier.name === "low"), [assets, tier.name]);
  useEffect(() => () => ribbons.dispose(), [ribbons]);
  const effects = useMemo(() => new WaterEffects({
    maxParticles: tier.name === "high" ? 768 : 256,
    onReentry: e => ripple?.addDrop(e.position.x, e.position.z, e.radius ?? 0.1, 0.006),
  }), [tier, ripple]);
  useEffect(() => () => effects.dispose(), [effects]);
  const bubbles = useMemo(() => new UnderwaterBubbles(tier.name === "low"), [tier.name]);
  useEffect(() => () => bubbles.dispose(), [bubbles]);
  useEffect(() => {
    const visibility = () => { effects.setSuspended(document.hidden); bubbles.setSuspended(document.hidden); };
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [effects, bubbles]);
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
      allMeshes.splice(0, allMeshes.length, mesh, hero.mesh, ...ribbons.meshes);
      onReadyRef.current?.({ uniforms, mesh, meshes: allMeshes, materials, effects, bubbles });
    }
  }, [materials, uniforms, effects, bubbles, ribbons]);
  useEffect(() => () => {
    materials.above.dispose();
    materials.below.dispose();
  }, [materials]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera, size, gl }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const geometryView = geometryCamera.update(camera, size.height * gl.getPixelRatio());
    inland.update(camera.position.x, camera.position.z, mesh.material as THREE.Material, verticalScale, geometryView);
    ribbons.update(geometryView, mesh.material as THREE.Material, verticalScale);
    allMeshes.splice(0, allMeshes.length, mesh, hero.mesh, ...ribbons.meshes, ...inland.meshes);
    const surfaceFocus = runtime.surfaceFocus?.();
    mesh.position.set(
      oceanGridCentre(surfaceFocus?.x ?? camera.position.x),
      0,
      oceanGridCentre(surfaceFocus?.z ?? camera.position.z),
    );
    const epoch = runtime.epochMinutes();
    // Waves/foam run on the always-live water clock (the world clock is
    // usually paused for reproducible URLs); tide/season stay on the epoch.
    runtime.advanceClock(delta);
    uniforms.uWaveTime.value = runtime.waveTimeS();
    if (oceanTextures) {
      oceanTextures.ocean.setWindVelocity(runtime.windVelocity());
      oceanTextures.ocean.update(uniforms.uWaveTime.value);
      oceanTextures.sync();
      uniforms.uOceanPrevious.value = oceanTextures.previous;
      uniforms.uOceanNext.value = oceanTextures.next;
      uniforms.uOceanAlpha.value = oceanTextures.ocean.alpha;
      uniforms.uOceanEnabled.value = 1;
    }
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
    hero.update(surfaceFocus?.x ?? camera.position.x, surfaceFocus?.y ?? camera.position.y / verticalScale,
      surfaceFocus?.z ?? camera.position.z, nowS, delta, epoch, mesh.material as THREE.Material, verticalScale);
    uniforms.uLocalWaterField.value = hero.field;
    uniforms.uLocalWaterInfo.value.set(hero.state.originX, hero.state.originZ, hero.state.cellSizeM, hero.state.size);
    uniforms.uLocalWaterEdge.value = hero.state.edgeBlendM;
    uniforms.uLocalWaterBody.value = hero.state.bodyIndex;
    uniforms.uLocalWaterActive.value = hero.state.active ? 1 : 0;
    const groundLayout = nativeAtlas.layout;
    uniforms.uNativeGroundActive.value = groundLayout ? 1 : 0;
    if (groundLayout) {
      uniforms.uNativeGroundInfo.value.set(groundLayout.metresPerPixel, groundLayout.gridSize, groundLayout.tileCells, groundLayout.tileStride);
      uniforms.uNativeGroundOffsets.value.set(groundLayout.axisOffset, groundLayout.tileIndexOffset, groundLayout.tileRecordSize);
    }
    runtime.onLocalSurface?.(hero.state);
    for (const e of assets.world.drainInteractions()) {
      effects.emit(e);
      bubbles.emit(e);
      hero.emit(e);
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
    hero.sync();
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
    for (const fall of cascadeSources.nearby({
      x: camera.position.x, y: camera.position.y / verticalScale, z: camera.position.z,
    })) {
      const sample = assets.world.sample(fall.plunge, epoch);
      if (!sample.waterBodyId) continue;
      effects.emitContinuous(fall.id, {
        kind: "splash", actorId: fall.id,
        position: { x: fall.plunge.x, y: sample.surfaceHeight, z: fall.plunge.z },
        velocity: { x: fall.direction.x * 2, y: -Math.sqrt(19.62 * fall.dropM), z: fall.direction.z * 2 },
        radius: Math.min(2.5, fall.widthM * 0.25), magnitude: Math.min(120, fall.dropM * fall.widthM * 3),
      }, 3, delta, { mist: Math.min(1, fall.dropM / 8), fallFrom: fall.lip });
    }
    effects.setIllumination(light, runtime.sunLight.value, runtime.sunDirection.value.y, gl.toneMappingExposure);
    effects.setView(geometryView.frustum, verticalScale);
    effects.update(delta, nowS, assets.world, epoch, {
      x: camera.position.x, y: camera.position.y / verticalScale, z: camera.position.z,
    }, runtime.windVelocity());
    effects.object3d.scale.y = verticalScale;
    bubbles.setIllumination(light, runtime.sunLight.value, runtime.sunDirection.value.y);
    bubbles.setView(geometryView.frustum, verticalScale);
    bubbles.update(delta, assets.world, epoch, {x:camera.position.x,y:camera.position.y/verticalScale,z:camera.position.z});
    bubbles.object3d.scale.y = verticalScale;
  });

  return (
    <>
    <primitive object={effects.object3d} />
    <primitive object={hero.mesh} />
    <primitive object={ribbons.group} />
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
