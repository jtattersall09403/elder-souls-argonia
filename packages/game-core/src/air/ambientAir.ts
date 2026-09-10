import * as THREE from "three";

/**
 * Ambient air particles — fireflies, pollen, motes, midges (module 55 polish
 * tier, owner 2026-09-10).
 *
 * One mechanism, several species. Every species is a single `THREE.Points`
 * draw whose whole motion is computed in the vertex shader from static
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
  /** Half-extents of the wrap box (x, y, z). Wider than tall, always: these
   * are things drifting through a layer of air, not filling a cube. */
  box: [number, number, number];
  /** Vertical offset of the box centre from the camera. Negative puts the
   * layer below eye level, which is where fireflies and ground mist sit. */
  yOffset: number;
  /** Base sprite size in pixels at 1 m. Kept well under the 64 px that some
   * drivers clamp `gl_PointSize` to. */
  sizePx: number;
  colour: [number, number, number];
  /** Peak opacity before `amount` scales it. */
  opacity: number;
  /** Additive reads as "emitting" (fireflies, embers); normal reads as
   * "catching the light" (pollen, dust). Getting this backwards is what
   * makes pollen look like sparks. */
  additive: boolean;
  /** Wander amplitude per axis. */
  wander: [number, number, number];
  /** Wander base frequency (Hz-ish). */
  wanderHz: number;
  /** Constant drift, m/s — pollen sinks, embers rise. Wind is added on top. */
  drift: [number, number, number];
  /** How much of the ambient wind this species is carried by, 0..1. */
  windFollow: number;
  /** Blink period range [min, max] seconds; [0, 0] means no blink. */
  blink: [number, number];
  /** Fraction of the blink period spent lit. */
  blinkDuty: number;
  /** Clump radius. 0 scatters uniformly; >0 gathers particles into knots,
   * which is what stops a swarm reading as even fog. */
  clusterRadius: number;
  /** Brightness gain when looking towards the sun — Mie forward scatter, and
   * the whole reason pollen reads as "caught in a sunbeam". 0 disables. */
  backlight: number;
}

const VERTEX = /* glsl */ `
attribute vec3 aBase;
attribute vec3 aSeed;
attribute float aPhase;
attribute float aPeriod;
attribute float aScale;

uniform vec3 uCam;
uniform float uTime;
uniform vec3 uBox;
uniform float uYOffset;
uniform float uSizePx;
uniform float uPixelRatio;
uniform vec3 uWander;
uniform float uWanderHz;
uniform vec3 uDrift;
uniform float uBlinkDuty;
uniform float uClusterR;
uniform float uAmount;
uniform vec3 uSunDir;
uniform float uBacklight;

varying float vAlpha;

void main() {
  float t = uTime;

  // Cluster knot, then the particle's own offset inside it. Wrapping is done
  // on the KNOT so a clump stays a clump as it crosses the box seam.
  vec3 knot = aBase;
  vec3 inner = (aSeed - 0.5) * 2.0 * uClusterR;

  // Wander: a few low-frequency sines per axis, phase-shifted per particle.
  // Cheaper than noise and reads as organic at these amplitudes.
  vec3 w;
  w.x = sin(t * uWanderHz * (0.6 + aSeed.x) + aSeed.x * 6.283);
  w.y = sin(t * uWanderHz * (1.0 + aSeed.y) + aSeed.y * 6.283) * 0.6
      + sin(t * uWanderHz * 2.3 + aSeed.z * 6.283) * 0.2;
  w.z = cos(t * uWanderHz * (0.7 + aSeed.z) + aSeed.z * 6.283);

  vec3 pos = knot + inner + w * uWander + uDrift * t;

  // Camera-anchored wrap. Offset the box centre vertically so a layer can sit
  // below eye level without the wrap pushing it back through the camera.
  vec3 centre = uCam + vec3(0.0, uYOffset, 0.0);
  vec3 rel = pos - centre;
  vec3 span = uBox * 2.0;
  rel = mod(rel + uBox, span) - uBox;
  vec3 world = centre + rel;

  // Fade at the box wall so nothing pops into existence at the seam. The
  // horizontal walls are what the player sees; the vertical ones are handled
  // by the same term.
  vec3 edge = 1.0 - smoothstep(vec3(0.62), vec3(1.0), abs(rel) / uBox);
  float fade = edge.x * edge.y * edge.z;

  // Blink. An eased pulse rather than a hard gate, or it strobes.
  float blink = 1.0;
  if (aPeriod > 0.0) {
    float ph = fract(t / aPeriod + aPhase);
    blink = smoothstep(0.0, uBlinkDuty * 0.25, ph)
          * (1.0 - smoothstep(uBlinkDuty * 0.55, uBlinkDuty, ph));
  }

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float dist = max(-mv.z, 0.001);

  // Forward-scatter gain: brightest when the particle sits between the eye
  // and the sun. This is what sells "motes in a shaft of light".
  float back = 1.0;
  if (uBacklight > 0.0) {
    vec3 view = normalize(world - uCam);
    back = 1.0 + uBacklight * pow(max(dot(view, uSunDir), 0.0), 8.0);
  }

  vAlpha = fade * blink * uAmount * back;
  gl_PointSize = uSizePx * aScale * uPixelRatio * (10.0 / dist);
  // A sprite smaller than a pixel does not vanish, it aliases into sparkle.
  // Trade size for opacity below one pixel instead.
  float tiny = min(gl_PointSize, 1.0);
  vAlpha *= tiny * tiny;
  gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
varying float vAlpha;

void main() {
  // Procedural round sprite — no texture, no atlas, no fetch.
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.35, 1.0, d);
  if (a <= 0.001 || vAlpha <= 0.001) discard;
  gl_FragColor = vec4(uColour, a * vAlpha * uOpacity);
}
`;

/** One species' geometry, material and mesh. */
export class AirSwarm {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

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
    const [bx, by, bz] = species.box;
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

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
    this.geometry.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    this.geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.geometry.setAttribute("aPeriod", new THREE.BufferAttribute(period, 1));
    this.geometry.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    // The wrap makes every particle's drawn position independent of its base,
    // so an accurate bounding volume is impossible and a culled swarm would
    // simply vanish. Bound it hugely and let the wrap do the work.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uBox: { value: new THREE.Vector3(bx, by, bz) },
        uYOffset: { value: species.yOffset },
        uSizePx: { value: species.sizePx },
        uPixelRatio: { value: 1 },
        uWander: { value: new THREE.Vector3(...species.wander) },
        uWanderHz: { value: species.wanderHz },
        uDrift: { value: new THREE.Vector3(...species.drift) },
        uBlinkDuty: { value: species.blinkDuty },
        uClusterR: { value: species.clusterRadius },
        uAmount: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uBacklight: { value: species.backlight },
        uColour: { value: new THREE.Color(...species.colour) },
        uOpacity: { value: species.opacity },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      // Never occlude anything: these are specks of light and dust.
      depthWrite: false,
      depthTest: true,
      blending: species.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.name = `air:${species.id}`;
    this.points.visible = false;
  }

  /**
   * @param amount 0..1 — how present this species is right now. 0 makes the
   *   draw call disappear entirely rather than render nothing, which is what
   *   makes the whole system free when it is not wanted.
   */
  update(
    amount: number,
    camera: THREE.Camera,
    timeS: number,
    pixelRatio: number,
    sunDir: THREE.Vector3,
    windXZ: [number, number],
    windSpeed: number,
  ): void {
    const u = this.material.uniforms;
    const on = amount > 0.002;
    this.points.visible = on;
    if (!on) return;
    (u.uAmount as { value: number }).value = Math.min(1, amount);
    (u.uCam.value as THREE.Vector3).copy(camera.position);
    (u.uTime as { value: number }).value = timeS;
    (u.uPixelRatio as { value: number }).value = pixelRatio;
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    const f = this.species.windFollow * windSpeed;
    (u.uDrift.value as THREE.Vector3).set(
      this.species.drift[0] + windXZ[0] * f,
      this.species.drift[1],
      this.species.drift[2] + windXZ[1] * f,
    );
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
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
    count: 700,
    box: [34, 7, 34],
    yOffset: -1.4,
    sizePx: 7,
    // Yellow-green, the colour of the real luciferin reaction.
    colour: [0.78, 1.0, 0.35],
    opacity: 0.95,
    additive: true,
    wander: [0.7, 0.4, 0.7],
    wanderHz: 0.22,
    drift: [0, 0.02, 0],
    windFollow: 0.05,
    // Real fireflies flash every 3-13 s, which reads as a dead scene. Games
    // compress the cadence; this range keeps individual rhythms distinct.
    blink: [0.9, 2.2],
    blinkDuty: 0.34,
    clusterRadius: 4.5,
    backlight: 0,
  },

  /** Daytime spore and pollen drift under canopy. Catches the sun. */
  pollen: {
    id: "pollen",
    count: 550,
    box: [22, 9, 22],
    yOffset: 0.5,
    sizePx: 5,
    colour: [1.0, 0.95, 0.78],
    opacity: 0.3,
    // Normal blending, not additive: pollen is lit, it does not emit.
    additive: false,
    wander: [0.5, 0.35, 0.5],
    wanderHz: 0.13,
    drift: [0, -0.035, 0],
    windFollow: 0.5,
    blink: [0, 0],
    blinkDuty: 0,
    clusterRadius: 0,
    backlight: 5,
  },

  /** Midge knots over water at dawn and dusk. Tight, fast, unlit. */
  midges: {
    id: "midges",
    count: 600,
    box: [26, 4, 26],
    yOffset: -0.8,
    sizePx: 3,
    colour: [0.2, 0.19, 0.16],
    opacity: 0.5,
    additive: false,
    wander: [0.35, 0.3, 0.35],
    wanderHz: 1.5,
    drift: [0, 0, 0],
    windFollow: 0.15,
    blink: [0, 0],
    blinkDuty: 0,
    // Very tight knots — a midge column is a clump, not a haze.
    clusterRadius: 1.1,
    backlight: 0,
  },

  /** Leaf fall under the canopy. Slow, heavy, wind-carried. */
  leaves: {
    id: "leaves",
    count: 130,
    box: [20, 11, 20],
    yOffset: 2.0,
    sizePx: 9,
    colour: [0.52, 0.44, 0.2],
    opacity: 0.55,
    additive: false,
    wander: [1.3, 0.5, 1.3],
    wanderHz: 0.45,
    drift: [0, -0.5, 0],
    windFollow: 0.8,
    blink: [0, 0],
    blinkDuty: 0,
    clusterRadius: 0,
    backlight: 1.5,
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
  /** Camera height above sea level, metres. */
  cameraY: number;
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

  // Above the canopy none of this exists; by 140 m it is gone entirely.
  const low = 1 - band(c.cameraY, 60, 140);
  const dry = 1 - c.rain;
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

  return {
    fireflies: low * night * wet * dry * calm,
    midges: low * twilight * wet * dry * calm * 0.85,
    pollen: low * sunny * dry * (0.35 + 0.65 * band(c.humidity, 0.3, 0.7)),
    leaves: low * day * dry * band(c.windSpeed, 1.5, 7) * 0.7,
  };
}
