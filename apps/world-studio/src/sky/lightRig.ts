import {
  moonsAt,
  sunAt,
  type MoonState,
  type SunState,
} from "@elder-souls/world-time";
import { preethamSky } from "./preethamCpu";

/**
 * The natural light model (module 55 §96): every number the renderer needs at
 * one instant, as a pure function of (epoch minutes, local humidity, latitude).
 * Physical units — directional intensities are lux (three r155+ lights are
 * physically based), and the 8-orders-of-magnitude sun→starlight range is
 * compressed by the exposure target computed here, not by faking light values.
 * Reference illuminance table: docs/research/natural-light-sky-atmosphere-threejs.md §4.
 */

export interface LightRig {
  sun: SunState;
  moons: MoonState[];
  /** Sun colour (linear RGB) and illuminance in lux. */
  sunColor: [number, number, number];
  sunIntensity: number;
  /** Masser's directional moonlight (lux) — the working night key light. */
  moonColor: [number, number, number];
  moonIntensity: number;
  /** Sky-dome (Preetham) parameters, driven by local humidity. */
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** Multiplier lifting the dome's relative HDR output onto the lux scale. */
  skyLuminance: number;
  /** 1 = Preetham day dome, 0 = authored night dome (crossfaded in twilight). */
  skyFade: number;
  /** Hemisphere ambient (sky/ground bounce) supplementing the IBL, lux. */
  hemiSky: [number, number, number];
  hemiGround: [number, number, number];
  hemiIntensity: number;
  /** Renderer exposure target (eye adaptation eases toward it). */
  exposureTarget: number;
  /** Estimated horizontal illuminance driving adaptation, lux. */
  sceneIlluminance: number;
  /** Ground-mist strength 0..1 (dawn/dusk pooling, strongest in the dry seasons). */
  mistStrength: number;
  /** Night-sky element opacities. */
  starOpacity: number;
  /** Sun+moon radiance available to the aerial haze (lux-scale RGB). */
  hazeSunLight: [number, number, number];
  /** Isotropic sky inscatter for the haze (lux-scale RGB). */
  hazeAmbient: [number, number, number];
  /** Night dome gradient (lux-scale RGB): moonlit glow over black canopy. */
  nightZenith: [number, number, number];
  nightHorizon: [number, number, number];
  /** Below-horizon dome/IBL colour (nits): lit-ground bounce, replacing the
   * Preetham model's garbage lower hemisphere deterministically. */
  groundBounce: [number, number, number];
  /** Twilight glow: luminance (nits, exposure-anchored) + sun azimuth dir. */
  dawnLum: number;
  dawnDir: [number, number];
  /** Sub-horizon distance-haze band colour (nits) — the world-edge veil. */
  horizonHaze: [number, number, number];
  /** Multiplier lifting the night dome/stars to constant SCREEN brightness
   * through twilight (they are authored against the full-night exposure;
   * without this they render invisibly dark until the exposure catches up —
   * the round-4 "pitch black before the stars" window). ≥ 1. */
  nightBoost: number;
  /** Belt-of-Venus additive luminance (nits, exposure-anchored). */
  beltLum: number;
}

// Sunlight colour anchors from measured CCT vs solar elevation (research doc
// §8: ~2000 K at the horizon, ~3400 K in the 0–10° golden band, ~5500 K by
// ~35° — the warm shift CONCENTRATES near the horizon, it is not linear).
const NOON_SUN: [number, number, number] = [1.0, 0.925, 0.85];
const GOLDEN_SUN: [number, number, number] = [1.0, 0.7, 0.42];
const HORIZON_SUN: [number, number, number] = [1.0, 0.4, 0.1];
const MOONLIGHT: [number, number, number] = [0.62, 0.72, 1.0];

function daylightOf(altDeg: number): number {
  return smoothstep(-6, 12, altDeg);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Sky's contribution to horizontal illuminance (lux) by sun altitude.
 * Anchors (research doc §4): ~400 lx total at sunrise, ~3–10 lx civil,
 * ~0.05 lx nautical, ~20 000 lx sky-only by mid-morning. */
function skyIlluminance(sunAltDeg: number): number {
  if (sunAltDeg >= 0) return 400 + 19_600 * smoothstep(0, 25, sunAltDeg);
  // Twilight decay: ~2.9° of sun depression per decade of light hits the
  // civil (3.4 lx) and nautical (0.03 lx) reference points from 400.
  return 400 * Math.pow(10, sunAltDeg / 2.9);
}

/** Sun altitude (deg) → renderer exposure, log-interpolated. Shaped so the
 * on-screen ground brightness is a gentle PLATEAU through the day (round 3:
 * noon peaked too hot while mid-day sat dim) that eases down toward the warm
 * low-sun hours; the -12/-8 stops keep dusk from going pitch black before
 * the stars arrive; night is bounded (moonless dim-readable, full moon ~2
 * stops brighter). */
const EXPOSURE_CURVE: [number, number][] = [
  [-12, 0.8],
  [-8, 2.5e-2],
  [-4, 3.5e-3],
  [0, 1.4e-3],
  [3, 6e-4],
  [10, 2.4e-4],
  [25, 8.5e-5],
  [45, 3.9e-5],
  [75, 2.3e-5],
];

/** Full-night exposure ceiling, moonlight-dependent (shared by the exposure
 * curve and the night-dome/star anchoring). */
export function nightExposureOf(moonIntensity: number): number {
  return 14 / (1 + 11 * moonIntensity);
}

function authoredExposure(altDeg: number, moonIntensity: number): number {
  // Moonlight (0..~0.3 lx) pulls the night exposure down from the moonless
  // ceiling; the -12° pivot keeps the astronomical-twilight hand-off smooth.
  const nightExposure = nightExposureOf(moonIntensity);
  if (altDeg >= 75) return EXPOSURE_CURVE[EXPOSURE_CURVE.length - 1][1];
  if (altDeg <= -18) return nightExposure;
  const curve: [number, number][] = [[-18, nightExposure], ...EXPOSURE_CURVE];
  for (let i = 0; i < curve.length - 1; i++) {
    const [a0, e0] = curve[i];
    const [a1, e1] = curve[i + 1];
    if (altDeg <= a1) {
      const t = (altDeg - a0) / (a1 - a0);
      return Math.exp(Math.log(e0) + (Math.log(e1) - Math.log(e0)) * t);
    }
  }
  return EXPOSURE_CURVE[EXPOSURE_CURVE.length - 1][1];
}

export function computeLightRig(
  epochMinutes: number,
  humidityAtCamera: number,
  seasonScalar: number,
  latitude?: number,
): LightRig {
  const sun = sunAt(epochMinutes, latitude);
  const moons = moonsAt(epochMinutes, latitude);
  const altDeg = (sun.altitude * 180) / Math.PI;
  const sinAlt = Math.max(0, Math.sin(sun.altitude));

  // Sun: reddened and dimmed through the long low-sun optical path — a
  // three-stop ramp (horizon red → golden → warm noon white) whose change
  // concentrates near the horizon, per the measured CCT curve (round 3: the
  // light's tone must visibly warm through the day, not just the sky's).
  const warmth = smoothstep(10, 42, altDeg);
  const sunColor =
    altDeg < 10
      ? mix3(HORIZON_SUN, GOLDEN_SUN, smoothstep(-1, 10, altDeg))
      : mix3(GOLDEN_SUN, NOON_SUN, warmth);
  const aboveHorizon = smoothstep(-1.5, 0.5, altDeg);
  const sunIntensity = (100_000 * Math.pow(sinAlt, 1.15) + 350 * aboveHorizon) * aboveHorizon;

  // Moonlight: Masser is the key; full Masser high in a clear sky ≈ 0.3 lx.
  // Gated OFF while the sun is up (round 3: a daytime moon must not be a
  // light source at all — its 0.3 lx is real but the *perception* of the sky
  // brightening as it rises must never happen).
  const masser = moons[0];
  const moonUp = Math.max(0, Math.sin(masser.altitude));
  const sunUpFactor = 1 - smoothstep(-6, 0, altDeg);
  const moonIntensity = 0.3 * masser.illuminatedFraction * Math.sqrt(moonUp) * sunUpFactor;

  // Preetham degrades below the horizon: crossfade to the night dome.
  const skyFade = smoothstep(-9, -1, altDeg);

  // Exposure: slow eye adaptation toward a mid-grey key, floored so night
  // stays readable (never let starlight drive exposure to the physical limit).
  // The dome term keeps adaptation tracking the still-lit twilight sky, which
  // fills most of the frame while surface illuminance is already collapsing.
  const sceneIlluminance =
    sunIntensity * Math.max(sinAlt, 0.12) +
    skyIlluminance(altDeg) +
    800 * skyFade +
    moonIntensity * 4 +
    0.02;
  // Exposure is an AUTHORED curve over sun altitude (log-interpolated), not
  // derived from an illuminance model: the derived form diverged from what
  // the dome/IBL actually emit right after sunrise and blew the scene out
  // (owner round 3). Smooth by construction; every stop is a one-line tune.
  const exposureTarget = authoredExposure(altDeg, moonIntensity);

  // Sky dome: turbidity from the climate humidity at the camera —
  // border-mountain air is crisp, lowland air milky (module 55 §97). Mie is
  // PINNED at the library default: any more and the forward lobe turns the
  // circumsolar sky into a huge white glare (owner rounds 1 AND 2 — this is
  // the single most sensitive constant in the dome). The humid-lowland glow
  // belongs to the aerial haze term, not the dome.
  const h = Math.min(1, Math.max(0, humidityAtCamera));
  // Low-sun boost: the longer optical path reddens the DISC and its
  // circumsolar glow through the Preetham model itself (round 3: the sun's
  // own colour must transition through the day, not just the sky's).
  const turbidity = 1.8 + 2.7 * h * h + 3.2 * (1 - smoothstep(2, 25, altDeg));
  const mieCoefficient = 0.005;

  // Hemisphere ambient: a SUPPLEMENT (regional ground bounce + night floor),
  // NOT a second sky — the PMREM sky IBL is the one ambient authority, and a
  // full-strength hemisphere on top double-counts it, flattening all shading
  // and overexposing twilight (owner gate defect 2026-08-25).
  const daylight = smoothstep(-6, 12, altDeg);
  // Night floor 0.05 lx ≈ starlight+airglow, deliberately generous: with the
  // exposure ceiling it keeps a moonless marsh readable (owner round 2).
  const hemiIntensity = 2_000 * daylight + 0.1 * masser.illuminatedFraction + 0.05;

  // Radiation ground mist pools at dawn (and lightly at dusk) and is a
  // dry/recession-season phenomenon (climatology §2): mist peaks when s(t) < 0.
  const minuteOfDay = ((epochMinutes % 1440) + 1440) % 1440;
  const dawnBell = Math.exp(-Math.pow((minuteOfDay - 360) / 110, 2));
  const duskBell = 0.35 * Math.exp(-Math.pow((minuteOfDay - 1120) / 90, 2));
  const drySeason = 0.5 - 0.5 * seasonScalar;
  const mistStrength = (dawnBell + duskBell) * (0.25 + 0.75 * drySeason);

  // Haze feeds (module 55 §97): the same sun/moon and sky that light surfaces
  // also light the air, on the same lux scale. The GOLDEN-HOUR boost (owner
  // round 3) strengthens the warm forward-scatter while the sun is low —
  // humid lowlands already scatter more (the Mie density reads the humidity
  // raster), so the "golden glowing air" lands hardest exactly there.
  const golden = (1 - smoothstep(4, 16, altDeg)) * smoothstep(-3, 1, altDeg);
  const kHaze = 0.06 * (1 + 2.2 * golden);
  const skyE = skyIlluminance(altDeg);
  const hazeSunLight: [number, number, number] = [
    (sunColor[0] * sunIntensity + MOONLIGHT[0] * moonIntensity * 4) * kHaze,
    (sunColor[1] * sunIntensity + MOONLIGHT[1] * moonIntensity * 4) * kHaze,
    (sunColor[2] * sunIntensity + MOONLIGHT[2] * moonIntensity * 4) * kHaze,
  ];
  const hazeSky = mix3([0.06, 0.08, 0.14], [0.45, 0.62, 1.0], daylightOf(altDeg));
  const hazeAmbient: [number, number, number] = [
    hazeSky[0] * skyE * 0.1,
    hazeSky[1] * skyE * 0.1,
    hazeSky[2] * skyE * 0.1,
  ];

  // Night dome: moonlit sky reads pale over black canopy; moonless nights are
  // deep blue with a zenith→horizon airglow gradient — the real night sky is
  // never flat black (§96; owner round 2), but deep, not washed (round 3:
  // darkened ~×0.55). Bases sized against the night exposure (≤14).
  const moonGlow = masser.illuminatedFraction * Math.sqrt(moonUp);
  const nightZenith: [number, number, number] = [
    0.0016 + 0.004 * moonGlow * MOONLIGHT[0],
    0.0025 + 0.004 * moonGlow * MOONLIGHT[1],
    0.005 + 0.005 * moonGlow * MOONLIGHT[2],
  ];
  const nightHorizon: [number, number, number] = [
    nightZenith[0] * 2.0 + 0.0022,
    nightZenith[1] * 1.9 + 0.0019,
    nightZenith[2] * 1.7 + 0.0017,
  ];

  // Twilight glow (owner round 3): the authored night dome is otherwise
  // colour-static, which "pinned" the pre-dawn sky while the land brightened.
  // A tropical dawn/dusk gradient — molten orange at the sun's azimuth,
  // coral/magenta spread, violet-indigo wash — is layered over the dome in
  // the shader; its luminance is anchored AGAINST the exposure curve so its
  // on-screen brightness follows one smooth authored bell (no flashes).
  // Palette anchors: docs/research/natural-light-sky-atmosphere-threejs.md §8.
  const dawnBellAmount = Math.exp(-Math.pow((altDeg + 1) / 8.5, 2));
  const dawnLum = (0.58 / exposureTarget) * dawnBellAmount;
  const azLen = Math.hypot(sun.direction.x, sun.direction.z) || 1;
  const dawnDir: [number, number] = [sun.direction.x / azLen, sun.direction.z / azLen];

  // Ground bounce for the dome's lower hemisphere (marsh-earth albedo ≈ 0.22,
  // luminance = illuminance × albedo / π), on the same nit scale as the dome.
  const groundIll = sunIntensity * sinAlt + skyE + moonIntensity;
  const bounce = (groundIll * 0.22) / Math.PI;
  // Warm-earth relative tint (×1 average) on top of the 0.22 albedo above.
  const groundBounce: [number, number, number] = [
    bounce * 1.15,
    bounce * 1.0,
    bounce * 0.78,
  ];
  // Horizon-band colour: the first degrees below the horizon render as thick
  // distance haze (same colour family the aerial term fades terrain into),
  // so looking off the province edge reads as hazy distance, not a flat
  // brown void (owner round 3, "edge of the world").
  const horizonHaze: [number, number, number] = [
    hazeAmbient[0] * 4 + hazeSunLight[0] * 0.015 + nightHorizon[0] * 2,
    hazeAmbient[1] * 4 + hazeSunLight[1] * 0.015 + nightHorizon[1] * 2,
    hazeAmbient[2] * 4 + hazeSunLight[2] * 0.015 + nightHorizon[2] * 2,
  ];

  // Night dome/stars are authored against the FULL-NIGHT exposure; this
  // boost keeps their screen brightness constant while the twilight exposure
  // is still far below it (root cause of the round-4/5 "pitch black between
  // sunset and starlight" window). ≥1; at night it is exactly 1.
  const nightBoost = Math.max(1, nightExposureOf(moonIntensity) / exposureTarget);

  // Dome brightness is PINNED BY CONSTRUCTION (round 5): evaluate the
  // Preetham model (CPU port) at reference mid-sky directions and normalise
  // so the typical on-screen sky brightness follows one authored perceptual
  // curve. The model then supplies COLOUR and DISTRIBUTION (blue day, warm
  // sunset gradient, circumsolar glow, humidity milkiness) while whiteouts /
  // black skies are numerically impossible — rounds 2–5 all traced back to
  // this product (dome scale × exposure) drifting out of range somewhere in
  // the day. Enforced by the envelope test in lightRig.test.ts.
  const skyScreenTarget =
    0.25 +
    0.3 * smoothstep(0, 10, altDeg) +
    0.3 * smoothstep(10, 25, altDeg) -
    0.2 * smoothstep(0, 9, -altDeg);
  const sunDirArr: [number, number, number] = [sun.direction.x, sun.direction.y, sun.direction.z];
  const azL = Math.hypot(sun.direction.x, sun.direction.z) || 1;
  const e30 = Math.cos(Math.PI / 6);
  // Two mid-sky (30° elevation) references at ±90° azimuth from the sun,
  // plus the zenith — deliberately away from the circumsolar glow.
  const refDirs: [number, number, number][] = [
    [(-sun.direction.z / azL) * e30, 0.5, (sun.direction.x / azL) * e30],
    [(sun.direction.z / azL) * e30, 0.5, (-sun.direction.x / azL) * e30],
    [0, 1, 0],
  ];
  let relTypical = 0;
  for (const dir of refDirs) {
    const c = preethamSky(dir, sunDirArr, turbidity, 1.1 + 1.3 * (1 - warmth), mieCoefficient, 0.72);
    relTypical += Math.max(0, Math.min(50, Math.max(c[0], c[1], c[2])));
  }
  relTypical /= refDirs.length;
  const skyLuminance = Math.min(
    45_000,
    skyScreenTarget / Math.max(relTypical, 1e-4) / exposureTarget,
  );

  // Belt of Venus (research §8c): rose band above the rising Earth shadow on
  // the anti-solar side, peaking ~1–3° sun depression, dissolved by ~6.5°.
  const d = -altDeg;
  const beltBell = smoothstep(0.3, 1.2, d) * (1 - smoothstep(4.5, 6.5, d));
  const beltLum = (0.11 / exposureTarget) * beltBell;

  return {
    sun,
    moons,
    sunColor,
    sunIntensity,
    moonColor: MOONLIGHT,
    moonIntensity,
    turbidity,
    // More Rayleigh at low sun deepens the sunrise/sunset colour ramp.
    rayleigh: 1.1 + 1.3 * (1 - warmth),
    mieCoefficient,
    mieDirectionalG: 0.72,
    skyLuminance,
    skyFade,
    hemiSky: mix3([0.05, 0.07, 0.12], [0.55, 0.72, 1.0], daylight),
    hemiGround: mix3([0.02, 0.02, 0.03], [0.38, 0.34, 0.26], daylight),
    hemiIntensity,
    exposureTarget,
    sceneIlluminance,
    mistStrength,
    starOpacity: 1 - skyFade,
    hazeSunLight,
    hazeAmbient,
    nightZenith,
    nightHorizon,
    groundBounce,
    dawnLum,
    dawnDir,
    horizonHaze,
    nightBoost,
    beltLum,
  };
}
