import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
  Discard, Fn, If, abs, dot, float, length, normalize, positionWorld, pow, smoothstep, uniform, uv, vec4,
} from "three/tsl";
import type { TslNode } from "../render/nodes/materialNodes";
import { PRECIP_LAYER } from "../water/render/waterMaterial";

/**
 * Sun shafts under the canopy (module 55 polish tier, owner 2026-09-10).
 *
 * WHY THIS AND NOT SCREEN-SPACE GOD RAYS. The three usual approaches all cost
 * more than this is worth here:
 *  - a radial-blur postprocess (GPU Gems 3 ch.13, `GodRaysEffect`) needs an
 *    occlusion buffer and a full-screen multi-tap pass, and this app mounts no
 *    postprocessing pipeline at all — adding one for a polish effect would
 *    make every other renderer change go through it;
 *  - shadow-volume shaft geometry needs the canopy's real silhouette, which
 *    procedural wind-animated foliage does not have;
 *  - raymarched volumetrics need per-instance shadow maps we do not bake.
 *
 * So: additive cone billboards, spawned near the camera, aligned to the sun.
 * No render-target, no pass, no change to the render graph, and the whole
 * thing switches off by passing zero. The cost of that choice is that the
 * shafts are decorative — they are not cast by any particular tree — which is
 * why placement is stochastic and stable per cell rather than pretending to
 * find real canopy gaps.
 *
 * The tell that gives fake shafts away is the flat-card look when you circle
 * one. Two things fix it here: an open tapered cone rather than a quad, so it
 * has actual cross-section from every side, and a view-angle fade that drops
 * the shaft as the eye approaches its axis.
 */

/**
 * The shaft's node material: the cone's own vertex stage (the InstancedMesh
 * applies each shaft's matrix), and a fragment that fades the shaft across
 * its width, at both ends, edge-on and near the lens.
 */
function buildShaftMaterial(u: SunShaftUniforms): NodeMaterial {
  const vUv: TslNode = uv();
  const vWorld: TslNode = positionWorld;
  const material = new NodeMaterial();
  material.fragmentNode = Fn(() => {
    // Soft across the shaft's width. uv.x runs around the tube, so this is a
    // fade around its circumference — the near and far walls both peak at the
    // middle, which is where the eye looks through the most air.
    const r: TslNode = abs(vUv.x.sub(0.5)).mul(2.0);
    const radial: TslNode = pow(float(1.0).sub(smoothstep(0.0, 1.0, r)), 1.2);

    // Fade at both ends: no hard rim where the cone starts or stops.
    const lenFade: TslNode = smoothstep(0.0, 0.18, vUv.y).mul(float(1.0).sub(smoothstep(0.6, 1.0, vUv.y)));

    // Edge-on fade. Looking ALONG the shaft is exactly the angle at which a
    // billboard betrays itself as a surface, so drop it there. Looking across
    // the shaft is where a real light shaft is most visible anyway.
    const view: TslNode = normalize(vWorld.sub(u.uCam));
    const along: TslNode = abs(dot(view, u.uAxis));
    // Only the last few degrees, not a broad band. At 0.72 this removed the
    // shaft for any camera looking DOWN at one that also points down — which
    // is the default third-person view.
    const edgeOn: TslNode = float(1.0).sub(smoothstep(0.93, 0.995, along));

    // Never let a shaft sit on the lens: fade any the camera is inside or
    // nearly inside. Kept tight — the ring is only ~26 m wide.
    const nearFade: TslNode = smoothstep(0.8, 3.5, length(vWorld.sub(u.uCam)));

    const a: TslNode = radial.mul(lenFade).mul(edgeOn).mul(nearFade).mul(u.uIntensity);
    If(a.lessThanEqual(0.002), () => {
      Discard();
    });
    // uColour is SCENE-LINEAR RADIANCE, anchored against exposure on the CPU;
    // the renderer applies its tone map and output encode (toneMapped on).
    return vec4(u.uColour, a);
  })();
  return material;
}

/** The shafts' uniforms: `uniform()` nodes written through `.value`. */
export interface SunShaftUniforms {
  uColour: { value: THREE.Color } & TslNode;
  uIntensity: { value: number } & TslNode;
  uCam: { value: THREE.Vector3 } & TslNode;
  /** World-space shaft axis (every shaft shares the sun's rotation): the
   * direction the light travels, -sunDir. */
  uAxis: { value: THREE.Vector3 } & TslNode;
}

/** Screen brightness of a shaft at full strength. */
const SHAFT_SCREEN = 0.30;

export interface SunShaftConfig {
  /** How many shafts may exist at once. 20-40 is affordable; each is a few
   * hundred triangles and they batch into one instanced draw. */
  count: number;
  /** Shaft length, metres. */
  length: [number, number];
  /** Radius at the wide (lower) end, metres. */
  radius: [number, number];
  /** Radius of the ring around the camera they are scattered in. */
  spread: number;
}

export const SUN_SHAFT_DEFAULTS: SunShaftConfig = {
  count: 28,
  length: [9, 22],
  radius: [0.7, 2.2],
  spread: 26,
};

/**
 * A ring of light shafts that follows the camera.
 *
 * Positions are re-scattered lazily — only when the camera has moved far
 * enough that the ring would otherwise be left behind — and each shaft
 * cross-fades rather than popping.
 */
export class SunShafts {
  readonly mesh: THREE.InstancedMesh;
  readonly material: NodeMaterial;
  readonly uniforms: SunShaftUniforms;
  private readonly geometry: THREE.BufferGeometry;
  private readonly offsets: THREE.Vector3[] = [];
  private readonly anchor = new THREE.Vector3(NaN, NaN, NaN);
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly scale = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly sizes: { len: number; rad: number }[] = [];

  constructor(
    readonly config: SunShaftConfig = SUN_SHAFT_DEFAULTS,
    rand: () => number = Math.random,
  ) {
    // Open tapered cone: no caps (a capped cone shows a visible disc when you
    // pass under it), narrow at the top where the light enters the canopy.
    this.geometry = new THREE.CylinderGeometry(0.28, 1.0, 1.0, 9, 1, true);
    // Built centred on the origin; shift so the cone hangs DOWN from its
    // pivot, which is the canopy opening.
    this.geometry.translate(0, -0.5, 0);

    this.uniforms = {
      uColour: uniform(new THREE.Color(1.0, 0.93, 0.74)),
      uIntensity: uniform(0),
      uCam: uniform(new THREE.Vector3()),
      uAxis: uniform(new THREE.Vector3(0, -1, 0)),
    };
    this.material = buildShaftMaterial(this.uniforms);
    this.material.name = "air:sun-shafts";
    this.material.transparent = true;
    this.material.depthWrite = false;
    this.material.depthTest = true;
    this.material.blending = THREE.AdditiveBlending;
    this.material.side = THREE.DoubleSide;
    this.material.fog = false;

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, config.count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    // Same post-water layer as the swarms (see AirSwarm): a shaft over water
    // was otherwise painted out by the surface.
    this.mesh.layers.set(PRECIP_LAYER);
    this.mesh.name = "air:sun-shafts";
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < config.count; i++) {
      const a = rand() * Math.PI * 2;
      const r = config.spread * Math.sqrt(rand());
      // Horizontal placement only. The HEIGHT is derived per frame from the
      // sun's altitude (see update): a fixed height floats the shaft.
      this.offsets.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      this.sizes.push({
        len: config.length[0] + rand() * (config.length[1] - config.length[0]),
        rad: config.radius[0] + rand() * (config.radius[1] - config.radius[0]),
      });
    }
  }

  /**
   * @param intensity 0..1 — derived by the caller from sun altitude, weather
   *   clearness and how much canopy is overhead. Zero removes the draw call.
   * @param sunDir unit vector TOWARD the sun.
   */
  update(
    intensity: number,
    camera: THREE.Camera,
    sunDir: THREE.Vector3,
    colour: THREE.Color,
    exposure: number,
  ): void {
    const on = intensity > 0.004;
    this.mesh.visible = on;
    if (!on) return;

    const u = this.uniforms;
    u.uIntensity.value = intensity;
    u.uCam.value.copy(camera.position);
    // Exposure-anchored radiance. THE BUG THAT MADE THESE INVISIBLE was
    // multiplying BY exposure at the call site: exposureTarget is a PHYSICAL
    // exposure (~2e-4 in daylight), so the shafts were scaled down about
    // 5000x exactly when they were supposed to show.
    const k = SHAFT_SCREEN / Math.max(exposure, 1e-6);
    u.uColour.value.setRGB(
      colour.r * k,
      colour.g * k,
      colour.b * k,
    );

    // Re-anchor only when the camera has left the ring, so shafts stay put in
    // the world while you walk past them (a ring rigidly glued to the camera
    // slides with you and reads as a headlamp, not as sunlight).
    if (!Number.isFinite(this.anchor.x) || this.anchor.distanceTo(camera.position) > this.config.spread * 0.5) {
      this.anchor.copy(camera.position);
    }

    // A shaft points DOWN-sun: the light travels from the sun towards the
    // ground, so the cone hangs along -sunDir from its opening.
    const axis = this.pos.copy(sunDir).multiplyScalar(-1).normalize();
    this.q.setFromUnitVectors(this.up, axis);
    // The cone's +Y after that rotation, in world space (the fragment's
    // edge-on fade reads it; every shaft shares it).
    u.uAxis.value.copy(axis);

    // Height so the shaft ENDS near the ground instead of hanging in the air.
    // A shaft leaves the canopy and travels down-sun; over its own length it
    // descends by len * sin(altitude), so that is exactly how high its
    // opening has to be. With a fixed height the low-morning sun — which is
    // when shafts are wanted most — left them as near-horizontal tubes 6-15 m
    // overhead, out of frame for anyone not looking up.
    const sinAlt = Math.max(sunDir.y, 0.05);
    for (let i = 0; i < this.offsets.length; i++) {
      const o = this.offsets[i];
      const s = this.sizes[i];
      this.pos.copy(this.anchor).add(o);
      // Land the far end around eye level, and never start below the eye.
      this.pos.y += Math.min(s.len * sinAlt, 14) + 1.2;
      this.scale.set(s.rad, s.len, s.rad);
      this.m4.compose(this.pos, this.q, this.scale);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/**
 * How strong the shafts should be right now.
 *
 * Shafts want RAKING light: the sun high enough to get through the canopy but
 * not overhead, where there is nothing to silhouette against. They also want
 * a clear sky — under overcast there is no beam to be scattered — and they
 * want canopy, since a shaft with nothing casting it is just a cone of fog.
 * All three multiply, so any one of them being absent removes the effect
 * rather than leaving a weak version of it.
 */
export function sunShaftIntensity(input: {
  sunAltDeg: number;
  /** Total cloud cover 0..1. */
  cloud: number;
  /** Rain 0..1. */
  rain: number;
  /** Canopy overhead 0..1 — the caller's vegetation density. */
  canopy: number;
  /** Air humidity 0..1: damp air scatters more, so shafts read stronger in
   * the marsh than on a dry ridge. */
  humidity: number;
  /** Camera height ABOVE THE GROUND, metres (not above sea level). */
  aboveGroundM: number;
}): number {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const band = (v: number, lo: number, hi: number) => clamp01((v - lo) / Math.max(1e-6, hi - lo));

  // Low enough to rake, high enough to reach the ground: a band, not a ramp.
  const raking = band(input.sunAltDeg, 4, 16) * (1 - band(input.sunAltDeg, 48, 72));
  const clear = 1 - band(input.cloud, 0.3, 0.75);
  const dry = 1 - band(input.rain, 0.02, 0.25);
  const under = band(input.canopy, 0.25, 0.7);
  const damp = 0.45 + 0.55 * clamp01(input.humidity);
  const low = 1 - band(input.aboveGroundM, 30, 80);
  return raking * clear * dry * under * damp * low;
}
