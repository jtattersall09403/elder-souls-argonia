import {
  moonsAt,
  sunAt,
  type MoonState,
  type SunState,
} from "@elder-souls/world-time";

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
}

const NOON_SUN: [number, number, number] = [1.0, 0.96, 0.9];
const HORIZON_SUN: [number, number, number] = [1.0, 0.45, 0.18];
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

  // Sun: reddened and dimmed through the long low-sun optical path.
  const warmth = smoothstep(-2, 22, altDeg);
  const sunColor = mix3(HORIZON_SUN, NOON_SUN, warmth);
  const aboveHorizon = smoothstep(-1.5, 0.5, altDeg);
  const sunIntensity = (100_000 * Math.pow(sinAlt, 1.15) + 350 * aboveHorizon) * aboveHorizon;

  // Moonlight: Masser is the key; full Masser high in a clear sky ≈ 0.3 lx.
  const masser = moons[0];
  const moonUp = Math.max(0, Math.sin(masser.altitude));
  const moonIntensity = 0.3 * masser.illuminatedFraction * Math.sqrt(moonUp);

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
  const exposureTarget = Math.min(8, Math.max(3e-5, 4.5 / sceneIlluminance));

  // Sky dome: turbidity/Mie from the climate humidity at the camera —
  // border-mountain air is crisp, lowland air glows (module 55 §97).
  // Mie stays NEAR the library's default (0.005): at 0.03+ the forward
  // scattering lobe turns the whole circumsolar sky into a white glare
  // (owner gate defect 2026-08-25 — "huge white blur where the sun is").
  // The humid-lowland glow belongs to the aerial haze term, not the dome.
  const h = Math.min(1, Math.max(0, humidityAtCamera));
  const turbidity = 1.8 + 5.7 * h * h;
  const mieCoefficient = 0.004 + 0.008 * h * h;

  // Hemisphere ambient: a SUPPLEMENT (regional ground bounce + night floor),
  // NOT a second sky — the PMREM sky IBL is the one ambient authority, and a
  // full-strength hemisphere on top double-counts it, flattening all shading
  // and overexposing twilight (owner gate defect 2026-08-25).
  const daylight = smoothstep(-6, 12, altDeg);
  const hemiIntensity = 1_400 * daylight + 0.06 * masser.illuminatedFraction + 0.02;

  // Radiation ground mist pools at dawn (and lightly at dusk) and is a
  // dry/recession-season phenomenon (climatology §2): mist peaks when s(t) < 0.
  const minuteOfDay = ((epochMinutes % 1440) + 1440) % 1440;
  const dawnBell = Math.exp(-Math.pow((minuteOfDay - 360) / 110, 2));
  const duskBell = 0.35 * Math.exp(-Math.pow((minuteOfDay - 1120) / 90, 2));
  const drySeason = 0.5 - 0.5 * seasonScalar;
  const mistStrength = (dawnBell + duskBell) * (0.25 + 0.75 * drySeason);

  // Haze feeds (module 55 §97): the same sun/moon and sky that light surfaces
  // also light the air, on the same lux scale.
  const kHaze = 0.06;
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

  // Night dome: moonlit sky reads pale over black canopy; moonless nights stay
  // near-black with a faint warm airglow ring at the horizon (§96: night has a
  // palette, not just less light).
  const moonGlow = masser.illuminatedFraction * Math.sqrt(moonUp);
  const nightZenith: [number, number, number] = [
    0.0004 + 0.006 * moonGlow * MOONLIGHT[0],
    0.0006 + 0.006 * moonGlow * MOONLIGHT[1],
    0.0012 + 0.007 * moonGlow * MOONLIGHT[2],
  ];
  const nightHorizon: [number, number, number] = [
    nightZenith[0] * 2.4 + 0.0006,
    nightZenith[1] * 2.2 + 0.0005,
    nightZenith[2] * 2.0 + 0.0004,
  ];

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

  return {
    sun,
    moons,
    sunColor,
    sunIntensity,
    moonColor: MOONLIGHT,
    moonIntensity,
    turbidity,
    rayleigh: 1.1,
    mieCoefficient,
    mieDirectionalG: 0.8,
    skyLuminance: 16_000,
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
  };
}
