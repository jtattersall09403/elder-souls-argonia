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
  /** Weather (Phase 8c): cloud layer coverages low/mid/high 0..1. */
  cloudCov: [number, number, number];
  cloudDensity: number;
  /** Lit cloud-face and shadowed cloud-base colours (nits, exposure-anchored
   * on the CPU like dawnLum — bounded on screen by construction). */
  cloudBright: [number, number, number];
  cloudDarkCol: [number, number, number];
  /** Whether the sun light should cast shadows (off under heavy overcast). */
  sunCastsShadows: boolean;
  /** Asymptotic inscatter colour of DENSE fog (mist regimes / whiteout /
   * heavy weather haze), exposure-anchored: lit cloud-water is bright
   * white-grey by day, moonlit-dim by night — never the thin-haze ambient,
   * whose asymptote renders near-black in daylight (owner round 2: black
   * summit caps, invisible mist, the purple fly-mode layer). */
  fogLum: [number, number, number];
  /** Fog colour looking INTO the light (round 4): the forward-scattered,
   * strongly sun-tinted side of a fog/mist/cap-cloud bank. The aerial shader
   * blends between this and `fogLum` by the view/sun angle, which is what
   * makes a backlit bank glow gold at sunset instead of staying white. */
  fogSunLum: [number, number, number];
  /** Cloud edge-glow light (silver lining): direction + exposure-anchored
   * colour — the sun by day, Masser by night (research §8.1). */
  cloudGlowDir: [number, number, number];
  cloudGlowCol: [number, number, number];
  /** Sunrise/sunset cloud light (round 3, research §9.2): the reddened
   * low-sun colour clouds are lit by, exposure-anchored; the dome applies it
   * with sunward azimuth weighting + a soft anti-solar rose. */
  cloudSunsetCol: [number, number, number];
  /** Strength 0..1 for [mid/low deck, high cirrus] — cirrus stays lit a few
   * degrees of sun depression longer (it is higher; real afterglow). */
  cloudSunsetAmt: [number, number];
}

/** Weather inputs to the light model (Phase 8c, decision 0032): the blended
 * state-profile numbers that change light — all default to clear weather. */
export interface WeatherLightIn {
  sunDim: number;
  ambientLift: number;
  skyGrey: number;
  fogMie: number;
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  cloudDensity: number;
  cloudDark: number;
  /** Radiation-mist regime strength (replaces the rig's own dawn-bell mist
   * once the weather machine supplies the causally-gated value). */
  radiationMist?: number;
  /** Thunderstorm green-grey cast 0..1 (reads in the brighter cloud tones). */
  greenTint?: number;
  /** Cloud alpha at the sun's dome position (CPU cloud field, cloudField.ts)
   * — a cumulus drifting across the sun visibly dims the direct light even
   * when the state-level sunDim is 0 (scattered fair-weather clouds). */
  sunOcclusion?: number;
}

const CLEAR_WEATHER: WeatherLightIn = {
  sunDim: 0,
  ambientLift: 0,
  skyGrey: 0,
  fogMie: 0,
  cloudLow: 0,
  cloudMid: 0,
  cloudHigh: 0,
  cloudDensity: 0,
  cloudDark: 0,
};

// Sunlight colour anchors from measured CCT vs solar elevation (research doc
// §8: ~2000 K at the horizon, ~3400 K in the 0–10° golden band, ~5500 K by
// ~35° — the warm shift CONCENTRATES near the horizon, it is not linear).
const NOON_SUN: [number, number, number] = [1.0, 0.925, 0.85];
const GOLDEN_SUN: [number, number, number] = [1.0, 0.7, 0.42];
const HORIZON_SUN: [number, number, number] = [1.0, 0.4, 0.1];
const MOONLIGHT: [number, number, number] = [0.62, 0.72, 1.0];

/** Owner-tunable daylight warmth (rounds 6–8): 0 = the measured-CCT ramp
 * as-is, 1 = deeply golden — warms the sunlight at every altitude plus the
 * sun's disc/halo. Owner-locked default (round 8): 1.0. Slider in the time
 * panel remains for future re-tuning. */
let warmthBias = 1.0;
export function setWarmthBias(v: number): void {
  warmthBias = Math.min(1, Math.max(0, v));
}
export function getWarmthBias(): number {
  return warmthBias;
}

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
 * curve and the night-dome/star anchoring). Moonless ceiling raised round 6:
 * the darkest hours keep a readable gameplay floor (standard open-world
 * practice — Skyrim-style authored night ambient, not physical starlight);
 * torches/night-eye later make it a luxury, not a necessity. A full moon
 * still reads ~2 stops brighter than moonless. */
export function nightExposureOf(moonIntensity: number): number {
  return 22 / (1 + 17 * moonIntensity);
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
  weather?: WeatherLightIn,
): LightRig {
  const wx = weather ?? CLEAR_WEATHER;
  const sun = sunAt(epochMinutes, latitude);
  const moons = moonsAt(epochMinutes, latitude);
  const altDeg = (sun.altitude * 180) / Math.PI;
  const sinAlt = Math.max(0, Math.sin(sun.altitude));

  // Sun: reddened and dimmed through the long low-sun optical path — a
  // three-stop ramp (horizon red → golden → warm noon white) whose change
  // concentrates near the horizon, per the measured CCT curve (round 3: the
  // light's tone must visibly warm through the day, not just the sky's).
  const warmth = smoothstep(10, 42, altDeg);
  const highSun = mix3(NOON_SUN, GOLDEN_SUN, 0.9 * warmthBias);
  const rampColor =
    altDeg < 10
      ? mix3(HORIZON_SUN, GOLDEN_SUN, smoothstep(-1, 10, altDeg))
      : mix3(GOLDEN_SUN, highSun, warmth);
  // Whole-day warm tint (round 7): the slider warms the sunlight at EVERY
  // altitude — sunrise and sunset deepen along with midday.
  const sunColor = mix3(
    rampColor,
    [rampColor[0], rampColor[1] * 0.86, rampColor[2] * 0.62],
    warmthBias,
  );
  const aboveHorizon = smoothstep(-1.5, 0.5, altDeg);
  // Weather: the cloud deck removes direct sun steeply (overcast means
  // diffuse light, not a dimmer sun disc on the ground). A discrete cloud
  // crossing the sun (CPU cloud field) dims on top of the state-level term —
  // scattered-cumulus days get real passing shade.
  const sunOcc = Math.min(1, Math.max(0, wx.sunOcclusion ?? 0));
  const directFactor = Math.pow(1 - wx.sunDim, 3) * (1 - 0.85 * sunOcc);
  const sunIntensity =
    (100_000 * Math.pow(sinAlt, 1.15) + 350 * aboveHorizon) * aboveHorizon * directFactor;
  const sunCastsShadows = sunIntensity > 1 && wx.sunDim < 0.6 && sunOcc < 0.8;

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
  // Weather: an overcast/storm day is physically several times dimmer — lift
  // the exposure PART-way so heavy weather reads moody but playable. Round 2:
  // lift cut 1.2 → 0.6 — the old value cancelled most of the storm darkening
  // and flattened the rain→downpour→squall ladder the owner wants steep.
  // Daylight-gated: night exposure is already floored and must keep its
  // moon-driven ordering. (Passing cumulus shade — sunOcc — deliberately
  // does NOT lift exposure: a cloud shadow should read as a real dip.)
  const daylightGate = smoothstep(-6, 12, altDeg);
  const exposureTarget =
    authoredExposure(altDeg, moonIntensity) * (1 + 0.6 * wx.sunDim * daylightGate);

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
  // + warmth term (round 7): the slider also warms the sun's disc/halo and
  // (via the IBL) the ambient — the disc must match its own light.
  const turbidity =
    1.8 + 2.7 * h * h + 3.2 * (1 - smoothstep(2, 25, altDeg)) + 0.9 * warmthBias
    + 2.2 * Math.min(wx.fogMie, 1.4); // weather haze milkens the dome itself
  // Heavy decks hide the sun's forward-scatter glow (and its disc's glare) —
  // REDUCING Mie under weather is safe; the 8a pinning lesson (0021) was
  // against raising it above the addon default.
  const mieCoefficient = 0.005 * (1 - 0.6 * wx.sunDim);

  // Night dome/stars are authored against the FULL-NIGHT exposure; this
  // boost keeps their screen brightness constant while the twilight exposure
  // is still far below it (round-4/5 "pitch black before starlight" gap).
  const nightExposure = nightExposureOf(moonIntensity);
  const nightBoost = Math.max(1, nightExposure / exposureTarget);

  // Hemisphere ambient: a SUPPLEMENT (regional ground bounce + night floor),
  // NOT a second sky — the PMREM sky IBL is the one ambient authority, and a
  // full-strength hemisphere on top double-counts it, flattening all shading
  // and overexposing twilight (owner gate defect 2026-08-25).
  const daylight = smoothstep(-6, 12, altDeg);
  // Night/twilight LAND floor (round 7): exposure-anchored via nightBoost so
  // the ground reaches its readable night level as soon as dusk sets in —
  // previously the floor lux was constant, so just-after-sunset land was
  // pitch black until the exposure finished climbing. Gated in over 2–7° of
  // sun depression; at full night the boost is 1 and this is a plain 0.11 lx
  // authored gameplay floor (torches stay a luxury, not a necessity).
  const duskGate = smoothstep(2, 7, -altDeg);
  const hemiIntensity =
    (2_000 * daylight + 0.1 * masser.illuminatedFraction + 0.11 * duskGate * nightBoost + 0.02) *
    (1 + wx.ambientLift); // overcast sky becomes the light source

  // Radiation ground mist pools at dawn (and lightly at dusk) and is a
  // dry/recession-season phenomenon (climatology §2): mist peaks when s(t) < 0.
  // With the weather machine present its causally-gated radiation-mist value
  // wins (clear-calm-night dependency); the internal bell remains the
  // fallback for rig uses without weather (tests, tools).
  const minuteOfDay = ((epochMinutes % 1440) + 1440) % 1440;
  const dawnBell = Math.exp(-Math.pow((minuteOfDay - 360) / 110, 2));
  const duskBell = 0.35 * Math.exp(-Math.pow((minuteOfDay - 1120) / 90, 2));
  const drySeason = 0.5 - 0.5 * seasonScalar;
  const mistStrength =
    weather?.radiationMist ?? (dawnBell + duskBell) * (0.25 + 0.75 * drySeason);

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

  // Night dome, authored in SCREEN-linear terms and divided by the night
  // exposure (round 7): the screen brightness a night sky renders at is the
  // author's number here, independent of the moon-driven exposure — before
  // this, the moonless exposure ceiling (higher than moonlit) made a
  // MOONLESS sky render BRIGHTER than a moonlit one (owner: inverted).
  // Moonlit sky ≈ 1.7× a moonless one, pale moonlight blue.
  const moonGlow = masser.illuminatedFraction * Math.sqrt(moonUp);
  const zenithScreen: [number, number, number] = [
    0.008 + 0.014 * moonGlow * MOONLIGHT[0],
    0.012 + 0.014 * moonGlow * MOONLIGHT[1],
    0.021 + 0.014 * moonGlow * MOONLIGHT[2],
  ];
  const nightZenith: [number, number, number] = [
    zenithScreen[0] / nightExposure,
    zenithScreen[1] / nightExposure,
    zenithScreen[2] / nightExposure,
  ];
  const nightHorizon: [number, number, number] = [
    (zenithScreen[0] * 1.85 + 0.004) / nightExposure,
    (zenithScreen[1] * 1.8 + 0.0035) / nightExposure,
    (zenithScreen[2] * 1.65 + 0.003) / nightExposure,
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
  // Rayleigh boost softened round 6 (was 1.3): the deep-red twilight band
  // read as crimson against the owner's pastel tropical references.
  const rayleigh = 1.1 + 0.9 * (1 - warmth);
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
    const c = preethamSky(dir, sunDirArr, turbidity, rayleigh, mieCoefficient, 0.72);
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

  // Cloud colours (Phase 8c): authored in SCREEN terms and divided by the
  // exposure, exactly like dawnLum/beltLum — so cloud brightness is bounded
  // by construction and cannot re-open the §8d whiteout/black-gap class.
  // Day: white lit faces warming toward the low sun; night: near-black
  // silhouettes floored just under the night sky so they read as shapes.
  const cloudWarmth = 1 - smoothstep(2, 20, altDeg);
  // Warm day tint desaturates to cool moonlit silver at night (round 2:
  // night clouds must read blue-grey, not leftover sunset peach).
  const cloudTint = mix3(
    [0.85, 0.9, 1.02],
    mix3([1, 1, 1], [1, 0.62, 0.38], 0.85 * cloudWarmth),
    skyFade,
  );
  const dayBrightScreen =
    (0.34 + 0.42 * smoothstep(0, 15, altDeg)) * (1 - 0.35 * wx.cloudDark);
  const moonGlowC = masser.illuminatedFraction * Math.sqrt(moonUp);
  // Moonlit cloud faces brightened (round 2: cloudy nights were unreadable —
  // a moonlit deck now sits clearly above the night sky, an unlit one below).
  const nightBrightScreen = 0.012 + 0.05 * moonGlowC;
  const brightScreen = nightBrightScreen + (dayBrightScreen - nightBrightScreen) * skyFade;
  const darkScreen = brightScreen * (0.42 - 0.3 * wx.cloudDark) + 0.006;
  const darkTint = mix3(cloudTint, [0.92, 0.96, 1.05], 0.5);
  // Thunderstorm green cast (round 2, research §8.3): shifts the BRIGHTER
  // cloud tones toward grey-teal — the darkest bases stay neutral black.
  const green = Math.min(1, Math.max(0, wx.greenTint ?? 0));
  const greenBright = mix3(cloudTint, [0.78 * cloudTint[0], cloudTint[1], 0.88 * cloudTint[2]], green);
  const cloudBright: [number, number, number] = [
    Math.max((greenBright[0] * brightScreen) / exposureTarget, nightZenith[0] * 0.6),
    Math.max((greenBright[1] * brightScreen) / exposureTarget, nightZenith[1] * 0.6),
    Math.max((greenBright[2] * brightScreen) / exposureTarget, nightZenith[2] * 0.6),
  ];
  const cloudDarkCol: [number, number, number] = [
    Math.max((darkTint[0] * darkScreen) / exposureTarget, nightZenith[0] * 0.45),
    Math.max((darkTint[1] * darkScreen) / exposureTarget, nightZenith[1] * 0.45),
    Math.max((darkTint[2] * darkScreen) / exposureTarget, nightZenith[2] * 0.45),
  ];

  // Sunrise/sunset light colour (owner round 3; research §9.2) — computed
  // BEFORE the fog block (round 4) because fog is lit by exactly the same
  // reddened light and must be tinted by it.
  const sunsetBell = (alt: number) => Math.exp(-Math.pow((alt - 1) / 5.5, 2));
  const cloudSunsetAmt: [number, number] = [
    sunsetBell(altDeg) * (1 - 0.75 * wx.cloudDark),
    sunsetBell(altDeg + 4),
  ];
  const deepening = 1 - smoothstep(-3, 5, altDeg);
  const sunsetTint = mix3([1.0, 0.66, 0.33], [1.0, 0.36, 0.18], deepening);
  const sunsetScreen = 0.62;
  const cloudSunsetCol: [number, number, number] = [
    (sunsetTint[0] * sunsetScreen) / exposureTarget,
    (sunsetTint[1] * sunsetScreen) / exposureTarget,
    (sunsetTint[2] * sunsetScreen) / exposureTarget,
  ];

  // Dense-fog inscatter colour — DERIVED from the real light (owner round 5:
  // "shouldn't the mist just be lit by the actual light, so it takes the
  // light's colour and brightness?"). Round 4 tried to get sunset fog right
  // with authored screen ramps (a sun-altitude dim + a hand sunset tint) and
  // overshot: every mist/haze/cap-cloud went DARK GREY all day. A fog bank is
  // cloud-water with albedo ≈ 0.9 — by day its luminance tracks the actual
  // illuminance landing on it (direct sun + sky light), so here we compute
  // exactly that from the same sunIntensity/sunColor/skyE the surfaces use:
  //  - high sun → bank is bright white (the round-3 look the owner preferred);
  //  - sunset → the sun term collapses and REDDENS (sunColor), so the bank
  //    dims and warms with the real light, no hand tint;
  //  - under a storm deck the direct term is already killed by sunDim (it is
  //    inside sunIntensity) and the sky term is absorbed by the deck → gloom;
  //  - the diffuse (multi-scattered) side is partially DESATURATED toward
  //    white — multiple scattering whitens transmitted light — while the
  //    forward single-scatter side (fogSunLum) keeps the sun's full colour.
  // Night is the one place the physical chain must not run: the night scene
  // is an authored gameplay floor ~10× brighter than physics, so night fog
  // keeps its authored moonlit screen level and the two are blended in
  // SCREEN space across twilight (smooth against the moving exposure).
  const FOG_SCATTER = 0.3; // albedo/π for the shaded (neutral) side of a bank
  const FOG_SKY_TINT: [number, number, number] = [0.86, 0.92, 1.0];
  const sunOnFog = sunIntensity * sinAlt; // direct sun on the bank, lux
  const fogSunTint = mix3(sunColor, [1, 1, 1], 0.65); // multi-scatter whitening
  // The SKY-light half is anchored to the same screen curve the dome itself
  // renders at (skyScreenTarget), not raw skyE × exposure: the authored
  // exposure curve falls faster over the morning than sky illuminance rises,
  // so the raw product made a deck-lit fog bank BRIGHTER at 07:00 than at
  // noon (inverted arc, dark noon fog under overcast). Anchoring to the
  // dome's own brightness keeps bank and sky in one tonal world; the deck
  // absorption term is what makes overcast/storm fog genuinely gloomier.
  const fogSkyScreen = 0.42 * skyScreenTarget * (1 - 0.35 * wx.sunDim);
  const fogDayScreen: [number, number, number] = [
    fogSunTint[0] * sunOnFog * FOG_SCATTER * exposureTarget + FOG_SKY_TINT[0] * fogSkyScreen,
    fogSunTint[1] * sunOnFog * FOG_SCATTER * exposureTarget + FOG_SKY_TINT[1] * fogSkyScreen,
    fogSunTint[2] * sunOnFog * FOG_SCATTER * exposureTarget + FOG_SKY_TINT[2] * fogSkyScreen,
  ];
  const fogNightScreen = 0.028 + 0.045 * moonGlowC; // authored night level
  const FOG_NIGHT_TINT: [number, number, number] = [0.82, 0.88, 1.0];
  const fogLum: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const night = fogNightScreen * FOG_NIGHT_TINT[i];
    fogLum[i] = (night + (fogDayScreen[i] - night) * skyFade) / exposureTarget;
  }
  // Looking INTO the light: the forward-scatter lobe throws the source's OWN
  // radiance (and colour) at the viewer — this term is the entire sunset-glow
  // read: at low sun it is small in absolute terms but red and comparable to
  // the collapsed neutral side, so a backlit bank glows warm while the
  // frontlit side of the same bank stays cool grey. The aerial shader blends
  // fogLum→fogSunLum by the view/sun angle. Exposure-anchored on both ends,
  // so the envelope holds by construction (the test asserts both in range).
  const FOG_FORWARD = 0.09; // effective phase gain / π for the sun-side lobe
  const fogSunLum: [number, number, number] = [
    fogLum[0] + (sunColor[0] * sunIntensity + MOONLIGHT[0] * moonIntensity * 2) * FOG_FORWARD,
    fogLum[1] + (sunColor[1] * sunIntensity + MOONLIGHT[1] * moonIntensity * 2) * FOG_FORWARD,
    fogLum[2] + (sunColor[2] * sunIntensity + MOONLIGHT[2] * moonIntensity * 2) * FOG_FORWARD,
  ];

  // Cloud edge glow (silver lining, research §8.1): lit by the sun when it
  // is up, else by Masser. Screen-anchored and small — it lands only on the
  // band-passed cloud edges near the glow direction.
  const sunGlow = smoothstep(-4, 2, altDeg);
  const glowFromMoon = (1 - sunGlow) * moonGlowC;
  const glowScreen = 0.85 * sunGlow + 0.12 * glowFromMoon;
  const glowTintDay: [number, number, number] = [1, 0.92 - 0.25 * cloudWarmth, 0.8 - 0.35 * cloudWarmth];
  const glowTint = mix3(MOONLIGHT, glowTintDay, sunGlow);
  const glowSrc = sunGlow >= glowFromMoon ? sun.direction : masser.direction;
  const cloudGlowDir: [number, number, number] = [glowSrc.x, glowSrc.y, glowSrc.z];
  const cloudGlowCol: [number, number, number] = [
    (glowTint[0] * glowScreen) / exposureTarget,
    (glowTint[1] * glowScreen) / exposureTarget,
    (glowTint[2] * glowScreen) / exposureTarget,
  ];

  // (The sunrise/sunset cloud colouring — owner round 3, research §9.2 — is
  // computed above the fog block since round 4, because fog is lit by the
  // same reddened light. Clouds are gold while the sun is a few degrees up,
  // deepening to orange-red at the horizon, with high cirrus staying lit
  // for a few degrees of sun depression after the deck greys out; heavy storm
  // decks barely colour — the wx.cloudDark damping.)

  return {
    sun,
    moons,
    sunColor,
    sunIntensity,
    moonColor: MOONLIGHT,
    moonIntensity,
    turbidity,
    rayleigh,
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
    cloudCov: [wx.cloudLow, wx.cloudMid, wx.cloudHigh],
    cloudDensity: wx.cloudDensity,
    cloudBright,
    cloudDarkCol,
    sunCastsShadows,
    fogLum,
    fogSunLum,
    cloudGlowDir,
    cloudGlowCol,
    cloudSunsetCol,
    cloudSunsetAmt,
  };
}
