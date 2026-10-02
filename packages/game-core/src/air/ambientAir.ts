import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
  Discard, Fn, If, abs, attribute, cameraProjectionMatrix, clamp, cos, dot, exp, float, floor, fract, ivec2, length,
  max, min, mix, mod, modelViewMatrix, normalize, positionGeometry, pow, sin, smoothstep, step, texture,
  textureLoad, varying, vec2, vec3, vec4, viewportSize,
} from "three/tsl";
import { sel, type TslNode } from "../render/nodes/materialNodes";
import { PRECIP_LAYER } from "../water/render/waterMaterial";
import { sharedUniform } from "../render/nodes/sharedUniform";

/**
 * Ambient air particles — fireflies, pollen, motes, midges (module 55 polish
 * tier, owner 2026-09-10).
 *
 * One mechanism, several species. Every species is a single instanced-quad
 * draw whose whole motion is computed in the vertex stage from static
 * per-particle attributes, so there is no CPU work per frame beyond writing a
 * handful of uniforms, and no spawning or despawning ever happens.
 *
 * The field feels infinite because it is CAMERA-ANCHORED AND WRAPPED: each
 * particle's offset from the camera is taken modulo a box, so walking forward
 * makes particles behind you reappear in front. The wrap is applied to
 * (base + wander) together rather than to the base alone — wrapping first and
 * then adding motion tears particles across the box seam.
 *
 * Nothing here reads world data. A species is told how strongly to render by
 * one `amount` scalar, and the caller derives that from the light rig, the
 * weather and the local climate — which keeps this file portable and lets the
 * whole system be switched off by passing zero.
 */

/** How a species moves and looks. All distances metres, times seconds. */
export interface AirSpecies {
  id: string;
  /** Particles in the field. Fill-rate, not vertex count, is the limit. */
  count: number;
  /** Horizontal half-extents of the wrap box (x, z). The y entry is ignored:
   * the band's vertical extent comes from `depthM` below. */
  box: [number, number, number];
  /** How far BELOW THE CAMERA the band's top sits, metres, and how deep the
   * band runs from there. Deliberately camera-relative rather than measured
   * up from the ground: the renderer has no cheap, correct ground height at
   * the camera (the province's height preview is the pre-sculpt one and is
   * out by hundreds of metres), and it does not need one — particles
   * depth-test against the terrain, so anything below the surface is hidden
   * by the ground itself. Running the band deeper than the ground therefore
   * costs nothing and makes the VISIBLE band "from the ground up to just
   * under eye level" on flat ground and on a slope alike. */
  topBelowCameraM: number;
  depthM: number;
  /** Sprite size in pixels at 10 m. Big enough that the halo has pixels to
   * be soft in — a 3 px sprite can only ever be a dot. Clamped to
   * AIR_SPRITE_MAX_PX in the vertex stage. */
  sizePx: number;

  /**
   * EMISSIVE species make their own light (fireflies): radiance anchored
   * against exposure, so `emissiveScreen` IS the brightness they render at.
   *
   * LIT species (pollen, midges, dragonflies, leaves) do not glow. Their
   * radiance comes from the real sky and sun through the same function the
   * water spray uses, times `albedo`. That difference is what separates a
   * mote that catches the light from a flat grey dot.
   */
  emissive: boolean;
  emissiveScreen: number;
  /** Hot centre and surrounding glow. Making them the SAME colour is what
   * makes a sprite read as a flat disc rather than something glowing. */
  core: [number, number, number];
  halo: [number, number, number];
  /** Lit species only: diffuse albedo. */
  albedo: [number, number, number];
  opacity: number;
  /** Additive emits (fireflies); normal catches light (pollen, dust). */
  additive: boolean;
  wander: [number, number, number];
  wanderHz: number;
  /** Constant drift, m/s. Wind is added on top. */
  drift: [number, number, number];
  windFollow: number;
  /** Blink period range [min, max] seconds; [0,0] means none. The envelope
   * SHAPE lives in airBlinkEnvelope; this is only its rate. */
  blink: [number, number];
  /** Clump radius. 0 scatters uniformly; >0 gathers particles into knots,
   * which is what stops a swarm reading as even fog. */
  clusterRadius: number;
  /** Nothing renders closer to the camera than this. In third person the
   * player stands a few metres ahead of the eye, and a particle nearer than
   * that hangs between the camera and the character, which reads as being on
   * the lens rather than in the world. */
  nearClipM: number;
  /** Size in metres of the WORLD-ANCHORED density patches: some ground holds
   * a swarm and some holds almost none, so walking takes you through pockets
   * instead of a uniform cloud. 0 disables and the field is even. */
  patchM: number;
  /**
   * 16f: where the RECORD says this species lives, as weights on the water
   * dressing's habitat raster (R standing water, G wet ground, B canopy).
   * When the scene binds a habitat texture the patch centres are weighted by
   * `dot(habitat, weights)` and the value noise only textures the density
   * inside it; without one the noise alone patches as before. Omitted: the
   * species is everywhere its conditions allow.
   */
  habitat?: readonly [number, number, number];
  /** Extra brightness between eye and sun — Mie forward scatter. For dust
   * and pollen this is most of their visibility, and it is what makes them
   * show in a shaft of light and near-vanish elsewhere. */
  backlight: number;
  /** Over standing water the band's FLOOR is the water surface plus this
   * (metres), never the ground under it (owner 2026-09-13, Phase 16c): a
   * midge column over a 2 m pond hovers a hand above the water, not 2 m up.
   * The species spreads from that floor up through `hoverBandM`. Omitted:
   * the ground bounds the band (the terrain's own depth buffer). */
  hoverAboveWaterM?: number;
  hoverBandM?: number;
}

/** The compiled water surface the air layer reads (the province rasters the
 * water runtime already holds): the still-water texture and its decode. */
export interface AirWaterSurface {
  /** RGBA8 of water-surface.png: R,G = 16-bit W, B = signed depth. */
  texture: THREE.Texture;
  size: number;
  metresPerPixel: number;
  minM: number;
  spanM: number;
  depthMinM: number;
  depthSpanM: number;
  /** Signed depth at or below which the texel is dry ground (no floor). */
  buriedM: number;
  /** Tide + season lift (m) near the camera this frame (≤ 0 since 16c). */
  liftM: () => number;
  /** 16f habitat raster (water-habitat.png) on the same grid, or absent. */
  habitat?: THREE.Texture;
}

/**
 * The floor a particle over water hovers from: the water surface (still
 * level plus the lift) plus the species' hover height, or null where there
 * is no water under it (dry ground: the terrain bounds the band). CPU twin
 * of the vertex stage's `floorY`; `bandFrac` (0..1, per particle) spreads
 * the swarm up through the hover band so it never sits on one plane.
 */
export function airHoverFloorY(species: AirSpecies, waterSurfaceY: number | null, bandFrac: number): number | null {
  if (species.hoverAboveWaterM === undefined || waterSurfaceY === null) return null;
  return waterSurfaceY + species.hoverAboveWaterM + Math.min(Math.max(bandFrac, 0), 1) * (species.hoverBandM ?? 0);
}

/**
 * Standing water under a hover species (owner 2026-09-14, 16c round 2): a
 * midge column or a dragonfly knot exists ONLY over water at least this deep
 * after the tide/season lift. Before this gate the hover floor only lifted
 * the band where there was water and every dry lowland cell still drew the
 * species at full alpha ("they are everywhere in the lowlands, not just
 * over water"). CPU twin of the vertex stage's `waterGate`; returns the
 * alpha factor, 1 or 0.
 */
export const AIR_WATER_MIN_DEPTH_M = 0.15;
export function airWaterGate(signedDepthM: number, liftM: number): number {
  return signedDepthM + liftM >= AIR_WATER_MIN_DEPTH_M ? 1 : 0;
}

/**
 * World-anchored density patches, as a smoothstep band on the value noise:
 * a species is drawn where the noise clears the band. Hover species use a
 * high band so roughly a third of the water carries a knot and the rest is
 * empty (localised groups, not an even haze); the ground species keep the
 * broad band. The vertex stage reads these through `uPatchBand`.
 */
export const AIR_PATCH_BAND = { ground: [0.10, 0.50], water: [0.40, 0.62] } as const;
export function airPatchBand(species: AirSpecies): readonly [number, number] {
  return species.hoverAboveWaterM !== undefined ? AIR_PATCH_BAND.water : AIR_PATCH_BAND.ground;
}

/**
 * The blink envelope a firefly flashes on, given its phase 0..1 through one
 * period: a slow rise, a brief peak, a slower decay, then a dark gap longer
 * than the lit part. A fast symmetric pulse reads as a strobe, which is what
 * the first version did. The vertex stage mirrors this exactly.
 */
export function airBlinkEnvelope(phase: number): number {
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const ph = phase - Math.floor(phase);
  return Math.pow(ss(0, 0.16, ph) * (1 - ss(0.16, 0.6, ph)), 1.5);
}

/** Largest sprite, in framebuffer pixels (the old gl_PointSize clamp, kept
 * under the 64 some drivers imposed). */
export const AIR_SPRITE_MAX_PX = 48;

/**
 * A particle's sprite size in framebuffer pixels at `distM`, and the alpha
 * factor that fades a sprite smaller than one pixel instead of drawing it at
 * one pixel's full weight. The vertex stage mirrors this exactly.
 */
export function airSpriteSize(sizePx: number, scale: number, pixelRatio: number, distM: number): {
  px: number;
  alpha: number;
} {
  const raw = sizePx * scale * pixelRatio * (10 / Math.max(distM, 0.001));
  const tiny = Math.min(raw, 1);
  return { px: Math.min(Math.max(raw, 1), AIR_SPRITE_MAX_PX), alpha: tiny * tiny };
}

/**
 * The swarm's uniforms: `uniform()` nodes owned by the swarm, written through
 * `.value` exactly as the old `{ value }` objects were. The two textures are
 * texture nodes: `.value` is the bound texture (a 1x1 blank when none).
 */
export interface AirSwarmUniforms {
  uCam: { value: THREE.Vector3 } & TslNode;
  uTime: { value: number } & TslNode;
  uBox: { value: THREE.Vector3 } & TslNode;
  uYOffset: { value: number } & TslNode;
  uNearClip: { value: number } & TslNode;
  uPatchM: { value: number } & TslNode;
  uPatchBand: { value: THREE.Vector2 } & TslNode;
  uSizePx: { value: number } & TslNode;
  uPixelRatio: { value: number } & TslNode;
  uWander: { value: THREE.Vector3 } & TslNode;
  uWanderHz: { value: number } & TslNode;
  uDrift: { value: THREE.Vector3 } & TslNode;
  uClusterR: { value: number } & TslNode;
  uAmount: { value: number } & TslNode;
  uSunDir: { value: THREE.Vector3 } & TslNode;
  uBacklight: { value: number } & TslNode;
  uBacklitGain: { value: number } & TslNode;
  uVisibility: { value: number } & TslNode;
  /** The compiled water surface (Phase 16c): W16 in RG, signed depth in B. */
  uAirWaterTex: { value: THREE.Texture } & TslNode;
  /** size, metresPerPixel, minM, spanM */
  uAirWaterInfo: { value: THREE.Vector4 } & TslNode;
  /** depthMinM, depthSpanM, buriedM, enabled (0/1) */
  uAirWaterDepth: { value: THREE.Vector4 } & TslNode;
  /** hover above water (m), hover band (m), lift (m) */
  uAirHover: { value: THREE.Vector3 } & TslNode;
  /** 16f: R standing water, G wet ground, B canopy */
  uAirHabitat: { value: THREE.Texture } & TslNode;
  /** species weights on the habitat channels, w = enabled (0/1) */
  uAirHabitatW: { value: THREE.Vector4 } & TslNode;
  /** habitat width / surface size, habitat width (the habitat uploads halved) */
  uAirHabitatScale: { value: THREE.Vector2 } & TslNode;
  /** Scene-linear radiance, written every frame by update(). */
  uCore: { value: THREE.Color } & TslNode;
  uHalo: { value: THREE.Color } & TslNode;
  uOpacity: { value: number } & TslNode;
}

/** A 1x1 blank RGBA8 texture, bound where no raster is (a texture node always
 * needs a texture; every read of it is switched off by its enable flag). */
function blankTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// Cheap value noise, for the world-anchored density patches. Dave Hoskins'
// hash12 rather than fract(sin(dot(p, big))): it never feeds sin() a large
// argument, so it is exact at any input on any GPU. Built as plain node
// expressions (inlined at each call).
function esAirHash(p: TslNode): TslNode {
  const p3a: TslNode = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  const p3: TslNode = p3a.add(dot(p3a, p3a.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}
function esAirNoise(p: TslNode): TslNode {
  const i: TslNode = floor(p);
  const f0: TslNode = fract(p);
  const f: TslNode = f0.mul(f0).mul(float(3.0).sub(f0.mul(2.0)));
  return mix(
    mix(esAirHash(i), esAirHash(i.add(vec2(1.0, 0.0))), f.x),
    mix(esAirHash(i.add(vec2(0.0, 1.0))), esAirHash(i.add(vec2(1.0, 1.0))), f.x),
    f.y,
  );
}

/**
 * The swarm's node graph. Each particle is one instanced screen-aligned quad
 * (WebGPU has no point size above one pixel), sized in framebuffer pixels
 * exactly as the old point sprite was and placed in clip space around the
 * particle's projected centre, so the look is the old point sprite's.
 */
function buildSwarmMaterial(u: AirSwarmUniforms): NodeMaterial {
  const aBase: TslNode = attribute("aBase", "vec3");
  const aSeed: TslNode = attribute("aSeed", "vec3");
  const aPhase: TslNode = attribute("aPhase", "float");
  const aPeriod: TslNode = attribute("aPeriod", "float");
  const aScale: TslNode = attribute("aScale", "float");
  const t: TslNode = u.uTime;
  const hz: TslNode = u.uWanderHz;

  // Clumps are HORIZONTAL. A spherical clump would throw particles several
  // metres up through a band that is only a couple of metres deep, and the
  // wrap would then fold them back in at the wrong height — so the vertical
  // spread of a knot is capped by the band's own half-height.
  const clumpR: TslNode = vec3(u.uClusterR, min(u.uClusterR, u.uBox.y), u.uClusterR);
  const inner: TslNode = aSeed.sub(0.5).mul(2.0).mul(clumpR);

  const wx: TslNode = sin(t.mul(hz).mul(aSeed.x.add(0.6)).add(aSeed.x.mul(6.283)));
  const wy: TslNode = sin(t.mul(hz).mul(aSeed.y.add(1.0)).add(aSeed.y.mul(6.283))).mul(0.6)
    .add(sin(t.mul(hz).mul(2.3).add(aSeed.z.mul(6.283))).mul(0.2));
  const wz: TslNode = cos(t.mul(hz).mul(aSeed.z.add(0.7)).add(aSeed.z.mul(6.283)));

  const pos: TslNode = aBase.add(inner).add(vec3(wx, wy, wz).mul(u.uWander)).add(u.uDrift.mul(t));

  // The wrap is applied to (base + wander) together (see the file header).
  const centre: TslNode = u.uCam.add(vec3(0.0, u.uYOffset, 0.0));
  const rel: TslNode = mod(pos.sub(centre).add(u.uBox), u.uBox.mul(2.0)).sub(u.uBox);
  const world0: TslNode = centre.add(rel);

  // The compiled surface texel under xz (nearest): W16 in RG, signed depth in
  // B. The habitat raster has its own (halved) address below.
  const info: TslNode = u.uAirWaterInfo;
  const texelF: TslNode = clamp(world0.xz.div(info.y).sub(0.5), vec2(0.0), vec2(info.x.sub(1.001)));
  const texelI: TslNode = ivec2(texelF.add(0.5));
  const wt: TslNode = textureLoad(u.uAirWaterTex, texelI);
  const D: TslNode = u.uAirWaterDepth;
  const H: TslNode = u.uAirHover;
  const surfaceEnabled: TslNode = D.w.greaterThanEqual(0.5);
  const waterW: TslNode = info.z.add(wt.r.mul(255.0 * 256.0).add(wt.g.mul(255.0)).div(65535.0).mul(info.w));
  const waterDepth: TslNode = wt.b.mul(D.y).add(D.x).add(H.z);
  // KEEP IN LOCKSTEP with airHoverFloorY(): the floor over water, or a huge
  // negative where the texel under the particle is dry ground.
  const floorY: TslNode = sel(
    surfaceEnabled.and(waterDepth.greaterThan(max(D.z, 0.0))),
    waterW.add(H.z).add(H.x).add(aSeed.y.mul(H.y)),
    float(-1.0e9),
  );
  // over standing water the band's floor is the WATER SURFACE, never the
  // ground under it (Phase 16c): a species with a hover height rises to it
  const world: TslNode = vec3(world0.x, max(world0.y, floorY), world0.z);
  // KEEP IN LOCKSTEP with airWaterGate(): a hover species draws ONLY over
  // standing water. Without a bound surface nothing is gated.
  const waterGate: TslNode = sel(surfaceEnabled, step(AIR_WATER_MIN_DEPTH_M, waterDepth), float(1.0));

  const edgeLo: TslNode = vec3(0.62);
  const edge: TslNode = vec3(1.0).sub((smoothstep as (...a: TslNode[]) => TslNode)(edgeLo, vec3(1.0), abs(rel).div(u.uBox)));
  const fade: TslNode = edge.x.mul(edge.y).mul(edge.z);

  // BLINK ENVELOPE: airBlinkEnvelope(), per-insect period so a swarm never
  // falls into unison.
  // divisor kept finite for aPeriod = 0 (blink is 1 there), so sel() never meets a NaN
  const ph: TslNode = fract(t.div(sel(aPeriod.greaterThan(0.0), aPeriod, float(1.0))).add(aPhase));
  const blink: TslNode = sel(
    aPeriod.greaterThan(0.0),
    pow(smoothstep(0.0, 0.16, ph).mul(float(1.0).sub(smoothstep(0.16, 0.6, ph))), 1.5),
    float(1.0),
  );

  const mv: TslNode = modelViewMatrix.mul(vec4(world, 1.0));
  const dist: TslNode = max(mv.z.negate(), 0.001);

  // Forward scatter: brightest between eye and sun. For the lit species this
  // is most of their visibility.
  const backlit: TslNode = sel(
    u.uBacklight.greaterThan(0.0),
    pow(max(dot(normalize(world.sub(u.uCam)), u.uSunDir), 0.0), 8.0),
    float(0.0),
  );

  // Aerial haze on the scene's own visibility distance, plus a near fade so a
  // sprite never balloons across the screen (and in third person stays out
  // of the gap between the camera and the character).
  const haze: TslNode = exp(dist.negate().div(max(u.uVisibility, 1.0)));
  const near: TslNode = smoothstep(u.uNearClip.mul(0.55), u.uNearClip, dist);

  // World-anchored patchiness, sampled on the WRAPPED WORLD position so the
  // pockets belong to the ground. The domain wraps every 256 patches so the
  // hash input stays small in float32.
  const patchUV: TslNode = mod(world.xz.div(sel(u.uPatchM.greaterThan(0.0), u.uPatchM, float(1.0))), 256.0);
  const patchNoise: TslNode = sel(
    u.uPatchM.greaterThan(0.0),
    smoothstep(u.uPatchBand.x, u.uPatchBand.y, esAirNoise(patchUV)),
    float(1.0),
  );
  // 16f: the RECORD says where life is: the habitat weights gate the patch
  // centres and the value noise only textures the density inside them.
  // The habitat uploads halved (walk 9 rasters): its own texel address,
  // scaled from the surface grid by uAirHabitatScale (width ratio, width).
  const habS: TslNode = u.uAirHabitatScale;
  const habF: TslNode = clamp(world0.xz.div(info.y).mul(habS.x).sub(0.5), vec2(0.0), vec2(habS.y.sub(1.001)));
  const hab: TslNode = textureLoad(u.uAirHabitat, ivec2(habF.add(0.5))).rgb;
  const habW: TslNode = clamp(dot(hab, u.uAirHabitatW.xyz), 0.0, 1.0);
  const patch: TslNode = sel(
    u.uAirHabitatW.w.greaterThan(0.5),
    habW.mul(patchNoise.mul(0.65).add(0.35)),
    patchNoise,
  );

  // airSpriteSize(): framebuffer pixels, fading sub-pixel sprites by area.
  const sizeRaw: TslNode = u.uSizePx.mul(aScale).mul(u.uPixelRatio).mul(float(10.0).div(dist));
  const tiny: TslNode = min(sizeRaw, 1.0);
  const sizePx: TslNode = clamp(sizeRaw, 1.0, AIR_SPRITE_MAX_PX);
  const alpha: TslNode = fade.mul(blink).mul(u.uAmount).mul(haze).mul(near).mul(patch).mul(waterGate)
    .mul(tiny).mul(tiny);

  // Screen-aligned quad around the projected centre: corners are ±0.5, so the
  // quad spans `sizePx` framebuffer pixels whatever the depth.
  const clip: TslNode = cameraProjectionMatrix.mul(mv);
  const offset: TslNode = positionGeometry.xy.mul(sizePx).mul(2.0).div(viewportSize).mul(clip.w);

  const vAlpha: TslNode = varying(alpha, "vAirAlpha");
  const vBacklit: TslNode = varying(backlit, "vAirBacklit");
  const vCorner: TslNode = varying(positionGeometry.xy, "vAirCorner");

  const material = new NodeMaterial();
  material.vertexNode = vec4(clip.xy.add(offset), clip.z, clip.w);
  material.fragmentNode = Fn(() => {
    // Small bright core inside a wide soft halo, in two different colours. A
    // single flat disc is what reads as "dot"; the two-term falloff with a
    // hotter core is what reads as "glowing".
    const d: TslNode = length(vCorner).mul(2.0);
    const core: TslNode = float(1.0).sub(smoothstep(0.0, 0.34, d));
    const halo: TslNode = float(1.0).sub(smoothstep(0.06, 1.0, d));
    // The halo carries most of the visible area; the core is only the hot centre.
    const a: TslNode = core.add(halo.mul(0.6));
    If(a.lessThanEqual(0.002).or(vAlpha.lessThanEqual(0.002)), () => {
      Discard();
    });
    // uCore/uHalo arrive as SCENE-LINEAR RADIANCE, never display colours; the
    // renderer applies its tone map and output encode (toneMapped stays on).
    const col: TslNode = mix(u.uHalo, u.uCore, core).mul(u.uBacklitGain.mul(vBacklit).add(1.0));
    return vec4(col, a.mul(vAlpha).mul(u.uOpacity));
  })();
  return material;
}

/** One species' geometry, material and mesh. */
export class AirSwarm {
  /** One instanced quad per particle (the old `THREE.Points` draw). */
  readonly points: THREE.Mesh;
  readonly material: NodeMaterial;
  readonly uniforms: AirSwarmUniforms;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly blank: THREE.DataTexture;

  constructor(
    readonly species: AirSpecies,
    /** Deterministic per-particle randomness (world systems never use
     * Math.random — same seed, same swarm, always). */
    rand: () => number,
  ) {
    const n = species.count;
    const base = new Float32Array(n * 3);
    const seed = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    const period = new Float32Array(n);
    const scale = new Float32Array(n);
    const [bx, , bz] = species.box;
    // The vertical half-extent IS the band's half depth; species declare the
    // band by its top and depth so the two can never disagree.
    const by = species.depthM / 2;
    for (let i = 0; i < n; i++) {
      base[i * 3] = (rand() * 2 - 1) * bx;
      base[i * 3 + 1] = (rand() * 2 - 1) * by;
      base[i * 3 + 2] = (rand() * 2 - 1) * bz;
      seed[i * 3] = rand();
      seed[i * 3 + 1] = rand();
      seed[i * 3 + 2] = rand();
      phase[i] = rand();
      // Varying the period as well as the phase is what stops a swarm
      // falling into visible unison after a few seconds.
      period[i] =
        species.blink[1] > 0
          ? species.blink[0] + rand() * (species.blink[1] - species.blink[0])
          : 0;
      scale[i] = 0.7 + rand() * 0.6;
    }

    this.geometry = new THREE.InstancedBufferGeometry();
    // One quad, corners ±0.5 (the sprite's point coordinate, centred).
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
    );
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
    this.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 3));
    this.geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    this.geometry.setAttribute("aPeriod", new THREE.InstancedBufferAttribute(period, 1));
    this.geometry.setAttribute("aScale", new THREE.InstancedBufferAttribute(scale, 1));
    this.geometry.instanceCount = n;
    // The wrap makes every particle's drawn position independent of its base,
    // so an accurate bounding volume is impossible and a culled swarm would
    // simply vanish. Bound it hugely and let the wrap do the work.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.blank = blankTexture();
    this.uniforms = {
      uCam: sharedUniform(new THREE.Vector3()),
      uTime: sharedUniform(0),
      uBox: sharedUniform(new THREE.Vector3(bx, by, bz)),
      uYOffset: sharedUniform(0),
      uNearClip: sharedUniform(species.nearClipM),
      uPatchM: sharedUniform(species.patchM),
      uPatchBand: sharedUniform(new THREE.Vector2(...airPatchBand(species))),
      uSizePx: sharedUniform(species.sizePx),
      uPixelRatio: sharedUniform(1),
      uWander: sharedUniform(new THREE.Vector3(...species.wander)),
      uWanderHz: sharedUniform(species.wanderHz),
      uDrift: sharedUniform(new THREE.Vector3(...species.drift)),
      uClusterR: sharedUniform(species.clusterRadius),
      uAmount: sharedUniform(0),
      uSunDir: sharedUniform(new THREE.Vector3(0, 1, 0)),
      uBacklight: sharedUniform(species.backlight),
      uBacklitGain: sharedUniform(species.backlight),
      uVisibility: sharedUniform(1200),
      uAirWaterTex: texture(this.blank),
      uAirWaterInfo: sharedUniform(new THREE.Vector4(1, 1, 0, 1)),
      uAirWaterDepth: sharedUniform(new THREE.Vector4(0, 1, -2.5, 0)),
      uAirHover: sharedUniform(new THREE.Vector3(species.hoverAboveWaterM ?? 0, species.hoverBandM ?? 0, 0)),
      uAirHabitat: texture(this.blank),
      uAirHabitatW: sharedUniform(new THREE.Vector4(...(species.habitat ?? [0, 0, 0]), 0)),
      uAirHabitatScale: sharedUniform(new THREE.Vector2(1, 1)),
      uCore: sharedUniform(new THREE.Color(0, 0, 0)),
      uHalo: sharedUniform(new THREE.Color(0, 0, 0)),
      uOpacity: sharedUniform(species.opacity),
    };

    this.material = buildSwarmMaterial(this.uniforms);
    this.material.name = `air:${species.id}`;
    this.material.transparent = true;
    // Never occlude anything: these are specks of light and dust.
    this.material.depthWrite = false;
    this.material.depthTest = true;
    this.material.blending = species.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    // A point sprite is never back-face culled; neither is its quad.
    this.material.side = THREE.DoubleSide;
    // The haze is in the graph (uVisibility), as it was: no scene fog on top.
    this.material.fog = false;

    this.points = new THREE.Mesh(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    // Drawn in the water pipeline's post-water pass, like rain: on layer 0
    // the water surface, rendered later over the finished frame, painted
    // over every particle in front of it — which is every midge and every
    // dragonfly, since they live over open water. The camera has to have
    // the layer enabled (AmbientAir does that), so a scene with no water
    // pipeline still draws them in its ordinary render.
    this.points.layers.set(PRECIP_LAYER);
    this.points.name = `air:${species.id}`;
    this.points.visible = false;
  }

  /** Bind (or clear) the compiled water surface this swarm hovers over. Only
   * a species with a hover height reads it; the others keep the ground. */
  setWater(water: AirWaterSurface | null): void {
    const u = this.uniforms;
    // The habitat (16f) binds for EVERY species that declares weights; the
    // surface floor only for the hover species, as before.
    const habitat = water !== null && this.species.habitat !== undefined && water.habitat !== undefined;
    const hover = water !== null && this.species.hoverAboveWaterM !== undefined;
    const waterTex = hover || habitat ? water!.texture : this.blank;
    if (u.uAirWaterTex.value !== waterTex) u.uAirWaterTex.value = waterTex;
    const habTex = habitat ? water!.habitat! : this.blank;
    if (u.uAirHabitat.value !== habTex) u.uAirHabitat.value = habTex;
    u.uAirHabitatW.value.w = habitat ? 1 : 0;
    if (habitat) {
      const width = (water!.habitat!.image as { width?: number } | undefined)?.width ?? water!.size;
      u.uAirHabitatScale.value.set(width / water!.size, width);
    }
    if (hover || habitat) {
      u.uAirWaterInfo.value.set(water!.size, water!.metresPerPixel, water!.minM, water!.spanM);
    }
    // the surface floor and the standing-water gate are the HOVER species'
    // (16c); a ground species that binds the raster for its habitat keeps
    // the ground as its floor and is never gated to open water
    if (hover) {
      u.uAirWaterDepth.value.set(water!.depthMinM, water!.depthSpanM, water!.buriedM, 1);
      u.uAirHover.value.z = water!.liftM();
    } else {
      u.uAirWaterDepth.value.w = 0;
    }
  }

  /**
   * @param amount 0..1 — how present this species is now. 0 removes the draw
   *   call entirely rather than drawing nothing.
   * @param light scene-linear radiance for a LIT particle; ignored if emissive.
   * @param exposure renderer exposure target, anchoring emissive species.
   * @param visibilityM scene visibility, so these fade into the haze at the
   *   same rate as everything else.
   */
  update(
    amount: number,
    camera: THREE.Camera,
    timeS: number,
    pixelRatio: number,
    sunDir: THREE.Vector3,
    windXZ: [number, number],
    windSpeed: number,
    light: { x: number; y: number; z: number },
    exposure: number,
    visibilityM: number,
  ): void {
    const u = this.uniforms;
    const on = amount > 0.002;
    this.points.visible = on;
    if (!on) return;
    const sp = this.species;
    u.uAmount.value = Math.min(1, amount);
    u.uCam.value.copy(camera.position);
    u.uTime.value = timeS;
    u.uPixelRatio.value = pixelRatio;
    u.uSunDir.value.copy(sunDir);
    u.uVisibility.value = visibilityM;
    // Band centre as an offset from the camera: down to the band's top, then
    // half its depth further. `aboveGroundM` is not used for placement — the
    // terrain's own depth buffer bounds the band from below.
    u.uYOffset.value = -(sp.topBelowCameraM + sp.depthM / 2);

    // THE COLOUR STEP THAT MATTERS. Both branches produce SCENE-LINEAR
    // RADIANCE, never a display colour — the renderer then runs its own tone
    // map and output encode over it, exactly as for a built-in material.
    if (sp.emissive) {
      const k = sp.emissiveScreen / Math.max(exposure, 1e-6);
      u.uCore.value.setRGB(sp.core[0] * k, sp.core[1] * k, sp.core[2] * k);
      const hk = k * 0.55;
      u.uHalo.value.setRGB(sp.halo[0] * hk, sp.halo[1] * hk, sp.halo[2] * hk);
    } else {
      // Lit by the real sky and sun. Never clamp this to display white:
      // daylight exposure is ~1e-5, so clamping turns a white mote into
      // soot — the lesson already recorded in waterParticleLighting.
      u.uCore.value.setRGB(
        light.x * sp.albedo[0] * sp.core[0],
        light.y * sp.albedo[1] * sp.core[1],
        light.z * sp.albedo[2] * sp.core[2],
      );
      u.uHalo.value.setRGB(
        light.x * sp.albedo[0] * sp.halo[0],
        light.y * sp.albedo[1] * sp.halo[1],
        light.z * sp.albedo[2] * sp.halo[2],
      );
    }

    const f = sp.windFollow * windSpeed;
    u.uDrift.value.set(
      sp.drift[0] + windXZ[0] * f,
      sp.drift[1],
      sp.drift[2] + windXZ[1] * f,
    );
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.blank.dispose();
  }
}

/**
 * The province's air, as species (owner 2026-09-10).
 *
 * Black Marsh is hot, wet, still and forested, so the tuning leans on what
 * that climate actually produces: fireflies and midges over standing water at
 * dusk, spore and pollen drift under a closed canopy by day. Counts are
 * deliberately modest — additive blending has no early-Z, so overlapping
 * swarms cost fill rate, and the visible difference between 600 and 2000
 * fireflies is much smaller than the cost difference.
 */
export const AIR_SPECIES: Record<string, AirSpecies> = {
  /** Dusk and night over wet ground. The signature of a warm marsh. */
  fireflies: {
    id: "fireflies",
    habitat: [0, 1, 1],
    // Density is deliberately modest. Measured: the blink envelope has a 25%
    // duty cycle, so 420 in this box puts roughly 19 lit in view at once —
    // enough to read as a swarm without returning to the "cloud of flashing
    // dots" the first version was. Adding more insects is the wrong lever if
    // they seem faint; make each one glow more (sizePx/halo) instead.
    // Owner round 3: fewer than the 480 that read as slightly too many at
    // once. Patchiness below takes the AVERAGE to about 0.65 of this, so the
    // densest pocket now sits a little under the old uniform field and the
    // typical stretch well under it.
    count: 400,
    // A shallow slab, not a tall box: fireflies work the reeds and the wet
    // ground, and the owner asked for them never much above head height. The
    // band's top sits 1.2 m under the eye and runs 6 m down, so on flat ground
    // and on a slope alike the visible part is "ground up to below eye level".
    box: [30, 0, 30],
    topBelowCameraM: 1.2,
    depthM: 6.0,
    // Generous, because the glow is the point: a bigger sprite spends its
    // extra pixels on the soft halo, not on a bigger hard dot.
    sizePx: 22,
    emissive: true,
    emissiveScreen: 0.95,
    // Hot near-white core inside a yellow-green glow — two colours, which is
    // most of what reads as "glowing" instead of "a coloured dot".
    core: [1.0, 0.98, 0.72],
    halo: [0.72, 1.0, 0.3],
    albedo: [1, 1, 1],
    opacity: 1.0,
    additive: true,
    wander: [0.7, 0.4, 0.7],
    wanderHz: 0.22,
    drift: [0, 0.02, 0],
    windFollow: 0.05,
    // Slow. A real Photinus flashes every 3-13 s, which reads as a dead
    // scene; the first version's 0.9-2.2 s read as a strobe. This, with the
    // asymmetric envelope and long dark gap, is the breathing cadence.
    blink: [2.6, 4.8],
    // Modest now that the world patches below supply the unevenness. Two
    // clustering mechanisms stacked (tight knots INSIDE rare patches) put
    // the whole swarm in one far-off clump — measured at 7 of 580 screen
    // columns occupied. The patches choose WHERE; the knots only loosen the
    // spacing within one.
    clusterRadius: 2.5,
    // In third person the character stands a few metres ahead of the eye; a
    // firefly nearer than that hangs in the gap and reads as being on the
    // lens rather than out in the marsh. Kept just past the character so the
    // near ones — the big, bright, readable ones — are not all lost.
    nearClipM: 3.2,
    // Pockets a few tens of metres across, so walking takes you through
    // dense patches and near-empty ground instead of one uniform cloud.
    patchM: 34,
    backlight: 0,
  },

  /** Daytime spore and pollen drift under canopy. Catches the sun. */
  pollen: {
    id: "pollen",
    habitat: [0, 0, 1],
    count: 500,
    // a column of lit air around the player
    box: [20, 0, 20],
    topBelowCameraM: -1.2,
    depthM: 7.0,
    sizePx: 9,
    emissive: false,
    emissiveScreen: 0,
    core: [1.0, 0.97, 0.86],
    halo: [1.0, 0.94, 0.78],
    albedo: [0.9, 0.86, 0.7],
    opacity: 0.5,
    additive: false,
    wander: [0.5, 0.35, 0.5],
    wanderHz: 0.13,
    drift: [0, -0.035, 0],
    windFollow: 0.5,
    blink: [0, 0],
    clusterRadius: 0,
    nearClipM: 1.6,
    patchM: 70,
    // Strong, but not so strong that pollen only exists when you face the
    // sun — at 9 it read as absent everywhere else. It still flares hard
    // toward the beam; it just keeps a whisper of presence away from it.
    backlight: 6,
  },

  /** Midge knots over water at dawn and dusk. Tight, fast, unlit. */
  midges: {
    id: "midges",
    habitat: [1, 0.4, 0],
    count: 520,
    // low knots over the water
    box: [24, 0, 24],
    topBelowCameraM: 1.4,
    depthM: 5.0,
    // Owner 2026-09-11: at 5 px and mid-grey they changed nothing on screen.
    // A midge column reads as DARK specks against bright water and sky, so
    // the body is near-black and the sprite big enough to survive the near
    // fade; backlight still rims them when they sit between eye and sun.
    sizePx: 9,
    emissive: false,
    emissiveScreen: 0,
    core: [1.0, 1.0, 1.0],
    halo: [0.6, 0.6, 0.6],
    albedo: [0.06, 0.055, 0.05],
    opacity: 0.95,
    additive: false,
    wander: [0.35, 0.3, 0.35],
    wanderHz: 1.5,
    drift: [0, 0, 0],
    windFollow: 0.15,
    blink: [0, 0],
    // Tight knots — a midge column is a clump, not a haze.
    clusterRadius: 1.1,
    nearClipM: 3.5,
    // Knots every few tens of metres of water, most of it empty (the high
    // patch band, airPatchBand): a column here, none there.
    patchM: 44,
    backlight: 10,
    // over water the column hovers a hand above the surface (16c)
    hoverAboveWaterM: 0.3,
    hoverBandM: 1.5,
  },

  /**
   * Dragonflies over standing water in the heat of the day — as iconic for a
   * warm marsh as the fireflies are for its night, and mechanically the same
   * thing on a different clock. Specks of colour at speck scale, not
   * modelled insects: a dragonfly you could look at is a sourcing job.
   */
  dragonflies: {
    id: "dragonflies",
    habitat: [1, 0, 0],
    count: 180,
    // hunting height over open water
    box: [22, 0, 22],
    topBelowCameraM: 1.0,
    depthM: 5.0,
    // Owner 2026-09-11: at 7 px they changed 13 pixels of a daylight frame.
    // Bigger, brighter than the water they hunt over, and a hard wing glint
    // toward the sun.
    sizePx: 14,
    emissive: false,
    emissiveScreen: 0,
    core: [0.9, 1.0, 0.95],
    halo: [0.55, 0.9, 0.9],
    albedo: [1.2, 1.5, 1.4],
    opacity: 1.0,
    additive: false,
    wander: [1.6, 0.5, 1.6],
    wanderHz: 2.4,
    drift: [0, 0, 0],
    windFollow: 0.1,
    blink: [0, 0],
    clusterRadius: 6,
    // Owner: dragonflies should never pop up between the camera and the
    // player — you meet them by walking into where they are hunting. Held
    // well beyond the character, so a knot is something you approach.
    nearClipM: 9.0,
    patchM: 48,
    backlight: 9,
    // hunting height: half a metre over the water, up to two above it
    hoverAboveWaterM: 0.5,
    hoverBandM: 1.5,
  },

  /** Leaf fall under the canopy. Slow, heavy, wind-carried. */
  leaves: {
    id: "leaves",
    habitat: [0, 0, 1],
    count: 110,
    // from the canopy down to the floor
    box: [18, 0, 18],
    topBelowCameraM: -4.0,
    depthM: 12.0,
    sizePx: 12,
    emissive: false,
    emissiveScreen: 0,
    core: [0.8, 0.66, 0.32],
    halo: [0.58, 0.46, 0.24],
    albedo: [0.62, 0.52, 0.26],
    opacity: 0.8,
    additive: false,
    wander: [1.3, 0.5, 1.3],
    wanderHz: 0.45,
    drift: [0, -0.5, 0],
    windFollow: 0.8,
    blink: [0, 0],
    clusterRadius: 0,
    nearClipM: 2.5,
    patchM: 55,
    backlight: 2,
  },
};

/** Deterministic 32-bit hash → [0,1) stream. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s >>> 12)) >>> 0;
    s = (Math.imul(s ^ (s >>> 7), 0x297a2d39) ^ (s >>> 15)) >>> 0;
    return s / 4294967296;
  };
}

/** Inputs the presence rules read. All already computed by the sky/weather. */
export interface AirConditions {
  /** Sun altitude, degrees. */
  sunAltDeg: number;
  /** Local relative humidity 0..1 — the marsh/upland axis. */
  humidity: number;
  /** Rain 0..1. */
  rain: number;
  /** Total cloud cover 0..1. */
  cloud: number;
  /** Wind speed m/s — a stiff breeze disperses a swarm. */
  windSpeed: number;
  /** Camera height ABOVE THE GROUND, metres — not above sea level. The
   * distinction was a real defect: gating on absolute altitude switched the
   * whole layer off at a marsh that happens to sit 203 m up, in a province
   * whose terrain reaches 651 m. What matters is whether the eye is down
   * among the vegetation or up above the canopy. */
  aboveGroundM: number;
}

/**
 * How present each species is, given the hour and the weather.
 *
 * These are the rules the owner asked to be "derived logically" rather than
 * placed by hand, and each one is a statement about the animal or the
 * particle, not a look:
 *
 *  - Fireflies fly at dusk and through the night, over WET ground, and are
 *    grounded by rain and by wind. They do not fly by day.
 *  - Midges swarm at dawn and dusk specifically — not midday, not midnight —
 *    over water, and a breeze scatters them.
 *  - Pollen and spores need daylight to be seen at all (they are lit, not
 *    luminous), and rain washes them out of the air within minutes.
 *  - Leaf fall wants canopy and wind, and is not a night-time effect only
 *    because nobody can see it at night.
 *
 * Everything also fades out with altitude: none of this happens above the
 * canopy, and in fly-over mode the camera is far too high for any of it.
 */
export function airAmounts(c: AirConditions): Record<string, number> {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const band = (v: number, lo: number, hi: number) =>
    clamp01(Math.min((v - lo) / Math.max(1e-6, hi - lo), 1));

  // Above the canopy none of this exists — measured from the GROUND.
  const low = 1 - band(c.aboveGroundM, 25, 70);
  // Rain grounds insects and washes spores out of the air, and it does not
  // take a downpour. Local rain intensity rarely reaches 1 even under forced
  // rain, so a plain (1 - rain) left them flying through a shower.
  const dry = 1 - band(c.rain, 0.02, 0.25);
  const calm = 1 - band(c.windSpeed, 4, 11);
  // Wet ground: the marsh, not the uplands.
  const wet = band(c.humidity, 0.45, 0.8);

  // Night, with the shoulder starting before the sun is fully down.
  const night = 1 - band(c.sunAltDeg, -7, 1);
  // Dawn/dusk only: a bell on the horizon, not a step.
  const twilight = Math.exp(-Math.pow((c.sunAltDeg + 1) / 5.0, 2));
  const day = band(c.sunAltDeg, 1, 12);
  // Direct sun — pollen needs a beam to be seen in, so overcast kills it.
  const sunny = day * (1 - band(c.cloud, 0.35, 0.8));

  // Dragonflies want the middle of a warm day, not its edges — the opposite
  // clock to the midges they share the water with.
  const highDay = band(c.sunAltDeg, 12, 30);

  return {
    fireflies: low * night * wet * dry * calm,
    midges: low * twilight * wet * dry * calm * 0.85,
    dragonflies: low * highDay * wet * dry * calm * 0.8,
    pollen: low * sunny * dry * (0.35 + 0.65 * band(c.humidity, 0.3, 0.7)),
    leaves: low * day * dry * band(c.windSpeed, 1.5, 7) * 0.7,
  };
}
