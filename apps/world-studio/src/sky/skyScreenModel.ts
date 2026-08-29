import type { LightRig } from "./lightRig";
import { preethamSky, type Vec3 } from "./preethamCpu";

/**
 * CPU replica of WorldSky's patched dome shader (WorldSky.tsx
 * createSkyDome): Preetham → lux scale → directional twilight night mix →
 * Earth-shadow/Belt → dawn glow → exposure. Powers the screen-luminance
 * envelope test (lightRig.test.ts) that catches whiteouts and black gaps
 * numerically. KEEP IN LOCKSTEP with the shader — a divergence here makes
 * the envelope test lie.
 */

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Screen-linear RGB (pre-tone-mapping, post-exposure) of the sky dome in
 * view direction `dir` (unit, world axes) under `rig`. */
export function domeScreen(rig: LightRig, dir: Vec3): Vec3 {
  const sunDir: Vec3 = [rig.sun.direction.x, rig.sun.direction.y, rig.sun.direction.z];
  const raw = preethamSky(dir, sunDir, rig.turbidity, rig.rayleigh, rig.mieCoefficient, rig.mieDirectionalG);
  const c: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) c[i] = Math.min(Math.max(raw[i], 0), 50) * rig.skyLuminance;

  const altDeg = (rig.sun.altitude * 180) / Math.PI;
  const azLen = Math.max(Math.hypot(dir[0], dir[2]), 1e-4);
  const cosAz = Math.min(1, Math.max(-1, (dir[0] / azLen) * rig.dawnDir[0] + (dir[2] / azLen) * rig.dawnDir[1]));
  const d = -altDeg;
  const A = 3.5 * (1 - smoothstep(5, 9, d));
  const altEff = altDeg - A * (1 - cosAz) * 0.5;
  const fade = smoothstep(-9, -1, altEff);
  const horiz = Math.pow(1 - Math.min(Math.max(dir[1], 0), 1), 3);
  for (let i = 0; i < 3; i++) {
    const night = (rig.nightZenith[i] + (rig.nightHorizon[i] - rig.nightZenith[i]) * horiz) * rig.nightBoost;
    c[i] = night + (c[i] - night) * fade;
  }

  const wAnti = Math.max(0, -cosAz);
  const elevDeg = (Math.asin(Math.min(1, Math.max(-1, dir[1]))) * 180) / Math.PI;
  const shadowIn = smoothstep(0.3, 1.2, d) * (1 - smoothstep(5, 7.5, d));
  const top = 1.4 * d;
  const below = 1 - smoothstep(top - 2, top + 1.5, elevDeg);
  const shadowMul = 1 - 0.4 * wAnti * shadowIn * below;
  const belt = Math.exp(-Math.pow((elevDeg - top - 4) / 4, 2));
  const beltCol: Vec3 = [0.95, 0.45, 0.42];

  const az01 = cosAz * 0.5 + 0.5;
  const dawn: Vec3 = [
    1.0 * Math.pow(az01, 5) * 1.05 + 1.0 * Math.pow(az01, 2) * 0.55 + 0.55 * 0.2,
    0.58 * Math.pow(az01, 5) * 1.05 + 0.45 * Math.pow(az01, 2) * 0.55 + 0.35 * 0.2,
    0.28 * Math.pow(az01, 5) * 1.05 + 0.5 * Math.pow(az01, 2) * 0.55 + 0.62 * 0.2,
  ];
  for (let i = 0; i < 3; i++) {
    c[i] = c[i] * shadowMul + beltCol[i] * rig.beltLum * wAnti * belt + rig.dawnLum * horiz * dawn[i];
  }

  return [c[0] * rig.exposureTarget, c[1] * rig.exposureTarget, c[2] * rig.exposureTarget];
}

/**
 * Screen-luminance range the Phase 8c cloud overlay can reach under `rig`
 * (lightning excluded — a deliberate transient). The dome shader composites
 * cloud pixels strictly between the CPU-anchored uCloudDark and uCloudBright
 * colours, so bounding those bounds the whole cloudy sky — the envelope test
 * does not need to replicate the FBM. Round 2 additions stay bounded the
 * same way: the silver-lining glow adds ≤ cloudGlowCol (asserted in the
 * test), and the camera-in-fog veil / dense-fog inscatter mix the frame
 * toward fogLum, which is exposure-anchored and asserted in-range — a mix
 * of two bounded colours is bounded. KEEP IN LOCKSTEP with the cloud block
 * in WorldSky.createSkyDome.
 */
export function cloudScreenRange(rig: LightRig): [number, number] {
  const lo = Math.min(...rig.cloudDarkCol) * rig.exposureTarget;
  const hi = Math.max(...rig.cloudBright) * rig.exposureTarget;
  return [lo, hi];
}

/** Sample directions for envelope checks: [label, elevation°, Δazimuth° from
 * the sun]. Covers zenith, mid-sky and near-horizon on solar/cross/anti sides. */
export const ENVELOPE_DIRS: [string, number, number][] = [
  ["zenith", 90, 0],
  ["mid-solar", 30, 0],
  ["mid-cross", 30, 90],
  ["mid-anti", 30, 180],
  ["low-solar25", 8, 25],
  ["low-cross", 8, 90],
  ["low-anti", 8, 180],
];

/** Build a unit view dir at elevation° and Δazimuth° from the sun's azimuth. */
export function envelopeDir(rig: LightRig, elevDeg: number, dAzDeg: number): Vec3 {
  const [sx, sz] = rig.dawnDir;
  const dAz = (dAzDeg * Math.PI) / 180;
  const cosE = Math.cos((elevDeg * Math.PI) / 180);
  // Rotate the sun's horizontal azimuth direction by dAz.
  const rx = sx * Math.cos(dAz) - sz * Math.sin(dAz);
  const rz = sx * Math.sin(dAz) + sz * Math.cos(dAz);
  return [rx * cosE, Math.sin((elevDeg * Math.PI) / 180), rz * cosE];
}
