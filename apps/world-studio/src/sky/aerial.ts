import * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";
import * as TSL_TYPED from "three/tsl";
import {
  claimFeature, patchShared, sel, wrapColor, type PatchMemo, type TslNode,
} from "@elder-souls/game-core/render/nodes/materialNodes";
import { PROVINCE_EXTENT_M } from "../provinceScale";
import { sharedUniform } from "@elder-souls/game-core/render/nodes/sharedUniform";
// TSL builders typed loosely (standard 0107 §1: chained TSL typings are too deep for tsc).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  Fn,
  If,
  abs,
  cameraPosition,
  clamp,
  dFdx,
  dFdy,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  log2,
  max,
  min,
  mix,
  output,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4
} = TSL_TYPED as unknown as Record<string, any>;

/**
 * Aerial perspective (module 55 §97): ONE height-modulated exponential
 * inscatter term shared by every material — a tall-scale-height Rayleigh term
 * (blue distance) and a shallow boundary-layer Mie term (warm, forward,
 * g≈0.8) whose density comes from the climate humidity field, plus a bounded
 * ground-mist lump from the mist field. The Blacksmith pattern (research doc
 * §2.2); inscatter is never double-counted (the Unreal trap, §2.3).
 *
 * WebGPU port (decision 0107): the term is `scene.fogNode`
 * (`createAerialFogNode`), so every NodeMaterial with `fog = true` is hazed
 * per fragment from its own world position — instanced meshes included,
 * since `positionWorld` is post-instance. Runs on the lit colour before tone
 * mapping, in linear HDR, on the same lux scale as the light rig. Materials
 * that must not be hazed set `fog = false`; a material with its own fog maths
 * (water) calls `aerialPerspectiveNode` in its `outputNode` and sets
 * `fog = false`.
 */

/** A TSL uniform node: `.value` is the live value (written by WorldSky). */
export type UniformOf<T> = TslNode & { value: T };

export interface AerialUniforms {
  uSunDirW: UniformOf<THREE.Vector3>;
  /** Sun/moon radiance available to the haze (colour × lux-scale factor). */
  uHazeSunLight: UniformOf<THREE.Vector3>;
  /** Isotropic sky ambient inscatter (lux-scale colour). */
  uHazeAmbient: UniformOf<THREE.Vector3>;
  /** Climate-air raster (r humidity, g mist, b canopy). A TextureNode: swap
   * the texture with `.value = tex`; a 1×1 zero placeholder until loaded. */
  uClimateAir: UniformOf<THREE.Texture>;
  uProvinceExtentM: UniformOf<number>;
  /** Rayleigh scattering coefficient per metre (RGB). */
  uBetaR: UniformOf<THREE.Vector3>;
  /** Mie scattering coefficient per metre at humidity 1 inside the boundary layer. */
  uBetaM: UniformOf<number>;
  /** Boundary-layer (Mie) scale height, metres — hydrology-meta climateAir. */
  uBoundaryLayerM: UniformOf<number>;
  /** Radiation-mist CONDITION 0..1 (province-wide, clear-calm-night gated —
   * module 55 §97 regime 1). Locality comes per-pixel from the mist raster
   * along the view path, so a misty basin reads from a dry ridge above it
   * (owner round 3: fog volumes are local, conditions are synoptic). */
  uMistStrength: UniformOf<number>;
  /** Phase 8c: climate-weather raster (R rain amp, G storm, B sea fog). */
  uClimateWeather: UniformOf<THREE.Texture>;
  /** Advection sea-fog CONDITION 0..1 (regime 2); coast/estuary locality is
   * the climate-weather B channel along the path. */
  uAdvectionFog: UniformOf<number>;
  /** Cloud-forest whiteout (regime 3): x band centre (runtime m), y lower
   * sigma, z upper sigma (runtime m — asymmetric: summits stand ABOVE the
   * cloud), w strength 0..1. Horizontal locality is the climate-vis R mask
   * (cap cloud clings to the massif). */
  uWhiteout: UniformOf<THREE.Vector4>;
  /** Phase 8c round 3: climate-vis raster (R orographic belt mask, G region
   * ambient-visibility extinction beta/0.02). */
  uClimateVis: UniformOf<THREE.Texture>;
  /** One climate-vis texel in uv (1/width, 1/height), for the belt-mask smoothing taps. */
  uClimateVisTexel: UniformOf<THREE.Vector2>;
  /** Weather multiplier on the region ambient haze (settled days thinner,
   * humid rainy days thicker). */
  uRegionHaze: UniformOf<number>;
  /** Weather fog/haze density multiplier (rain veil, dry haze — regime 4). */
  uWeatherMie: UniformOf<number>;
  /** Asymptotic colour of DENSE fog (exposure-anchored, lightRig.fogLum):
   * what the mist regimes fade terrain into. Round 2 — the thin-haze
   * ambient's asymptote is near-black in daylight, which painted black caps
   * on fogged summits and made mist invisible. */
  uFogLum: UniformOf<THREE.Vector3>;
  /** Fog colour looking INTO the light (round 4) — forward-scattered and
   * sun-tinted. Blended against uFogLum by the view/sun angle so banks are
   * warm and bright when backlit, cool and grey when frontlit. */
  uFogSunLum: UniformOf<THREE.Vector3>;
  /** Cap-cloud drift (round 4): metres of noise-space offset, so the belt
   * cloud is a moving lumpy body rather than a static painted band. */
  uWhiteoutDrift: UniformOf<THREE.Vector2>;
  /** Camera world position for the DOME fog march (round 5). The dome cannot
   * use the `cameraPosition` builtin: the PMREM bake renders its dome from a
   * cube camera at the origin, which would march the fog from the wrong
   * place and bake a wrong IBL. Written per frame from the live camera. */
  uEsFogCam: UniformOf<THREE.Vector3>;
}

export type AerialRasterKey = "uClimateAir" | "uClimateWeather" | "uClimateVis";

/** 1×1 zero raster: what an unbound sampler read before the PNG decoded. */
function placeholderRaster(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.userData.esAerialPlaceholder = true;
  t.needsUpdate = true;
  return t;
}

/** True once a real raster has replaced the placeholder. */
export function aerialRasterLoaded(u: AerialUniforms, key: AerialRasterKey): boolean {
  return !(u[key].value as THREE.Texture).userData.esAerialPlaceholder;
}

/** One shared uniform set: WorldSky writes it, the fog node and the dome read it. */
export function createAerialUniforms(): AerialUniforms {
  return {
    uSunDirW: sharedUniform(new THREE.Vector3(0, 1, 0)),
    uHazeSunLight: sharedUniform(new THREE.Vector3(0, 0, 0)),
    uHazeAmbient: sharedUniform(new THREE.Vector3(0, 0, 0)),
    uClimateAir: texture(placeholderRaster()),
    uProvinceExtentM: sharedUniform(PROVINCE_EXTENT_M),
    uBetaR: sharedUniform(new THREE.Vector3(6.5e-6, 1.5e-5, 3.5e-5)),
    uBetaM: sharedUniform(9e-5),
    uBoundaryLayerM: sharedUniform(60),
    uMistStrength: sharedUniform(0),
    uClimateWeather: texture(placeholderRaster()),
    uAdvectionFog: sharedUniform(0),
    uWhiteout: sharedUniform(new THREE.Vector4(470, 150, 55, 0)),
    uClimateVis: texture(placeholderRaster()),
    uClimateVisTexel: sharedUniform(new THREE.Vector2(1 / 1024, 1 / 1024)),
    uRegionHaze: sharedUniform(0.55),
    uWeatherMie: sharedUniform(0),
    uFogLum: sharedUniform(new THREE.Vector3(0, 0, 0)),
    uFogSunLum: sharedUniform(new THREE.Vector3(0, 0, 0)),
    uWhiteoutDrift: sharedUniform(new THREE.Vector2(0, 0)),
    uEsFogCam: sharedUniform(new THREE.Vector3(0, 0, 0)),
  };
}

// ---------------------------------------------------------------------------
// Shared helpers (one set of functions, two integrators: surface + dome)
// ---------------------------------------------------------------------------

/** Sample a raster TextureNode at `uvNode` (all samples share the base node,
 * so swapping `.value` once re-points every sample). */
const sampleAt = (tex: TslNode, uvNode: TslNode): TslNode => tex.sample(uvNode);

/** Province uv of a world point (the rasters' v runs north→south). */
const provinceUv = (u: AerialUniforms, p: TslNode): TslNode =>
  vec2(p.x.div(u.uProvinceExtentM), float(1).sub(p.z.div(u.uProvinceExtentM)));

// Province bounds fade (owner round 4): the climate rasters are
// ClampToEdge, so every sample taken beyond the province edge repeated that
// edge pixel — which drew the cap-cloud mask as straight stripes running off
// the map all the way to the horizon. Outside the province there is no data,
// so there is no fog: fade to nothing just inside the border.
const esInBounds = Fn(([uvIn]: [TslNode]) => {
  const e = min(uvIn, vec2(1).sub(uvIn));
  return smoothstep(-0.015, 0.02, min(e.x, e.y));
});

// Cheap value noise, for breaking the cap cloud into lumps.
const esHash2 = Fn(([p]: [TslNode]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123)));
const esNoise2 = Fn(([p]: [TslNode]) => {
  const i = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(
    mix(esHash2(i), esHash2(i.add(vec2(1, 0))), f.x),
    mix(esHash2(i.add(vec2(0, 1))), esHash2(i.add(vec2(1, 1))), f.x),
    f.y,
  );
});

/** Cap-cloud lumpiness at a world point: two octaves drifting on the wind,
 * with the height folded in so it is a BODY of cloud rather than a vertical
 * column of paint (owner round 4). */
function esCloudLump(u: AerialUniforms, p: TslNode): TslNode {
  const q = p.xz.mul(0.0055).add(u.uWhiteoutDrift);
  const n = float(0.62)
    .mul(esNoise2(q.add(vec2(p.y.mul(0.004), 0))))
    .add(float(0.38).mul(esNoise2(q.mul(2.7).add(vec2(0, p.y.mul(0.006))))));
  return clamp(float(0.25).add(n.mul(1.7)), 0, 1.9);
}

// Mean of exp(-y/H) over the straight path between two heights.
const esPathDensity = Fn(([yA0, yB0, H]: [TslNode, TslNode, TslNode]) => {
  const yA = max(yA0, 0);
  const yB = max(yB0, 0);
  const dy = yB.sub(yA);
  const flat = exp(yA.add(yB).mul(-0.5).div(H));
  // divisor kept finite where `flat` is chosen, so sel() never multiplies an inf
  const slope = H.div(sel(abs(dy).lessThan(1), float(1), dy)).mul(exp(yA.negate().div(H)).sub(exp(yB.negate().div(H))));
  return sel(abs(dy).lessThan(1), flat, slope);
});

// Smoothed cloud-forest belt mask (climate-vis R): four rotated bilinear taps a texel out, then a
// smoothstep, so the cap cloud's outline has no square raster edges (CPU twin: climateSampler
// smoothBeltMask, BELT_MASK_TAPS, BELT_MASK_EDGE).
function esBeltMask(u: AerialUniforms, uv: TslNode): TslNode {
  const t = u.uClimateVisTexel;
  const m = sampleAt(u.uClimateVis, uv.add(t.mul(vec2(1, 0.5)))).r
    .add(sampleAt(u.uClimateVis, uv.add(t.mul(vec2(-0.5, 1)))).r)
    .add(sampleAt(u.uClimateVis, uv.add(t.mul(vec2(-1, -0.5)))).r)
    .add(sampleAt(u.uClimateVis, uv.add(t.mul(vec2(0.5, -1)))).r)
    .mul(0.25);
  return smoothstep(0.05, 0.85, m);
}

// Asymmetric cloud-forest belt profile (world-weather WHITEOUT_BELT twin):
// soft skirt below the centre, sharp top so summits stand above the cloud.
// (d/s)² is a product, never pow(): pow of a negative base is undefined.
function esBeltBell(u: AerialUniforms, y: TslNode): TslNode {
  const d = y.sub(u.uWhiteout.x);
  const s = sel(d.lessThan(0), u.uWhiteout.y, u.uWhiteout.z);
  const r = d.div(s);
  return exp(r.mul(r).negate());
}

// Directional fog colour (rounds 4–5): a bank is a strongly forward-scattering
// medium — bright and lit in the source's own colour looking toward the light
// (uFogSunLum), a cooler diffuse grey looking away (uFogLum). Both endpoints
// come DERIVED from the actual sun/sky/moon light in lightRig (round 5) and
// are exposure-anchored, so any mix of them stays inside the screen envelope.
function esFogColFor(u: AerialUniforms, mu: TslNode): TslNode {
  return mix(u.uFogLum, u.uFogSunLum, smoothstep(-0.35, 0.95, mu));
}

// ---------------------------------------------------------------------------
// Surface integrator
// ---------------------------------------------------------------------------

/**
 * The aerial term on a surface colour: `color` hazed between `camPos` and
 * `worldPos` (all vec3 nodes). The fog node calls this with the fragment's
 * lit colour; water calls it from its own outputNode.
 */
export function aerialPerspectiveNode(
  u: AerialUniforms,
  color: TslNode,
  worldPos: TslNode,
  camPos: TslNode,
): TslNode {
  return Fn(() => {
    const dv = worldPos.sub(camPos);
    const dist = max(length(dv), 1).toVar();
    const vdir = dv.div(dist);
    // Fog locality (owner round 3): every regime density is sampled at THREE
    // path points (camera / midpoint / fragment, weights 1-2-1) against its
    // climate raster, so fog banks live where their rasters say.
    const airUv = provinceUv(u, worldPos).toVar();
    const camUv = provinceUv(u, camPos).toVar();
    const midUv = airUv.add(camUv).mul(0.5).toVar();
    const air = sampleAt(u.uClimateAir, airUv).rgb.toVar(); // r humidity, g mist, b canopy
    const airC = sampleAt(u.uClimateAir, camUv).rgb.toVar();
    const airM = sampleAt(u.uClimateAir, midUv).rgb.toVar();
    const visF = sampleAt(u.uClimateVis, airUv).rgb.toVar(); // r belt mask, g region extinction
    const visC = sampleAt(u.uClimateVis, camUv).rgb.toVar();
    const visM = sampleAt(u.uClimateVis, midUv).rgb.toVar();
    // Beyond the province edge the rasters have no data — fade every LOCAL
    // density out; the region extinction keeps a floor instead of vanishing.
    const bF = esInBounds(airUv).toVar();
    const bC = esInBounds(camUv).toVar();
    const bM = esInBounds(midUv).toVar();
    visF.x.mulAssign(bF);
    visC.x.mulAssign(bC);
    visM.x.mulAssign(bM);
    visF.y.mulAssign(mix(0.5, 1.0, bF));
    visC.y.mulAssign(mix(0.5, 1.0, bC));
    visM.y.mulAssign(mix(0.5, 1.0, bM));
    air.y.mulAssign(bF);
    airC.y.mulAssign(bC);
    airM.y.mulAssign(bM);

    const camY = camPos.y;
    const wY = worldPos.y;
    const dR = esPathDensity(camY, wY, float(8000));
    const dM = esPathDensity(camY, wY, u.uBoundaryLayerM).mul(float(0.25).add(air.x.mul(1.1))).toVar();
    // Region ambient visibility (round 3): the authored per-region sightlines
    // rendered as a boundary-layer extinction floor — thick marsh air, crisp
    // mountain air. Confined to the shallow layer.
    const regionExt = float(0.25)
      .mul(visC.y)
      .add(float(0.5).mul(visM.y))
      .add(float(0.25).mul(visF.y))
      .mul(float(0.02).div(u.uBetaM));
    dM.addAssign(esPathDensity(camY, wY, u.uBoundaryLayerM).mul(regionExt).mul(u.uRegionHaze));
    // The three mist regimes + weather fog (module 55 §97, decision 0032) are
    // ADDED DENSITIES into this one inscatter authority — never a second fog.
    // Regime 1: radiation mist — dawn pooling where the mist raster says.
    const mist3 = float(0.25).mul(airC.y).add(float(0.5).mul(airM.y)).add(float(0.25).mul(air.y));
    const dMist = esPathDensity(camY, wY, float(16)).mul(mist3).mul(u.uMistStrength).mul(14);
    // Regime 2: advection sea fog — a shallow marine layer over the coastal /
    // estuary corridors (climate-weather B channel along the path).
    const adv3 = float(0.25)
      .mul(sampleAt(u.uClimateWeather, camUv).b)
      .mul(bC)
      .add(float(0.5).mul(sampleAt(u.uClimateWeather, midUv).b).mul(bM))
      .add(float(0.25).mul(sampleAt(u.uClimateWeather, airUv).b).mul(bF));
    const dAdv = esPathDensity(camY, wY, float(22)).mul(adv3).mul(u.uAdvectionFog).mul(125);
    // Regime 3: cloud-forest whiteout — the asymmetric elevation band. The
    // horizontal mask/lump are sampled where the path CROSSES the belt
    // altitude (round 5), the mask DILATED (pow < 1, round 4) and multiplied
    // by a drifting noise lump so the band is a broken, moving cloud body.
    const dWhite = float(0).toVar();
    If(u.uWhiteout.w.greaterThan(0.003), () => {
      const dy = wY.sub(camY);
      const tx = clamp(u.uWhiteout.x.sub(camY).div(sel(abs(dy).lessThan(1), float(1), dy)), 0, 1);
      const pX = mix(camPos, worldPos, tx).toVar();
      const xUv = provinceUv(u, pX).toVar();
      const maskX = esBeltMask(u, xUv).mul(esInBounds(xUv));
      const bells = esBeltBell(u, camY)
        .add(esBeltBell(u, camY.add(wY).mul(0.5)).mul(2))
        .add(esBeltBell(u, wY))
        .div(4);
      dWhite.assign(bells.mul(maskX).mul(esCloudLump(u, pX)).mul(u.uWhiteout.w).mul(550));
    });
    // Regime 4: weather fog/haze — rain veil and dry haze fill the air column
    // (tall 200 m scale height, unlike the shallow boundary-layer Mie).
    const dWx = esPathDensity(camY, wY, float(200)).mul(u.uWeatherMie).mul(8);

    const scatR = u.uBetaR.mul(dR.mul(dist)).toVar();
    const scatM = u.uBetaM.mul(dM.add(dMist).add(dAdv).add(dWhite).add(dWx).mul(dist)).toVar();
    const extinction = scatR.add(vec3(scatM)).toVar();
    const transmittance = exp(extinction.negate());

    const mu = dot(vdir, u.uSunDirW).toVar();
    const phaseR = float(0.0597).mul(mu.mul(mu).add(1));
    const g = 0.8;
    const phaseM = float(0.0796 * (1 - g * g)).div(pow(float(1 + g * g).sub(mu.mul(2 * g)), 1.5));
    const sunScatter = u.uHazeSunLight
      .mul(scatR.mul(phaseR).add(vec3(scatM.mul(phaseM))))
      .div(max(extinction, vec3(1e-5)));
    // The ambient inscatter colour depends on WHAT is scattering (round 2):
    // clear-air Rayleigh haze keeps the sky-ambient tint; water-droplet media
    // (mist regimes, and since round 5 the boundary-layer murk dM) fade
    // terrain into the bright derived fog colour.
    const scatMFog = u.uBetaM.mul(
      dM.mul(0.85).add(dMist).add(dAdv).add(dWhite).add(dWx.mul(0.7)).mul(dist),
    );
    const fogFrac = clamp(scatMFog.div(max(dot(extinction, vec3(0.3333)), 1e-5)), 0, 1).toVar();
    const ambient = mix(u.uHazeAmbient, esFogColFor(u, mu), fogFrac);
    const inscatter = sunScatter
      .mul(float(1).sub(fogFrac.mul(0.6)))
      .add(ambient)
      .mul(vec3(1).sub(transmittance));
    return color.mul(transmittance).add(inscatter);
  })();
}

/**
 * THE scene fog: assign to `scene.fogNode` (WorldSky does). three's
 * NodeMaterial.setupFog assigns the lit, pre-tone-map colour to `output`
 * and replaces it with this node on every material with `fog = true`.
 */
export function createAerialFogNode(u: AerialUniforms, inner?: (lit: TslNode) => TslNode): TslNode {
  return Fn(() => {
    // the near medium (froxel volumetrics, decision 0112) first, then the aerial haze
    const lit = inner ? inner(output) : output;
    return vec4(aerialPerspectiveNode(u, lit.rgb, positionWorld, cameraPosition), lit.a);
  })();
}

// ---------------------------------------------------------------------------
// Dome fog march
// ---------------------------------------------------------------------------

/**
 * DOME fog march (round 5). The surface term fogs surface fragments only, so
 * any bank seen against OPEN SKY — the cap cloud between two peaks, a
 * sea-fog wall on the horizon — would be invisible from outside. This marches
 * the same regime densities along the sky ray with quadratic step spacing
 * (the media live near the camera and in the belt) and veils the dome by the
 * accumulated optical depth, using the same directional fog colour as
 * surfaces. Deliberately NOT included: the plain humidity Mie term (the
 * Preetham dome already renders clear-air humidity as turbidity). The march
 * starts from uEsFogCam (not cameraPosition: the PMREM bake renders from a
 * cube camera at the origin). Used by the sky dome material only.
 */
export function skyFogNode(u: AerialUniforms, color: TslNode, dir: TslNode): TslNode {
  return Fn(() => {
    const od = float(0).toVar();
    If(dir.y.greaterThanEqual(-0.06), () => {
      let tPrev = 0;
      for (let i = 1; i <= 12; i++) {
        const f = i / 12;
        const t = 9000 * f * f;
        const p = u.uEsFogCam.add(dir.mul(0.5 * (tPrev + t))).toVar();
        const seg = t - tPrev;
        tPrev = t;
        const uvp = provinceUv(u, p).toVar();
        const b = esInBounds(uvp).toVar();
        const y = max(p.y, 0).toVar();
        const air = sampleAt(u.uClimateAir, uvp).rgb;
        const vis = sampleAt(u.uClimateVis, uvp).rgb.toVar();
        const adv = sampleAt(u.uClimateWeather, uvp).b;
        const d = exp(y.negate().div(16))
          .mul(air.g)
          .mul(b)
          .mul(u.uMistStrength)
          .mul(14)
          .add(exp(y.negate().div(22)).mul(adv).mul(b).mul(u.uAdvectionFog).mul(125))
          .add(
            esBeltBell(u, y)
              // one tap here (12 march steps per dome pixel); the four-tap esBeltMask is on surfaces
              .mul(smoothstep(0.05, 0.85, vis.r))
              .mul(b)
              .mul(esCloudLump(u, p))
              .mul(u.uWhiteout.w)
              .mul(550),
          )
          .add(
            exp(y.negate().div(u.uBoundaryLayerM))
              .mul(vis.g)
              .mul(mix(0.5, 1.0, b))
              .mul(float(0.02).div(u.uBetaM))
              .mul(u.uRegionHaze),
          )
          .add(exp(y.negate().div(200)).mul(u.uWeatherMie).mul(8));
        od.addAssign(u.uBetaM.mul(d).mul(seg));
      }
    });
    const fogA = float(1).sub(exp(od.negate())).mul(smoothstep(-0.06, -0.01, dir.y));
    return mix(color, esFogColFor(u, dot(dir, u.uSunDirW)), fogA);
  })();
}

// ---------------------------------------------------------------------------
// Alpha-tested foliage: mip-alpha coverage boost
// ---------------------------------------------------------------------------

/** Plain-number twin of the boost (tests): the alpha multiplier at a mip. */
export function mipAlphaBoost(mipLevel: number): number {
  return 1 + 0.25 * Math.min(Math.max(mipLevel, 0), 4);
}

/**
 * What every mip-boosted material shares so they share one shader build
 * (decision 0111 §shader builds): the patched node slots per signature and
 * the map-size uniform, set per drawn OBJECT from its own material's map.
 * One per sky (caller-owned, standard 8).
 */
export interface MipAlphaShare {
  memo: PatchMemo;
  mapSize: TslNode;
}

/** Map texel size of a drawn object's own material (the frame material is the shadow material in the shadow pass). */
export function objectMapSize(object: THREE.Object3D | null | undefined, into: THREE.Vector2): THREE.Vector2 {
  const m = (object as THREE.Mesh | null | undefined)?.material;
  const material = (Array.isArray(m) ? m[0] : m) as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
  const image = material?.map?.image as { width?: number; height?: number } | undefined;
  if (image?.width && image?.height) into.set(image.width, image.height);
  return into;
}

export function createMipAlphaShare(): MipAlphaShare {
  const size = new THREE.Vector2(1, 1);
  const mapSize = uniform(size).onObjectUpdate(
    (frame: { object?: THREE.Object3D }) => objectMapSize(frame.object, size));
  return { memo: new Map(), mapSize };
}

/**
 * Mip-alpha coverage boost for alpha-tested foliage (research doc
 * openworld-vegetation-placement-architecture §4.1 cause 1): box-filtered mips
 * average cutout alpha downward, so ever fewer texels pass `alphaTest` in
 * lower mips and canopies dissolve to sticks at distance. Estimate the mip
 * level from the UV footprint and scale alpha up before the cutoff (the
 * NodeMaterial alpha test runs on the colour node's alpha). A no-op for
 * materials without both an alpha test and a map. Idempotent. The map's size
 * is a per-object uniform, not the map itself, so every material with the same
 * node slots and uv channel shares one graph (`share`).
 */
export function applyMipAlphaBoost(material: NodeMaterial, share: MipAlphaShare): void {
  const map = (material as NodeMaterial & { map?: THREE.Texture | null }).map;
  if (!(material.alphaTest > 0) || !map) return;
  const channel = map.channel ?? 0;
  patchShared(material, share.memo, `mipAlphaBoost|${channel}`, (m) => {
    if (!claimFeature(m, "mipAlphaBoost")) return;
    const mapUv = uv(channel);
    wrapColor(m, (c: TslNode) => {
      const dx = dFdx(mapUv).mul(share.mapSize);
      const dy = dFdy(mapUv).mul(share.mapSize);
      const mip = log2(max(max(dot(dx, dx), dot(dy, dy)), 1)).mul(0.5);
      return vec4(c.rgb, c.a.mul(float(1).add(min(mip, 4).mul(0.25))));
    });
  });
}
