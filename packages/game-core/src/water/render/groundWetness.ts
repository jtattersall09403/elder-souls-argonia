import * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import { SEA, SURF_ENERGY, SWASH } from "../waves";
import { buriedThresholdM, type WaterMeta } from "../waterData";
import { esCausticVisibility, esWaterCaustics } from "./caustics";
import { esConnectedStage, esOwnedRaster } from "./connectedStage";
import { LOCAL_WATER_EDGE_M } from "../localPatchPresentation";
import { esLocalWaterCaustic } from "./localWaterCaustics";
import { wrapLightingFinish } from "./receiverLighting";
import { claimFeature, wrapColor, type TslNode } from "../../render/nodes/materialNodes";
import type { LocalWaterSurfaceState } from "./types";

// Loosely typed on purpose (docs/standards/tsl-shaders.md §1).
const {
  abs, cameraPosition, clamp, distance, dot, float, floor, fract, If, int, ivec2, max, min, mix,
  normalWorld, positionWorld, select, sin, smoothstep, sqrt, step, texture, uniform, vec2, vec3, vec4,
  Fn, materialRoughness,
} = tsl as TslNode;

/** The previous raster bundle remains supported for reversible studio comparison. */
export interface GroundWetnessAssets {
  meta: WaterMeta;
  surfaceTex: THREE.Texture;
  shoreTex: THREE.Texture;
  klassTex: THREE.Texture;
  supportTex?: THREE.Texture;
  characterTex?: THREE.Texture;
  accessTex?: THREE.Texture;
}

/** A 1x1 stand-in bound to every raster node until a bundle is primed (a
 * texture node can never hold null). One per uniform set: no module state. */
function placeholderTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  tex.name = "water-wetness-placeholder";
  tex.needsUpdate = true;
  return tex;
}

type RasterNode = ReturnType<typeof texture> & { esPlaceholder: THREE.Texture };

function rasterNode(placeholder: THREE.Texture): RasterNode {
  const node = texture(placeholder) as RasterNode;
  node.esPlaceholder = placeholder;
  return node;
}

/** Bind a raster (or the placeholder when `tex` is null). Writers outside this
 * file set `node.value = tex` directly; use this to clear one. */
export function setWetnessRaster(node: RasterNode, tex: THREE.Texture | null): void {
  node.value = tex ?? node.esPlaceholder;
}

/** True when the node holds a real raster, not the placeholder. */
export function hasWetnessRaster(node: RasterNode): boolean {
  return node.value !== node.esPlaceholder;
}

/** Each scene owns its wetness state; the renderer injects current tide/season/weather.
 * Every member is a TSL node shared by every receiving material; write `.value`.
 * Raster members are texture nodes bound to a 1x1 placeholder until primed. */
export function createGroundWetnessUniforms() {
  const placeholder = placeholderTexture();
  return {
    uLocalWaterField: rasterNode(placeholder),
    uLocalWaterInfo: uniform(new THREE.Vector4(0, 0, 1, 1)),
    uLocalWaterEdge: uniform(LOCAL_WATER_EDGE_M),
    uLocalWaterActive: uniform(0),
    uLocalWaterBody: uniform(0),
    uWetSurf: rasterNode(placeholder),
    uWetShore: rasterNode(placeholder),
    uWetKlass: rasterNode(placeholder),
    uWetSupport: rasterNode(placeholder),
    uWetCharacter: rasterNode(placeholder),
    uWetAccess: rasterNode(placeholder),
    uWetAccessParams: uniform(new THREE.Vector3(0, -2, 4)),
    uWetNativeCoverage: uniform(0),
    /** Surface minimum, range, texture size and metres per sample. */
    uWetParams: uniform(new THREE.Vector4(0, 1, 0, 1)),
    uWetOrigin: uniform(0),
    /** Signed-depth decode of the surface B channel (decision 0047). */
    uWetDepthMin: uniform(0),
    uWetDepthSpan: uniform(25.5),
    /** Signed depth above which a texel's level counts (waterData
     * buriedThresholdM): buried texels never weigh into the wet band's level. */
    uWetBuried: uniform(0.001),
    /** Class texture size, metres per sample and grid origin in metres. */
    uWetKlassParams: uniform(new THREE.Vector3(1, 1, 0)),
    uWetShoreMax: uniform(160),
    uWetHasSupport: uniform(0),
    uWetHasCharacter: uniform(0),
    uWetLevels: uniform(new THREE.Vector2(0, 0)),
    uRainWet: uniform(0),
    /** Wave-scale knob (caustic wind only). */
    uWetWind: uniform(1),
    /** The weather's 10 m wind (m/s): the beach band's surf energy, the same
     * knob as the water surface's (waves.ts surfEnergyScale). 0 = the floor
     * wind, a calm sea. */
    uWetWindMS: uniform(0),
    uWetTime: uniform(0),
    /** Dev-only A/B scalar on the caustic terms only (1 = shipped look). */
    uWetCausticDebug: uniform(1),
    uWetSun: uniform(new THREE.Vector3(0, -1, 0)),
  };
}

export type GroundWetnessUniforms = ReturnType<typeof createGroundWetnessUniforms>;

export function updateGroundLocalWater(uniforms: GroundWetnessUniforms, state: LocalWaterSurfaceState | null): void {
  uniforms.uLocalWaterActive.value = state?.active ? 1 : 0;
  setWetnessRaster(uniforms.uLocalWaterField, state?.field ?? null);
  if (!state) return;
  uniforms.uLocalWaterInfo.value.set(state.originX, state.originZ, state.cellSizeM, state.size);
  uniforms.uLocalWaterEdge.value = state.edgeBlendM;
  uniforms.uLocalWaterBody.value = state.bodyIndex;
}

export function primeGroundWetnessUniforms(uniforms: GroundWetnessUniforms, assets: GroundWetnessAssets): void {
  const { surface, klass } = assets.meta;
  setWetnessRaster(uniforms.uWetSurf, assets.surfaceTex);
  setWetnessRaster(uniforms.uWetShore, assets.shoreTex);
  setWetnessRaster(uniforms.uWetKlass, assets.klassTex);
  setWetnessRaster(uniforms.uWetSupport, assets.supportTex ?? null);
  setWetnessRaster(uniforms.uWetCharacter, assets.characterTex ?? null);
  setWetnessRaster(uniforms.uWetAccess, assets.accessTex ?? null);
  uniforms.uWetAccessParams.value.set(assets.accessTex ? 1 : 0,
    surface.accessMinOffsetM ?? -2, surface.accessSpanM ?? 4);
  uniforms.uWetNativeCoverage.value = surface.nativeChannelCoverage ? 1 : 0;
  uniforms.uWetHasSupport.value = assets.supportTex ? 1 : 0;
  uniforms.uWetHasCharacter.value = assets.characterTex ? 1 : 0;
  uniforms.uWetParams.value.set(surface.minM, surface.maxM - surface.minM, surface.size, surface.metresPerPixel);
  uniforms.uWetOrigin.value = surface.gridOriginM ?? surface.metresPerPixel * 0.5;
  uniforms.uWetDepthMin.value = surface.depthMinM ?? 0;
  uniforms.uWetDepthSpan.value = surface.depthSpanM ?? 25.5;
  uniforms.uWetBuried.value = buriedThresholdM(assets.meta);
  uniforms.uWetKlassParams.value.set(klass.size, klass.metresPerPixel, klass.gridOriginM ?? klass.metresPerPixel * 0.5);
  uniforms.uWetShoreMax.value = surface.shoreMaxM ?? 160;
}

/** Base gain: the focused-ray density is sparse, so a unit gain reads as a
 * 0.3 % bed lift in probes; 3x brings a 1 m sunlit bed into the visible band. */
export const CAUSTIC_STRENGTH = 3.0;

/** The water rasters load without mipmaps (loadWaterAssets.ts dataTexture:
 * generateMipmaps = false), so level-0 sampling equals the old texture2D and
 * is legal inside `If` blocks (WGSL forbids implicit-LOD samples there). */
const sample0 = (node: TslNode, uv: TslNode): TslNode => node.sample(uv).level(0);

/** Node twins of the old WATER_RECEIVER_DECLARATIONS helpers, bound to one
 * uniform set. Exported for the water material and tests. */
export function waterReceiverNodes(u: GroundWetnessUniforms) {
  const P = u.uWetParams;
  const insideProvince = (p: TslNode): TslNode => {
    const extent = float(P.z).mul(P.w);
    return p.x.greaterThanEqual(0.0).and(p.y.greaterThanEqual(0.0))
      .and(p.x.lessThan(extent)).and(p.y.lessThan(extent));
  };
  const stage = (p: TslNode, salinity: TslNode, season: TslNode): TslNode => select(
    insideProvince(p).not(), vec3(-2.0, 1.0, 0.0),
    select(u.uWetAccessParams.x.lessThan(0.5), vec3(-2.0, smoothstep(0.02, 0.15, salinity), season),
      esConnectedStage(p, u.uWetSurf, u.uWetSupport, u.uWetShore, P.z, P.w, u.uWetOrigin,
        u.uWetAccessParams.y, u.uWetAccessParams.z)));
  const surfaceUv = (xz: TslNode): TslNode => vec2(xz).sub(u.uWetOrigin).div(P.w).add(0.5).div(P.z);
  const classUv = (xz: TslNode): TslNode =>
    vec2(xz).sub(u.uWetKlassParams.z).div(u.uWetKlassParams.y).add(0.5).div(u.uWetKlassParams.x);
  // Decode BEFORE interpolation: 16-bit level is in RG, signed depth in B.
  const levelDepth = (texel: TslNode): TslNode => {
    const v = u.uWetSurf.load(clamp(texel, ivec2(0), ivec2(int(P.z)).sub(1)));
    const level = v.r.mul(255.0 * 256.0).add(v.g.mul(255.0)).div(65535.0);
    return vec2(float(P.x).add(level.mul(P.y)), v.b.mul(u.uWetDepthSpan).add(u.uWetDepthMin));
  };
  // NOT-BURIED level weighting (KEEP IN LOCKSTEP with waterMaterial.ts
  // esSurfaceAt and WaterData.surfaceBase): only texels whose signed depth is
  // above the buried threshold weigh into the level; the depth keeps the
  // plain bilinear (16c round 2). The native-coverage path is owner-weighted.
  const sampleSurface = (xz: TslNode): TslNode => {
    const value = esOwnedRaster(xz, u.uWetSurf, u.uWetSupport, P.z, P.w, u.uWetOrigin);
    const nLevel = value.rg.dot(vec2(65280.0, 255.0)).div(65535.0);
    const native = vec2(float(P.x).add(nLevel.mul(P.y)), value.b.mul(u.uWetDepthSpan).add(u.uWetDepthMin));
    const pixel = clamp(vec2(xz).sub(u.uWetOrigin).div(P.w), vec2(0.0), vec2(float(P.z).sub(1.0)));
    const corner = ivec2(floor(pixel)).toVar();
    const f = fract(pixel).toVar();
    const s00 = levelDepth(corner).toVar(), s10 = levelDepth(corner.add(ivec2(1, 0))).toVar();
    const s01 = levelDepth(corner.add(ivec2(0, 1))).toVar(), s11 = levelDepth(corner.add(ivec2(1, 1))).toVar();
    const bw = vec4(float(1.0).sub(f.x).mul(float(1.0).sub(f.y)), f.x.mul(float(1.0).sub(f.y)),
      float(1.0).sub(f.x).mul(f.y), f.x.mul(f.y));
    const wet = vec4(step(u.uWetBuried, s00.y), step(u.uWetBuried, s10.y),
      step(u.uWetBuried, s01.y), step(u.uWetBuried, s11.y));
    const ww = bw.mul(wet).toVar();
    const wsum = ww.x.add(ww.y).add(ww.z).add(ww.w).toVar();
    const plain = mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y).toVar();
    const weighted = ww.x.mul(s00.x).add(ww.y.mul(s10.x)).add(ww.z.mul(s01.x)).add(ww.w.mul(s11.x)).div(wsum);
    const bilinear = vec2(select(wsum.greaterThan(0.0), weighted, plain.x), plain.y);
    return select(insideProvince(xz).not(), vec2(0.0, 25.5),
      select(u.uWetNativeCoverage.greaterThan(0.5), native, bilinear));
  };
  // KEEP IN LOCKSTEP with waves.ts surfEnergyScale(wind, SEA.fetchMaxM): THE
  // surf energy knob, on the ocean's fetch. Constants rounded as the GLSL
  // template printed them.
  const surfEnergy = (windMS: TslNode): TslNode => {
    const w = max(Number(SEA.swellFloorWindMS.toFixed(1)), windMS);
    const hs = min(w.mul(0.0016 * Math.sqrt(Number(SEA.fetchMaxM.toFixed(1)) / 9.81)),
      w.mul(w).mul(0.21).div(9.81));
    return clamp(hs.mul(0.25).div(Number(SURF_ENERGY.refRmsM.toFixed(2))),
      Number(SURF_ENERGY.min.toFixed(1)), Number(SURF_ENERGY.max.toFixed(1)));
  };
  const hash = (p: TslNode): TslNode => fract(sin(dot(p, vec2(157.31, 113.97))).mul(43137.5453));
  const noise = (p: TslNode): TslNode => {
    const i = floor(p);
    const f0 = fract(p);
    const f = f0.mul(f0).mul(vec2(3.0).sub(f0.mul(2.0)));
    return mix(mix(hash(i), hash(i.add(vec2(1.0, 0.0))), f.x),
      mix(hash(i.add(vec2(0.0, 1.0))), hash(i.add(vec2(1.0, 1.0))), f.x), f.y);
  };
  return { insideProvince, stage, surfaceUv, classUv, levelDepth, sampleSurface, surfEnergy, hash, noise };
}

/** Inputs of the shared direct-light receiver term. */
export interface WaterReceiverInputs {
  /** World position, display-scaled (y × verticalScale). */
  worldPosition: TslNode;
  /** World-space receiver normal (need not be unit). */
  worldNormal: TslNode;
  verticalScale: TslNode;
}

/** Shared direct-light receiver path for terrain and opt-in physical props:
 * returns k such that the caller adds `reflectedLight.directDiffuse * k` to
 * outgoingLight (both old caustic terms folded; same maths). Evaluate
 * derivative-bearing optics uniformly, then apply ownership gates; call at the
 * top level of the lighting finish, never inside an `If`. */
export function waterReceiverCaustic(u: GroundWetnessUniforms, inputs: WaterReceiverInputs): TslNode {
  return Fn(() => {
  const n = waterReceiverNodes(u);
  const position = vec3(inputs.worldPosition);
  const receiver = vec3(position.x, position.y.div(max(inputs.verticalScale, 0.001)), position.z).toVar();
  const receiverNormal = vec3(inputs.worldNormal).normalize().toVar();
  const suv = n.surfaceUv(receiver.xz).toVar();
  // The physical query and ocean surface continue beyond the raster as tidal
  // open sea. Receivers must use that same column and chemistry.
  // Every implicit-LOD sample is taken here, at the top of the graph (a
  // `select` branch is real control flow in WGSL).
  const outside = select(n.insideProvince(receiver.xz), float(0.0), float(1.0)).toVar();
  const shore = mix(u.uWetShore.sample(suv).rgb, vec3(1.0, 0.0, 0.0), outside).toVar();
  const klass = mix(u.uWetKlass.sample(n.classUv(receiver.xz)).rgb, vec3(1.0 / 255.0, 0.25, 1.0), outside).toVar();
  const support = u.uWetSupport.sample(suv).toVar();
  const column = n.sampleSurface(receiver.xz).toVar();
  const stage = n.stage(receiver.xz, klass.b, shore.g).toVar();
  const offset = stage.y.mul(u.uWetLevels.x).add(stage.z.mul(u.uWetLevels.y)).toVar();
  const level = column.x.add(offset).toVar();
  // Ownership of the column, NOT a light gate: a support raster names the
  // owning body where a bundle ships one; the field bundle has none, and there
  // "submerged" is exactly the sampled signed depth proxy standing above the
  // receiver (gating on uWetHasSupport alone zeroed caustics for every
  // fragment in the province, decision 0046 bundle).
  const owned = select(u.uWetHasSupport.greaterThan(0.5), step(0.5, support.r), step(0.05, column.y));
  const barred = u.uWetAccessParams.x.greaterThan(0.5).and(stage.x.greaterThan(offset.add(0.001)));
  const supported = select(barred, float(0.0), mix(owned, 1.0, outside).mul(step(0.5, u.uWetParams.z))).toVar();
  const focus = esWaterCaustics(receiver, receiverNormal, level, klass.g, shore.b,
    u.uWetSun, supported, u.uWetTime, clamp(float(u.uWetWind).mul(0.3).add(0.45), 0.45, 1.0));
  const localBody = mix(support.gb.dot(vec2(65280.0, 255.0)), 65535.0, outside);
  const localFocus = esLocalWaterCaustic(u, receiver, receiverNormal, level, u.uWetSun);
  // The physical patch must not make opaque tannin/turbidity transparent.
  const localVisibility = esCausticVisibility(level.sub(receiver.y), klass.g, shore.b,
    u.uWetSun.y, 1.0, supported, 1.0);
  return focus.mul(CAUSTIC_STRENGTH).mul(u.uWetCausticDebug)
    .add(localFocus.mul(localVisibility).mul(u.uWetCausticDebug)
      .mul(float(1.0).sub(step(0.5, abs(localBody.sub(u.uLocalWaterBody))))));
  })();
}

/** The minimum HEIGHT the wet-shore band fades over (m). The swash run-up sets
 * how far up a beach the band reaches, but it falls to 0.08 m where there is
 * no surf, and a band that fades over 8 cm of height is an iso-contour of the
 * compiled level: a straight line with the raster's own steps and bilinear
 * facets in it (owner 2026-09-14). 0.35 m is a hand's depth of damp sand — at
 * a beach's slope a couple of metres of ground, at a river bank a few
 * centimetres of bank, and never a drawn line. */
export const WET_BAND_SOFT_M = 0.35;

/** Explicit inputs of the surface wetness term (the old SURFACE_WETNESS_GLSL
 * read the host terrain's vEsWorldPos, esNrmW, uVerticalScale, uClimateAir
 * and uProvinceExtentM). */
export interface SurfaceWetnessInputs extends WaterReceiverInputs {
  /** Texture node of the climate-air raster (B = canopy); omit = no canopy shelter. */
  climateAir?: TslNode;
  /** Province extent in metres (the climate raster's span); needed with climateAir. */
  provinceExtent?: TslNode;
}

/** The wet total (0..1) a ground receiver darkens and smooths by: the
 * compiled shore band (faded by camera distance) max the rain wetness. */
export function surfaceWetnessNode(u: GroundWetnessUniforms, inputs: SurfaceWetnessInputs): TslNode {
  const n = waterReceiverNodes(u);
  const P4 = u.uWetParams;
  return Fn(() => {
    const worldPos = vec3(inputs.worldPosition).toVar();
    const normalY = vec3(inputs.worldNormal).normalize().y.toVar();
    const wetTotal = float(0.0).toVar("esWetTotal");
    // The compiled band is a 22 m strip that darkens the ground by 45 %: from
    // the air it projected to a one-pixel black line tracing every coast at
    // any distance (16c round 2). It fades out with camera distance; rain
    // wetness below is unaffected.
    const fade = float(1.0).sub(smoothstep(350.0, 1200.0, distance(cameraPosition.xz, worldPos.xz)));
    If(P4.z.greaterThan(0.5).and(fade.greaterThan(0.0)), () => {
      const xz = worldPos.xz;
      const uv = n.surfaceUv(xz);
      const supportedHere = u.uWetHasSupport.lessThan(0.5).or(sample0(u.uWetSupport, uv).r.greaterThan(0.5));
      If(n.insideProvince(xz).and(supportedHere), () => {
        const ss = sample0(u.uWetShore, uv).rgb.toVar();
        const shoreM = ss.r.mul(u.uWetShoreMax).toVar();
        If(shoreM.lessThan(22.0), () => {
          const surface = n.sampleSurface(xz).toVar();
          const kuv = n.classUv(xz).toVar();
          const k = sample0(u.uWetKlass, kuv).toVar();
          const kPixel = clamp(ivec2(floor(kuv.mul(u.uWetKlassParams.x))), ivec2(0),
            ivec2(float(u.uWetKlassParams.x).sub(1.0)));
          const rawClass = u.uWetKlass.load(kPixel).r.mul(255.0);
          const klass = select(u.uWetHasSupport.greaterThan(0.5).and(rawClass.lessThan(0.5)), float(4.0), rawClass);
          const stage = n.stage(xz, k.b, ss.g).toVar();
          const offset = stage.y.mul(u.uWetLevels.x).add(stage.z.mul(u.uWetLevels.y)).toVar();
          const W = surface.x.add(offset);
          const depth = surface.y.add(offset);
          const H = worldPos.y.div(inputs.verticalScale);
          // The beach run-up band belongs to the sea: a coast or estuary class
          // is the open sea's shore; inland lakes and rivers keep a damp
          // contact edge, never run-up.
          const fetch = select(klass.greaterThan(0.5).and(klass.lessThan(2.5)),
            float(1.0).sub(clamp(max(k.g, ss.b), 0.0, 1.0).mul(0.85)), float(0.0));
          // KEEP IN LOCKSTEP with waves.ts swashMax(): the recent waterline
          const lift = float(Number((0.75 * SWASH.amplitudeM).toFixed(6))).mul(n.surfEnergy(u.uWetWindMS))
            .mul(max(float(1.0).sub(shoreM.div(Number(SWASH.bandM.toFixed(1)))), 0.0))
            .mul(clamp(fetch.mul(1.6), 0.0, 1.0)).add(0.08);
          // How much HEIGHT the band fades over: the floor is the softness,
          // never the position (owner 2026-09-14).
          const soft = max(lift, WET_BAND_SOFT_M).toVar();
          const noiseN = n.noise(xz.mul(0.35)).mul(0.65).add(n.noise(xz.mul(1.7)).mul(0.35)).toVar();
          // ...and the contour is broken by the same noise, at the softness scale.
          const above = H.sub(W).add(noiseN.sub(0.5).mul(soft).mul(0.9));
          const wet = float(1.0).sub(smoothstep(soft.mul(0.55), soft.mul(1.65), above))
            .mul(float(1.0).sub(smoothstep(14.0, 22.0, shoreM))).mul(noiseN.mul(0.4).add(0.8)).toVar();
          If(u.uWetAccessParams.x.greaterThan(0.5), () => {
            wet.mulAssign(float(1.0).sub(smoothstep(soft, soft.mul(1.65), stage.x.sub(offset))));
          });
          // Signed depth distinguishes reachable dry shore from dry terrain
          // near a body's raster level; the window spans five 0.12 m quanta
          // and is noise-broken (2026-09-14).
          If(u.uWetHasSupport.greaterThan(0.5).or(u.uWetDepthMin.lessThan(-0.5)), () => {
            wet.mulAssign(float(1.0).sub(smoothstep(soft.mul(1.65).add(0.15), soft.mul(1.65).add(0.75),
              depth.negate().add(noiseN.sub(0.5).mul(0.25)))));
          });
          wet.mulAssign(smoothstep(0.78, 0.9, normalY));
          wetTotal.assign(clamp(wet.mul(0.85), 0.0, 1.0).mul(fade));
        });
      });
    });
    // Rain remains independent of hydrological support and persists as the
    // injected weather wetness decays; canopy shelters the ground below it.
    const canopy = inputs.climateAir && inputs.provinceExtent
      ? inputs.climateAir.sample(vec2(worldPos.x.div(inputs.provinceExtent),
        float(1.0).sub(worldPos.z.div(inputs.provinceExtent)))).b.toVar()
      : float(0.0);
    const rainWet = float(u.uRainWet).mul(float(1.0).sub(float(canopy).mul(0.75)))
      .mul(smoothstep(0.55, 0.85, normalY).mul(0.45).add(0.55)).mul(0.8);
    If(u.uRainWet.greaterThan(0.003), () => { wetTotal.assign(max(wetTotal, rainWet)); });
    return wetTotal;
  })();
}

/** Default receiver inputs: the fragment's world position and normal. */
function defaultInputs(verticalScale: TslNode): WaterReceiverInputs {
  return { worldPosition: positionWorld, worldNormal: normalWorld, verticalScale };
}

/** Ground wetness + caustics on a node material (terrain). Wraps `colorNode`
 * (rgb × (1 − 0.45 wet)), `roughnessNode` (→ 0.3 by 0.8 wet) and the lighting
 * finish (caustic direct light). Idempotent. Call after the terrain's own
 * colour/roughness nodes are set; pass its display-scaled world position,
 * world normal, vertical scale and climate raster where it has them. */
export function applyGroundWetness(material: NodeMaterial, uniforms: GroundWetnessUniforms,
  inputs: Partial<SurfaceWetnessInputs> = {}): void {
  if (!claimFeature(material, "water-ground-wetness")) return;
  const full: SurfaceWetnessInputs = { ...defaultInputs(inputs.verticalScale ?? float(1.0)), ...inputs };
  const wet = surfaceWetnessNode(uniforms, full);
  const active = wet.greaterThan(0.003);
  wrapColor(material, (c) => select(active, vec4(c.rgb.mul(float(1.0).sub(wet.mul(0.45))), c.a), c));
  const m = material as NodeMaterial & { roughnessNode?: TslNode };
  const roughness = m.roughnessNode ? float(m.roughnessNode) : materialRoughness;
  m.roughnessNode = select(active, mix(roughness, 0.3, wet.mul(0.8)), roughness);
  addReceiverCaustics(material, uniforms, full);
}

/** Add the caustic direct-light term to a material's lighting finish. */
export function addReceiverCaustics(material: NodeMaterial, uniforms: GroundWetnessUniforms,
  inputs: WaterReceiverInputs): void {
  wrapLightingFinish(material, (context) => {
    context.outgoingLight.addAssign(context.reflectedLight.directDiffuse
      .mul(waterReceiverCaustic(uniforms, inputs)));
  });
}
