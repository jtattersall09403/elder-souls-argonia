import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWindWaveScale } from "@elder-souls/game-core/water/index";
import { RIPPLE_PATCH_M, RippleSim } from "./RippleSim";
import { ALL_WATER_LAYERS, type WaterAssets, type WaterRuntime } from "./types";
import { WaterEffects } from "./WaterEffects";
import { UnderwaterBubbles } from "./UnderwaterBubbles";
import { CASCADE_PATH_LIMIT, WaterCascadeSources, cascadePathEmitters } from "./WaterCascadeSources";
import { buildChannelStripGeometry, stripBoulderCandidates } from "./ChannelStrips";
import { WaterfallSheets } from "./WaterfallSheets";
import { plungeBaseRadiusM } from "./PlungeBase";
import { FoamField } from "./FoamField";
import { WaterFlowContacts } from "../flowContacts";
import {
  WATER_LAYER,
  MAX_CONTACT_BODIES,
  MAX_PLUNGE_SOURCES,
  NOISE_GLSL,
  SAMPLER_GLSL,
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
  /** Stable id so the swept-path stamp can follow the body between frames
   * (absent: the body's index in the list stands in). */
  id?: string;
  x: number;
  z: number;
  radius: number;
  strength: number;
}

/** Wading/contact stamps land every this many seconds — along the path
 * travelled since the last stamp (a swept footprint), into both the ripple
 * sim and the foam field (study §1.4, §6 "Interaction"). */
export const CONTACT_STAMP_S = 0.12;
/** A body that jumped farther than this since its last stamp teleported:
 * the path is not swept. */
export const CONTACT_TELEPORT_M = 6;
/** Foam field texels a side by tier (study §1.3: 256/512 by tier). */
export const FOAM_FIELD_SIZE: Record<"low" | "high", number> = { high: 512, low: 256 };

export interface WaterSurfaceHandle {
  uniforms: WaterUniforms;
  /** The province field grid. */
  mesh: THREE.Mesh;
  /** Every mesh in the water pass — field grid, strip ribbons, fall sheets.
   * Capture and underwater visibility must treat them as one surface. */
  meshes: THREE.Mesh[];
  materials: { above: THREE.MeshPhysicalMaterial; below: THREE.MeshPhysicalMaterial };
  /** Swaps every surface mesh between the above/below shader variants. */
  setUnderwater(underwater: boolean): void;
  effects: WaterEffects;
  bubbles: UnderwaterBubbles;
  falls: WaterfallSheets | null;
  /** Persistent foam energy field; the pipeline steps it before the water pass. */
  foam: FoamField | null;
  stripDiagnostics: { count: number; triangles: number; boulderCandidates: number };
}

export function WaterSurfaceMesh({ runtime, assets, tier, verticalScale, farExtentM, ripple, contactBodies, onReady }: {
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
  // Waterfall sheets first: they are traced against the compiled channels so
  // a sheet starts exactly where a strip ends at its `lip`, and every ramp
  // that never leaves the ground comes back as a chute strip record.
  const falls = useMemo(() => {
    const cascades = assets.meta.cascades ?? [];
    return cascades.length
      ? new WaterfallSheets(cascades, runtime.applyAerial,
        { channels: assets.meta.channels ?? [], textures: assets.waterfallTextures,
          // The rock the crest leaves: the compiled surface raster carries the
          // still-water level W and the signed depth W − ground, so ground is
          // W − depth everywhere, wet or dry (dry cells store W = ground −
          // buryM). The sheets sample it ACROSS each lip line.
          groundHeightM: (x, z) => assets.data.surfaceBase(x, z) - assets.data.depthProxy(x, z) })
      : null;
  }, [assets, runtime.applyAerial]);
  useEffect(() => () => falls?.dispose(), [falls]);
  // Steep reaches (decision 0046 item 4) plus the ramps above: explicit
  // ribbons in the SAME shader (ES_STRIP whitewater), built once. The field
  // discards under them via the compiled owner mask.
  const strips = useMemo(() => {
    const channels = [...(assets.meta.channels ?? []), ...(falls?.chuteStrips ?? [])];
    if (!channels.length) return null;
    const built = buildChannelStripGeometry(channels);
    if (!built.triangleCount) return null;
    const materials = {
      above: createWaterMaterial("above", { csm, applyAerial: runtime.applyAerial, assets, uniforms, tier }, "strip"),
      below: createWaterMaterial("below", { csm, applyAerial: runtime.applyAerial, assets, uniforms, tier }, "strip"),
    };
    const mesh = new THREE.Mesh(built.geometry, materials.above);
    mesh.name = "water-channel-strips";
    mesh.layers.set(WATER_LAYER);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    // the boulder rule the scatter compiler will consume (1 rock / 160 m² of
    // bed, seeded by strip id) — surfaced as a count so the job can be sized
    let boulderCandidates = 0;
    for (const strip of channels) boulderCandidates += stripBoulderCandidates(strip).length;
    return { mesh, materials, triangles: built.triangleCount, count: built.stripCount, boulderCandidates };
  }, [assets, csm, uniforms, tier, runtime.applyAerial, falls]);
  useEffect(() => () => {
    if (!strips) return;
    strips.mesh.geometry.dispose();
    strips.materials.above.dispose();
    strips.materials.below.dispose();
  }, [strips]);
  const meshRef = useRef<THREE.Mesh>(null);
  const effects = useMemo(() => new WaterEffects({
    maxParticles: tier.name === "high" ? 768 : 256,
    onReentry: e => ripple?.addDrop(e.position.x, e.position.z, e.radius ?? 0.1, 0.006),
  }), [tier, ripple]);
  useEffect(() => () => effects.dispose(), [effects]);
  const bubbles = useMemo(() => new UnderwaterBubbles(tier.name === "low"), [tier.name]);
  useEffect(() => () => bubbles.dispose(), [bubbles]);
  const cascadeSources = useMemo(() => new WaterCascadeSources(assets.meta.cascades ?? []), [assets]);
  const flowContacts = useMemo(() => new WaterFlowContacts(), [assets]);
  // Persistent foam energy field (study §3.1 (1)): decodes the same rasters
  // with the same GLSL and the same uniform objects as the surface, so the
  // fold it injects on is the crest the surface renders.
  const foam = useMemo(() => new FoamField({
    size: FOAM_FIELD_SIZE[tier.name],
    samplerGlsl: SAMPLER_GLSL,
    noiseGlsl: NOISE_GLSL,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    waveBands: tier.waveBands,
    classes: assets.meta.klass.classes,
  }), [tier, uniforms, assets]);
  useEffect(() => () => foam.dispose(), [foam]);
  useEffect(() => {
    const visibility = () => {
      effects.setSuspended(document.hidden); bubbles.setSuspended(document.hidden);
      ripple?.suspend(); foam.suspend(); splashes.current.length = 0; stamps.current.clear();
    };
    visibility(); document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [effects, bubbles, ripple, foam]);
  /** Splash events become decaying, spreading foam rings (world-time secs). */
  const splashes = useRef<{ x: number; z: number; radius: number; strength: number; bornS: number }[]>([]);
  const stampTimer = useRef(0);
  /** Last stamped position per contact body (swept-path stamping). */
  const stamps = useRef(new Map<string, { x: number; z: number; seen: number }>());
  const stampFrame = useRef(0);

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
      const meshes = [mesh, ...(strips ? [strips.mesh] : []), ...(falls ? [falls.mesh, falls.base.mesh, falls.mist.mesh] : [])];
      onReadyRef.current?.({
        uniforms, mesh, meshes, materials, effects, bubbles, falls, foam,
        stripDiagnostics: { count: strips?.count ?? 0, triangles: strips?.triangles ?? 0,
          boulderCandidates: strips?.boulderCandidates ?? 0 },
        setUnderwater(underwater: boolean) {
          mesh.material = underwater ? materials.below : materials.above;
          if (strips) strips.mesh.material = underwater ? strips.materials.below : strips.materials.above;
        },
      });
    }
  }, [materials, uniforms, effects, bubbles, strips, falls, foam]);
  useEffect(() => () => {
    materials.above.dispose();
    materials.below.dispose();
  }, [materials]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera, gl }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Dev layer toggle (?waterLayers=): each of the four things the water
    // pass draws over the same ground can be hidden, so a probe can
    // attribute a defect to ONE of them instead of guessing.
    const visible = runtime.waterLayers?.() ?? ALL_WATER_LAYERS;
    mesh.visible = visible.field;
    if (strips) strips.mesh.visible = visible.strips;
    if (falls) falls.mesh.visible = visible.falls;
    effects.object3d.visible = visible.effects;
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
    // Transport clock: unscaled by wind or preview rate, so 1 m/s of current
    // advects foam 1 m/s no matter what the wave clock is doing.
    uniforms.uTransportTime.value = runtime.transportTimeS?.() ?? runtime.waveTimeS();
    // Weather wind scales wave energy — same value the CPU water query uses
    // (game-core setWindWaveScale, written by WorldSky each frame).
    uniforms.uWindWave.value = getWindWaveScale();
    const offsets = assets.world.levelOffsets(epoch);
    uniforms.uLevelTide.value = offsets.tide;
    uniforms.uLevelSeason.value = offsets.season;
    runtime.onLevels(offsets.tide, offsets.season, getWindWaveScale());
    uniforms.uVerticalScale.value = verticalScale;
    // sun/sky feeds for the sparkle, crest scatter and meniscus rim
    uniforms.uWaterSunDir.value.copy(runtime.sunDirection.value);
    uniforms.uWaterSunLight.value.copy(runtime.sunLight.value);
    uniforms.uWaterAmbient.value.copy(runtime.ambient.value);
    // the foam field the pipeline stepped last frame
    uniforms.uFoamField.value = foam.texture;
    uniforms.uFoamFieldInfo.value.copy(foam.info);
    // interaction events → spreading foam rings + real sim ripples
    const nowS = runtime.transportTimeS?.() ?? runtime.waveTimeS();
    const dt = runtime.transportDeltaS?.() ?? delta;
    for (const e of assets.world.drainInteractions()) {
      effects.emit(e);
      bubbles.emit(e);
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
        // a splash DEPOSITS foam energy that then drifts on the current
        foam.inject(e.position.x, e.position.z, (e.radius ?? 0.8) * 1.4,
          Math.min((e.magnitude ?? 40) / 60, 1.2) * 0.7);
      }
    }
    // Rain stamps small impulses into the ripple patch (research §3: the sim
    // was built to take arbitrary impulses). Hashed positions, no RNG.
    const rain = runtime.rainIntensity();
    uniforms.uRainRipple.value = rain;
    if (ripple && rain > 0.05) {
      // Denser stamping over the widened patch (round 2): the 64 m patch
      // needs ~3× the drops of the old 36 m one for the same visual density.
      const n = Math.min(14, Math.ceil(rain * 12));
      const tick = Math.floor(nowS * 24);
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
    // wading churn: every CONTACT_STAMP_S, stamp along the path each body
    // travelled since its last stamp — into the ripple sim (a swept trail,
    // never a dotted line) and the foam field (a wake that persists and
    // drifts). A body unseen for a stamp, or one that teleported, restarts.
    stampTimer.current -= dt;
    if (stampTimer.current <= 0) {
      stampTimer.current = CONTACT_STAMP_S;
      stampFrame.current++;
      const list = contactBodies?.() ?? [];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const key = b.id ?? `#${i}`;
        const prev = stamps.current.get(key);
        if (b.strength > 0.05) {
          const swept = prev && prev.seen === stampFrame.current - 1
            && Math.hypot(b.x - prev.x, b.z - prev.z) < CONTACT_TELEPORT_M;
          const x0 = swept ? prev!.x : b.x;
          const z0 = swept ? prev!.z : b.z;
          ripple?.addPath(x0, z0, b.x, b.z, 0.45, 0.045 * b.strength);
          foam.injectPath(x0, z0, b.x, b.z, Math.max(b.radius, 0.5), 0.06 * b.strength);
        }
        if (prev) { prev.x = b.x; prev.z = b.z; prev.seen = stampFrame.current; }
        else stamps.current.set(key, { x: b.x, z: b.z, seen: stampFrame.current });
      }
      if (stamps.current.size > 64) {
        for (const [k, v] of stamps.current) if (v.seen < stampFrame.current - 8) stamps.current.delete(k);
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
    // ---- particle stack (kept from the retired overhaul, decision 0046) ---
    const focus = { x: camera.position.x, y: camera.position.y / verticalScale, z: camera.position.z };
    flowContacts.update(assets.world, epoch, focus, dt,
      (id, event, rate, step) => effects.emitContinuous(id, event, rate, step));
    // Cascade spray/mist/foam, and the plunge-pool foam discs the FIELD
    // shader draws around each nearby fall (research §4: foam spreads out).
    let ranked = 0;
    for (const fall of cascadeSources.nearby(focus)) {
      effects.emitCascade(fall, assets.world, epoch, dt);
      // The nearest falls also get the spray/mist kit spaced DOWN the sheet;
      // the rest keep the plunge alone, which is all that reads at distance.
      const path = ranked++ < CASCADE_PATH_LIMIT ? falls?.pathFor(fall.id) : undefined;
      if (!path) continue;
      for (const e of cascadePathEmitters(fall, path.points, assets.world, epoch)) {
        effects.emitContinuous(e.id, e.event, e.ratePerSecond, dt, { mist: e.mist, fallFrom: e.fallFrom });
      }
    }
    let plunges = 0;
    for (const fall of cascadeSources.nearby(focus, 300, MAX_PLUNGE_SOURCES)) {
      const strength = Math.min(0.7, 0.18 + fall.dropM * 0.03);
      uniforms.uPlunges.value[plunges++].set(
        fall.plunge.x, fall.plunge.z,
        Math.max(1.5, Math.min(16, fall.widthM)),
        strength,
      );
      // the plunge base also DEPOSITS into the field at a rate whose
      // equilibrium (rate x the pool's ~3 s decay) is the base's own
      // strength, so the pool looks fed and its foam drifts out on the
      // current; the instantaneous disc/ring above stays as the floor
      foam.inject(fall.plunge.x, fall.plunge.z, plungeBaseRadiusM(fall.widthM, fall.dropM) * 0.8,
        (strength / 3.0) * dt);
    }
    uniforms.uPlungeCount.value = plunges;
    // the plunge base and mist ride the pool, which the season floods: same
    // lift the field applies at full season response; the ground mist reads
    // the foam field under it
    falls?.update(runtime, nowS, verticalScale, offsets.season, { texture: foam.texture, info: foam.info });
    effects.setIllumination(runtime.ambient.value, runtime.sunLight.value,
      runtime.sunDirection.value.y, gl.toneMappingExposure);
    effects.setView(undefined, verticalScale);
    effects.update(dt, nowS, assets.world, epoch, focus, runtime.windVelocity());
    effects.object3d.scale.y = verticalScale;
    bubbles.setIllumination(runtime.ambient.value, runtime.sunLight.value, runtime.sunDirection.value.y);
    bubbles.setView(undefined, verticalScale);
    bubbles.update(dt, assets.world, epoch, focus);
    bubbles.object3d.scale.y = verticalScale;
  });

  return (
    <>
    <primitive object={effects.object3d} />
    {strips ? <primitive object={strips.mesh} /> : null}
    {falls ? <primitive object={falls.mesh} /> : null}
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
