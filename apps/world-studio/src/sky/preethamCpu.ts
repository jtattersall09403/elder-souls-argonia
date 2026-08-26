/**
 * CPU transcription of three's Sky addon (Preetham) fragment/vertex math —
 * clouds and sun disc OFF, exactly the configuration WorldSky bakes and
 * draws. Purpose: NUMERIC probing of on-screen sky brightness across the
 * whole day (lightRig.test.ts "screen-luminance envelope"), so whiteouts and
 * black gaps are caught by `npm test`, not by the owner's eyes (rounds 2–5
 * all found exposure-vs-dome divergence visually; this closes that loop).
 * Keep in lockstep with node_modules/three/examples/jsm/objects/Sky.js.
 */

export type Vec3 = [number, number, number];

const TOTAL_RAYLEIGH: Vec3 = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST: Vec3 = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000.0;
const RAYLEIGH_ZENITH_LENGTH = 8.4e3;
const MIE_ZENITH_LENGTH = 1.25e3;
const THREE_OVER_SIXTEENPI = 0.05968310365946075;
const ONE_OVER_FOURPI = 0.07957747154594767;

function sunIntensityOf(zenithAngleCos: number): number {
  const z = Math.min(1, Math.max(-1, zenithAngleCos));
  return EE * Math.max(0, 1 - Math.exp(-((CUTOFF_ANGLE - Math.acos(z)) / STEEPNESS)));
}

function totalMie(turbidity: number): Vec3 {
  const c = 0.2 * turbidity * 10e-18;
  return [0.434 * c * MIE_CONST[0], 0.434 * c * MIE_CONST[1], 0.434 * c * MIE_CONST[2]];
}

/** Relative-HDR sky colour for a view direction (unit) and sun direction
 * (unit), matching the shader's `texColor` before WorldSky's patch. */
export function preethamSky(
  dir: Vec3,
  sunDir: Vec3,
  turbidity: number,
  rayleigh: number,
  mieCoefficient: number,
  mieDirectionalG: number,
): Vec3 {
  // ---- vertex stage ----
  const sunE = sunIntensityOf(sunDir[1]);
  // vSunfade uses the un-normalised sunPosition.y; WorldSky passes a UNIT
  // direction, so y/450000 ≈ 0 and sunfade ≈ exp(y) clamps near ~1 for y>0.
  const sunfade = 1.0 - Math.min(1, Math.max(0, 1 - Math.exp(sunDir[1] / 450000)));
  const rayleighCoefficient = rayleigh - 1.0 * (1.0 - sunfade);
  const betaR: Vec3 = [
    TOTAL_RAYLEIGH[0] * rayleighCoefficient,
    TOTAL_RAYLEIGH[1] * rayleighCoefficient,
    TOTAL_RAYLEIGH[2] * rayleighCoefficient,
  ];
  const tm = totalMie(turbidity);
  const betaM: Vec3 = [tm[0] * mieCoefficient, tm[1] * mieCoefficient, tm[2] * mieCoefficient];

  // ---- fragment stage ----
  const zenithAngle = Math.acos(Math.max(0, dir[1]));
  const inv =
    1.0 /
    (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH_LENGTH * inv;
  const sM = MIE_ZENITH_LENGTH * inv;

  const fex: Vec3 = [
    Math.exp(-(betaR[0] * sR + betaM[0] * sM)),
    Math.exp(-(betaR[1] * sR + betaM[1] * sM)),
    Math.exp(-(betaR[2] * sR + betaM[2] * sM)),
  ];

  const cosTheta = dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2];
  const c5 = cosTheta * 0.5 + 0.5;
  const rPhase = THREE_OVER_SIXTEENPI * (1.0 + c5 * c5);
  const g = mieDirectionalG;
  const g2 = g * g;
  const mPhase = ONE_OVER_FOURPI * ((1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5));

  const lin: Vec3 = [0, 0, 0];
  const sunsetMix = Math.min(1, Math.max(0, Math.pow(1.0 - sunDir[1], 5.0)));
  for (let i = 0; i < 3; i++) {
    const betaTheta = betaR[i] * rPhase + betaM[i] * mPhase;
    const ratio = betaTheta / (betaR[i] + betaM[i]);
    const a = Math.pow(sunE * ratio * (1 - fex[i]), 1.5);
    const b = Math.pow(sunE * ratio * fex[i], 0.5);
    lin[i] = a * (1 - sunsetMix + sunsetMix * b);
  }

  const l0: Vec3 = [0.1 * fex[0], 0.1 * fex[1], 0.1 * fex[2]]; // sun disc off
  return [
    (lin[0] + l0[0]) * 0.04 + 0.0,
    (lin[1] + l0[1]) * 0.04 + 0.0003,
    (lin[2] + l0[2]) * 0.04 + 0.00075,
  ];
}
