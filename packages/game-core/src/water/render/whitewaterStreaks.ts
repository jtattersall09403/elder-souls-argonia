/**
 * Whitewater streak field shared by the waterfall sheets, the plunge base
 * quads and the ES_STRIP chute ribbons (research
 * `docs/research/rendering/waterfalls-realtime.md` §2.3/§4, measured from the
 * vanilla Skyrim NIF controllers on 2026-09-08).
 *
 * Bethesda's cure for the "conveyor belt" is not a flow map; it is
 *   (a) three layers scrolled at genuinely different rates (0.075 / 0.15 /
 *       0.5 UV/s on `fxrapids` — a 6.7x spread),
 *   (b) a slow lateral U drift (1 tile / 33.3 s = 0.030 UV/s) and
 *   (c) a U-scale breathing 1.00 → 1.05 → 1.00 over 8.33 s,
 * so no vertical streak ever stays put. Everything here scrolls along the
 * piece's OWN arc length in metres — never world-time x world position and
 * never a fixed world-space drift (decision 0047 root cause 6).
 *
 * The TS functions are the twins the unit tests measure; the node graphs
 * that draw them (the strip shader in waterMaterial.ts, the falls kit and
 * mist here) mirror them. Edit both or neither.
 */
import { Node } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const { clamp, dot, float, max, mix, vec3 } = tsl as unknown as Record<string, TslNode>;

/** One texture tile is this many metres of arc on the body layer (bodytall:
 * 3 V tiles over 16 m ≈ 5.3 m; the recipe rounds to 4 m). */
export const STREAK_TILE_M = 4;

export interface StreakLayer {
  /** Tile length along the arc (m). */
  tileM: number;
  /** Scroll speed along the arc (m/s) at unit speed gain. */
  rateMS: number;
  /** Tiles across a unit-width piece (the y-stretch that makes streaks). */
  acrossTiles: number;
  /** Phase offset (s) so the drift/breathe of each layer never lines up. */
  phaseS: number;
}

/** Measured V-offset rates, UV tiles per second (vault audit §4): the body
 * shell pair −0.313 / −0.333, the thin sheets −0.857, the crest strip's slow
 * plane −0.075 (0.5 : 0.075 = the 6.7x spread on `fxrapidsfallsline01`). */
export const STREAK_RATE_TILES_S = { body: 0.313, sheet: 0.857, slow: 0.075 } as const;
/**
 * Three layers at the measured tile rates on three tile sizes: body streaks
 * (0.313 t/s on a 4 m tile = 1.25 m/s), the fast thin-sheet foam (0.857 t/s
 * on 2.6 m = 2.23 m/s) and the slow crest accent (0.075 t/s on 8 m = 0.6 m/s).
 * 0.857 : 0.075 = 11x in tiles/s, 3.7x in metres/s — never the 1.1x of "two
 * layers slightly offset" that reads as one belt.
 */
export const STREAK_LAYERS: readonly StreakLayer[] = [
  { tileM: 4.0, rateMS: STREAK_RATE_TILES_S.body * 4.0, acrossTiles: 3.0, phaseS: 0.0 },
  { tileM: 2.6, rateMS: STREAK_RATE_TILES_S.sheet * 2.6, acrossTiles: 5.0, phaseS: 2.9 },
  { tileM: 8.0, rateMS: STREAK_RATE_TILES_S.slow * 8.0, acrossTiles: 1.5, phaseS: 5.3 },
];
/** Fast : slow rate ratio in tiles/s — at least the measured 6.7x. */
export const STREAK_RATE_SPREAD = STREAK_RATE_TILES_S.sheet / STREAK_RATE_TILES_S.slow;
/** Lateral U drift, tiles per second (1 tile / 33.3 s). */
export const STREAK_U_DRIFT_UVS = 0.030;
/** U-scale breathing: 1.00 → 1.05 → 1.00 over this period. */
export const STREAK_BREATHE_PERIOD_S = 8.33;
export const STREAK_BREATHE_AMPLITUDE = 0.05;
/** Side-to-side UV wobble (Cyanilux): 12 cycles per piece width, 0.05 UV. */
export const STREAK_WOBBLE_FREQ = 12;
export const STREAK_WOBBLE_AMPLITUDE = 0.05;
/** Scroll gain saturates at this water speed: a small fall is slower than a
 * gorge fall (research §2.3 finding 2). Floor keeps a slow lip alive. */
export const STREAK_SPEED_REF_MS = 6;
export const STREAK_SPEED_GAIN_MIN = 0.25;

/** Scroll gain for a local water speed, 0.25..1. */
export function streakSpeedGain(speedMS: number): number {
  return Math.min(Math.max(speedMS / STREAK_SPEED_REF_MS, STREAK_SPEED_GAIN_MIN), 1);
}

/** U-scale breathing factor at time t: 1.00 → 1.05 → 1.00, period 8.33 s. */
export function streakBreathe(timeS: number, phaseS = 0): number {
  return 1 + STREAK_BREATHE_AMPLITUDE * 0.5 * (1 - Math.cos((2 * Math.PI * (timeS + phaseS)) / STREAK_BREATHE_PERIOD_S));
}

export interface StreakSample {
  /** Texture-space u (tiles across) after drift, breathing and wobble. */
  u: number;
  /** Texture-space v (tiles along the arc) after the scroll. */
  v: number;
}

/**
 * Texture coordinate of layer `layer` at across-coordinate `u` (0..1), arc
 * `arcM` metres down the piece, time `timeS`. The scroll is strictly along
 * the arc: v decreases with time, so a feature at arc a at time t is at
 * a + rate·dt at t + dt — downstream.
 */
export function streakUv(layer: number, u: number, arcM: number, timeS: number, speedGain: number,
  wobbleScale = 1): StreakSample {
  const L = STREAK_LAYERS[Math.min(Math.max(layer, 0), STREAK_LAYERS.length - 1)];
  const t = timeS + L.phaseS;
  const breathe = streakBreathe(timeS, L.phaseS);
  const wobble = Math.sin(u * STREAK_WOBBLE_FREQ + t * 1.0) * STREAK_WOBBLE_AMPLITUDE * wobbleScale;
  const uu = (u - 0.5) * breathe * L.acrossTiles + 0.5 * L.acrossTiles + STREAK_U_DRIFT_UVS * t + wobble;
  const vv = arcM / L.tileM - (L.rateMS * speedGain * timeS) / L.tileM;
  return { u: uu, v: vv };
}

/**
 * Recovering surface irradiance from the runtime's AERIAL light feeds.
 *
 * `WaterRuntime.ambient` / `.sunLight` are documented (types.ts) as the HDR
 * aerial feeds, and the light rig builds them that way:
 *   ambient  = sky irradiance x 0.1        (lightRig `hazeAmbient`)
 *   sunLight = direct irradiance x kHaze   (lightRig `hazeSunLight`, kHaze
 *              0.06 at midday, rising to ~0.19 through the golden hour)
 * They are the SCATTERING radiances the fog term wants, not the irradiance
 * that lights a surface. The whole waterfall kit — sheet, plunge base, mist —
 * multiplied its albedo by them raw, so it was exposed at a tenth of the sky
 * while everything around it, including the physically-lit whitewater the
 * field shader draws in the strips a metre upstream at the same 0.85–0.90
 * white albedo, was lit by the real light rig. That is why the fall rendered
 * as the DARK thing between the bright river above it and the bright pool
 * foam below it (probe 2026-09-08: fall body 103 vs strip/pool foam 172 on
 * screen, and no albedo change could move it).
 *
 * Undoing both documented scales and dividing by pi for the Lambert BRDF is
 * the physical conversion. kHaze is not carried on the uniform, so the sun
 * feed uses its midday value: through the golden hour we then UNDER-recover
 * the sun, which is exactly when a vertical white body sees least of it.
 */
export const AERIAL_SKY_FEED_SCALE = 0.1;
export const AERIAL_SUN_FEED_SCALE = 0.06;

/**
 * Sun/sky BALANCE for the falls kit, and why it is not one number.
 *
 * The old form weighted the direct sun `0.55 + 0.45 * sunY` — MAXIMUM when
 * the sun is overhead. For the pool foam (a horizontal surface) that is
 * right. For the sheet, a near-vertical body, it is backwards: a vertical
 * face sees the beam through cos(elevation), so at noon it receives least
 * direct sun, not most. The sheet was therefore painted with the midday sun's
 * own colour at full strength while the blue sky term contributed a tenth of
 * the total — measured at noon (lightRig, warmthBias 1): sky illuminance
 * [9.0k, 12.4k, 20.0k] against a direct [93.3k, 58.0k, 26.8k], giving the body
 * a chromaticity of [1.00, 0.69, 0.46]. That is the cream/ivory the owner
 * reported; the kit's own albedo is neutral white throughout.
 *
 * `upness` is the body's geometry, 0 = a vertical sheet, 1 = a horizontal
 * pool. It selects three view factors:
 *   - sky:    a vertical surface sees half the sky hemisphere, a horizontal
 *             one all of it (0.5 → 1.0);
 *   - sun:    a cloud of droplets is a sphere, so it intercepts E_n / 4 —
 *             `sunLight` carries the HORIZONTAL direct illuminance E_n·sinAlt,
 *             hence `0.25 / sunY`; a horizontal surface takes it as given;
 *   - bounce: the half of a vertical body's view that is sunlit GROUND
 *             returns the total horizontal illuminance times a rock/water
 *             albedo; a horizontal body sees none of it.
 *
 * The MAGNITUDE is then renormalised to the level the old form produced,
 * because that level is the calibrated exposure of an optically thick
 * multiple-scattering body (the visible face of a whitewater curtain is
 * brighter than any single-bounce Lambert term predicts, which is why a fall
 * reads as bright as its own pool foam and not the ~0.4x that a flat vertical
 * Lambertian would). Renormalising against the UNSHADOWED balance leaves
 * `sunVisibility` free to darken a shaded fall.
 */
/**
 * SKY VIEW — measured 2026-09-09, and why it is 1 and not `0.5 + 0.5·up`.
 *
 * The falls kit and the water beside it are the same material lit by two
 * different arithmetics: the field and strip water is a MeshPhysicalMaterial
 * through three's PBR path (scene lights + IBL), the kit is this unlit
 * function. Measured on screen at fall-20m under one light (probe
 * `fit: chromaticity`): the sheet body rendered [1.022, 1.000, 0.971] against
 * the strip/pool whitewater's [0.911, 1.000, 1.072] — 12 % redder and 9 %
 * less blue, and 15 % less blue at fall-gorge. Two surfaces of one material
 * do not differ that far by geometry alone, so the gap was ours.
 *
 * Its cause was an inconsistency inside this function: the body was treated as
 * a CLOUD OF DROPLETS for the sun (`FALLS_SPHERE_INTERCEPT`, E_n/4, because a
 * sphere intercepts the beam over its cross-section) and as a FLAT PLATE for
 * the sky (half the hemisphere when vertical). A sphere sees the sky from
 * every direction the rock does not block; halving the blue term while keeping
 * the sun's full sphere intercept is what weighted the body toward the sun's
 * own colour. One view factor, one model: the sky term is not halved.
 * Magnitude is unaffected — the renormalisation below restores the calibrated
 * exposure — so this changes colour only, which is what it was for.
 */
export const FALLS_SKY_VIEW = 1;
export const FALLS_GROUND_ALBEDO = 0.22;
export const FALLS_SPHERE_INTERCEPT = 0.25;
/** Sun elevation floor for the sphere intercept — a grazing sun is not infinite. */
export const FALLS_MIN_SUN_Y = 0.15;
const LUM = [0.2126, 0.7152, 0.0722] as const;

/**
 * Irradiance for the aerated-white waterfall kit (TS twin of
 * `esFallsIrradiance`). `upness` 0 = vertical sheet, 1 = horizontal pool foam;
 * `sunVisibility` 0..1 is the shadow term (1 = open sun).
 */
export function fallsIrradiance(ambient: readonly number[], sunLight: readonly number[], sunDirY: number,
  upness = 0, sunVisibility = 1): [number, number, number] {
  const up = Math.min(Math.max(upness, 0), 1);
  const vis = Math.min(Math.max(sunVisibility, 0), 1);
  const sunY = Math.min(Math.max(sunDirY, FALLS_MIN_SUN_Y), 1);
  const skyView = FALLS_SKY_VIEW;
  const sunView = FALLS_SPHERE_INTERCEPT / sunY + (1 - FALLS_SPHERE_INTERCEPT / sunY) * up;
  const bounce = (1 - up) * 0.5 * FALLS_GROUND_ALBEDO;
  const sky = [0, 1, 2].map((i) => ambient[i] / AERIAL_SKY_FEED_SCALE);
  const sun = [0, 1, 2].map((i) => sunLight[i] / AERIAL_SUN_FEED_SCALE);
  const balance = (v: number) => [0, 1, 2].map((i) =>
    sky[i] * skyView + sun[i] * sunView * v + (sky[i] + sun[i] * v) * bounce);
  const flat = [0, 1, 2].map((i) => sky[i] + sun[i] * (0.55 + 0.45 * Math.min(Math.max(sunDirY, 0), 1)));
  const full = balance(1);
  const lum = (v: number[]) => LUM[0] * v[0] + LUM[1] * v[1] + LUM[2] * v[2];
  const k = lum(flat) / Math.max(lum(full), 1e-4);
  return balance(vis).map((v) => (v * k) / Math.PI) as [number, number, number];
}

/**
 * Sun visibility (shadow) for the falls kit and mist.
 *
 * The kit is unlit, so a fall at the bottom of a shaded gorge would be lit
 * as if it stood in open sun (probe: `fall-gorge` body measured x2.10 of the
 * water around it, which IS shadowed). The kit therefore reads the sun's own
 * shadow node, the SAME instance the sun light uses (`CSMShadowNode` on
 * `light.shadow.shadowNode`, or a `shadow(light)` node): three renders its
 * maps once per frame whatever reads them, and the cascade choice is the
 * node's own. The holder is read at material BUILD time; after setting
 * `node`, mark the materials `needsUpdate` (WaterfallSheets.setSunShadow).
 * No node = open sun (visibility 1), the old `NUM_DIR_LIGHT_SHADOWS == 0` path.
 */
export interface FallsSunShadow {
  node: TslNode | null;
}

class EsFallsSunVisibility extends (Node as unknown as new (type: string) => { nodeType: string }) {
  constructor(private readonly holder: FallsSunShadow) {
    super("float");
  }
  setup(builder: { renderer: { shadowMap: { enabled: boolean } } }): TslNode {
    const node = this.holder.node;
    if (!node || !builder.renderer.shadowMap.enabled) return float(1);
    return float(node);
  }
}

/** Sun visibility 0..1 for the current fragment (1 = open sun). */
export function fallsSunVisibilityNode(holder: FallsSunShadow): TslNode {
  return new EsFallsSunVisibility(holder);
}

/**
 * Node twin of `fallsIrradiance()` (KEEP IN LOCKSTEP): upness 0 = vertical
 * sheet, 1 = horizontal pool foam; vis = sun visibility, 1 = open sun.
 * Arguments are TSL nodes (vec3, vec3, vec3, float, float).
 */
export function fallsIrradianceNode(ambient: TslNode, sunLight: TslNode, sunDir: TslNode,
  upness: TslNode, vis: TslNode): TslNode {
  const up = clamp(upness, 0, 1);
  const v = clamp(vis, 0, 1);
  const sunY = clamp(sunDir.y, FALLS_MIN_SUN_Y, 1);
  const skyView = float(FALLS_SKY_VIEW);
  const sunSphere = float(FALLS_SPHERE_INTERCEPT).div(sunY);
  const sunView = mix(sunSphere, float(1), up);
  const bounce = float(1).sub(up).mul(0.5 * FALLS_GROUND_ALBEDO);
  const sky = vec3(ambient).div(AERIAL_SKY_FEED_SCALE);
  const sun = vec3(sunLight).div(AERIAL_SUN_FEED_SCALE);
  const full = sky.mul(skyView).add(sun.mul(sunView)).add(sky.add(sun).mul(bounce));
  const lit = sky.mul(skyView).add(sun.mul(sunView).mul(v)).add(sky.add(sun.mul(v)).mul(bounce));
  const flat = sky.add(sun.mul(float(0.55).add(clamp(sunDir.y, 0, 1).mul(0.45))));
  const LUMV = vec3(LUM[0], LUM[1], LUM[2]);
  const k = dot(flat, LUMV).div(max(dot(full, LUMV), 1e-4));
  return lit.mul(k).mul(1 / Math.PI);
}
