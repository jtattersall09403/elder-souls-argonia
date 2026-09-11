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
  /** Half-extents of the wrap box (x, y, z). Wider than tall, always. */
  box: [number, number, number];
  /** Vertical offset of the box centre from the camera. */
  yOffset: number;
  /** Sprite size in pixels at 10 m. Big enough that the halo has pixels to
   * be soft in — a 3 px sprite can only ever be a dot. Clamped to 48 in the
   * shader, under the 64 some drivers impose on gl_PointSize. */
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
   * SHAPE lives in the vertex shader; this is only its rate. */
  blink: [number, number];
  /** Clump radius. 0 scatters uniformly; >0 gathers particles into knots,
   * which is what stops a swarm reading as even fog. */
  clusterRadius: number;
  /** Extra brightness between eye and sun — Mie forward scatter. For dust
   * and pollen this is most of their visibility, and it is what makes them
   * show in a shaft of light and near-vanish elsewhere. */
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
uniform float uClusterR;
uniform float uAmount;
uniform vec3 uSunDir;
uniform float uBacklight;
uniform float uVisibility;

varying float vAlpha;
varying float vBacklit;

void main() {
  float t = uTime;
  vec3 inner = (aSeed - 0.5) * 2.0 * uClusterR;

  vec3 w;
  w.x = sin(t * uWanderHz * (0.6 + aSeed.x) + aSeed.x * 6.283);
  w.y = sin(t * uWanderHz * (1.0 + aSeed.y) + aSeed.y * 6.283) * 0.6
      + sin(t * uWanderHz * 2.3 + aSeed.z * 6.283) * 0.2;
  w.z = cos(t * uWanderHz * (0.7 + aSeed.z) + aSeed.z * 6.283);

  vec3 pos = aBase + inner + w * uWander + uDrift * t;

  vec3 centre = uCam + vec3(0.0, uYOffset, 0.0);
  vec3 rel = pos - centre;
  rel = mod(rel + uBox, uBox * 2.0) - uBox;
  vec3 world = centre + rel;

  vec3 edge = 1.0 - smoothstep(vec3(0.62), vec3(1.0), abs(rel) / uBox);
  float fade = edge.x * edge.y * edge.z;

  // BLINK ENVELOPE. A fast symmetric pulse reads as a strobe, which is what
  // the first version did. A firefly is a slow rise, a brief peak, a slower
  // decay, then a DARK GAP longer than the lit part — and the period varies
  // per insect so a swarm never falls into unison.
  float blink = 1.0;
  if (aPeriod > 0.0) {
    float ph = fract(t / aPeriod + aPhase);
    blink = smoothstep(0.0, 0.16, ph) * (1.0 - smoothstep(0.16, 0.60, ph));
    blink = pow(blink, 1.5);
  }

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float dist = max(-mv.z, 0.001);

  // Forward scatter: brightest between eye and sun. For the lit species this
  // is most of their visibility, and it is what makes a mote read as caught
  // in a beam rather than as confetti.
  vBacklit = 0.0;
  if (uBacklight > 0.0) {
    vBacklit = pow(max(dot(normalize(world - uCam), uSunDir), 0.0), 8.0);
  }

  // Aerial haze on the scene's own visibility distance, so these sit IN the
  // air and fade with everything else; plus a near fade so a sprite never
  // balloons across the screen as the camera passes through the field.
  float haze = exp(-dist / max(uVisibility, 1.0));
  float near = smoothstep(0.35, 2.0, dist);

  vAlpha = fade * blink * uAmount * haze * near;
  gl_PointSize = uSizePx * aScale * uPixelRatio * (10.0 / dist);
  float tiny = min(gl_PointSize, 1.0);
  vAlpha *= tiny * tiny;
  gl_PointSize = clamp(gl_PointSize, 1.0, 48.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uHalo;
uniform float uOpacity;
uniform float uBacklitGain;
varying float vAlpha;
varying float vBacklit;

void main() {
  // Small bright core inside a wide soft halo, in two different colours. A
  // single flat disc is what reads as "dot"; the two-term falloff with a
  // hotter core is what reads as "glowing".
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(0.34, 0.0, d);
  float halo = smoothstep(1.0, 0.06, d);
  // The halo carries most of the visible area; the core is only the hot
  // centre. Weighting it too low leaves a small hard dot with nothing
  // around it, which is the "flat dot" read.
  float a = core + halo * 0.60;
  if (a <= 0.002 || vAlpha <= 0.002) discard;

  // uCore/uHalo arrive as SCENE-LINEAR RADIANCE, never display colours: the
  // lit species from the same sky/sun feeds the water spray uses, the
  // emissive ones anchored against exposure. The two chunks at the end are
  // the renderer's own tone map and output encode, which a ShaderMaterial
  // does NOT get for free the way a built-in material does. Authoring in
  // display terms and omitting them is what made every one of these render
  // as a flat charcoal dot.
  vec3 col = mix(uHalo, uCore, core);
  col *= 1.0 + uBacklitGain * vBacklit;

  gl_FragColor = vec4(col, a * vAlpha * uOpacity);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
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
        uClusterR: { value: species.clusterRadius },
        uAmount: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uBacklight: { value: species.backlight },
        uBacklitGain: { value: species.backlight },
        uVisibility: { value: 1200 },
        // Scene-linear radiance, written every frame by update().
        uCore: { value: new THREE.Color(0, 0, 0) },
        uHalo: { value: new THREE.Color(0, 0, 0) },
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
    const u = this.material.uniforms;
    const on = amount > 0.002;
    this.points.visible = on;
    if (!on) return;
    const sp = this.species;
    (u.uAmount as { value: number }).value = Math.min(1, amount);
    (u.uCam.value as THREE.Vector3).copy(camera.position);
    (u.uTime as { value: number }).value = timeS;
    (u.uPixelRatio as { value: number }).value = pixelRatio;
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uVisibility as { value: number }).value = visibilityM;

    // THE COLOUR STEP THAT MATTERS. Both branches produce SCENE-LINEAR
    // RADIANCE, never a display colour — the fragment shader then runs the
    // renderer's own tone map and output encode over it, exactly as a
    // built-in material would.
    if (sp.emissive) {
      const k = sp.emissiveScreen / Math.max(exposure, 1e-6);
      (u.uCore.value as THREE.Color).setRGB(sp.core[0] * k, sp.core[1] * k, sp.core[2] * k);
      const hk = k * 0.55;
      (u.uHalo.value as THREE.Color).setRGB(sp.halo[0] * hk, sp.halo[1] * hk, sp.halo[2] * hk);
    } else {
      // Lit by the real sky and sun. Never clamp this to display white:
      // daylight exposure is ~1e-5, so clamping turns a white mote into
      // soot — the lesson already recorded in waterParticleLighting.
      (u.uCore.value as THREE.Color).setRGB(
        light.x * sp.albedo[0] * sp.core[0],
        light.y * sp.albedo[1] * sp.core[1],
        light.z * sp.albedo[2] * sp.core[2],
      );
      (u.uHalo.value as THREE.Color).setRGB(
        light.x * sp.albedo[0] * sp.halo[0],
        light.y * sp.albedo[1] * sp.halo[1],
        light.z * sp.albedo[2] * sp.halo[2],
      );
    }

    const f = sp.windFollow * windSpeed;
    (u.uDrift.value as THREE.Vector3).set(
      sp.drift[0] + windXZ[0] * f,
      sp.drift[1],
      sp.drift[2] + windXZ[1] * f,
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
    // Density is deliberately modest. Measured: the blink envelope has a 25%
    // duty cycle, so 420 in this box puts roughly 19 lit in view at once —
    // enough to read as a swarm without returning to the "cloud of flashing
    // dots" the first version was. Adding more insects is the wrong lever if
    // they seem faint; make each one glow more (sizePx/halo) instead.
    count: 480,
    box: [30, 6, 30],
    yOffset: -1.4,
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
    clusterRadius: 5.5,
    backlight: 0,
  },

  /** Daytime spore and pollen drift under canopy. Catches the sun. */
  pollen: {
    id: "pollen",
    count: 500,
    box: [20, 9, 20],
    yOffset: 0.5,
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
    // High on purpose: pollen should be near-invisible in flat light and
    // flare when it is between you and the sun, which is what makes it read
    // as motes in a beam rather than confetti hanging in the air.
    backlight: 9,
  },

  /** Midge knots over water at dawn and dusk. Tight, fast, unlit. */
  midges: {
    id: "midges",
    count: 520,
    box: [24, 4, 24],
    yOffset: -0.8,
    sizePx: 5,
    emissive: false,
    emissiveScreen: 0,
    core: [0.55, 0.5, 0.44],
    halo: [0.42, 0.4, 0.36],
    albedo: [0.4, 0.37, 0.33],
    opacity: 0.75,
    additive: false,
    wander: [0.35, 0.3, 0.35],
    wanderHz: 1.5,
    drift: [0, 0, 0],
    windFollow: 0.15,
    blink: [0, 0],
    // Tight knots — a midge column is a clump, not a haze.
    clusterRadius: 1.1,
    backlight: 3,
  },

  /**
   * Dragonflies over standing water in the heat of the day — as iconic for a
   * warm marsh as the fireflies are for its night, and mechanically the same
   * thing on a different clock. Specks of colour at speck scale, not
   * modelled insects: a dragonfly you could look at is a sourcing job.
   */
  dragonflies: {
    id: "dragonflies",
    count: 180,
    box: [22, 5, 22],
    yOffset: -0.6,
    sizePx: 7,
    emissive: false,
    emissiveScreen: 0,
    core: [0.75, 1.0, 0.95],
    halo: [0.5, 0.82, 0.86],
    albedo: [0.55, 0.8, 0.75],
    opacity: 0.85,
    additive: false,
    wander: [1.6, 0.5, 1.6],
    wanderHz: 2.4,
    drift: [0, 0, 0],
    windFollow: 0.1,
    blink: [0, 0],
    clusterRadius: 6,
    backlight: 4,
  },

  /** Leaf fall under the canopy. Slow, heavy, wind-carried. */
  leaves: {
    id: "leaves",
    count: 110,
    box: [18, 11, 18],
    yOffset: 2.0,
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
