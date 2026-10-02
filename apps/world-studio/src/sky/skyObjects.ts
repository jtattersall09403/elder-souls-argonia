/**
 * The sky's GPU objects as plain builders (no React), so WorldSky and the
 * harness scenes (apps/world-studio/src/harness/scenes/sky-*.ts) build the
 * very same materials: the Preetham dome with our twilight grade, moon glow,
 * weather clouds and dome fog march; the star and Serpent layers; the lit
 * moon discs; the sun with its cascaded shadows (CSMShadowNode). TSL node
 * materials throughout (decision 0107, docs/standards/tsl-shaders.md).
 */
import * as THREE from "three";
import { lightHeldOff, setShadowShown } from "@elder-souls/game-core/render/lightSwitch";
import { MeshBasicNodeMaterial, NodeMaterial, PointsNodeMaterial } from "three/webgpu";
import * as TSL_TYPED from "three/tsl";
import { SkyMesh } from "three/examples/jsm/objects/SkyMesh.js";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import { sel, type TslNode } from "@elder-souls/game-core/render/nodes/materialNodes";
import { skyFogNode, type AerialUniforms, type UniformOf } from "./aerial";
import { cloudFieldNodes, type CloudUniforms } from "./cloudField";
import type { LightRig } from "./lightRig";
import catalogue from "../../../../world/sources/sky/star-catalogue.json";
import { sharedUniform } from "@elder-souls/game-core/render/nodes/sharedUniform";
// TSL builders typed loosely (standard 0107 §1: chained TSL typings are too deep for tsc).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  Fn,
  If,
  acos,
  asin,
  cameraPosition,
  clamp,
  degrees,
  dot,
  exp,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  instancedDynamicBufferAttribute,
  length,
  max,
  min,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  screenDPR,
  sin,
  smoothstep,
  sqrt,
  toneMappingExposure,
  uv,
  varying,
  vec2,
  vec3,
  vec4
} = TSL_TYPED as unknown as Record<string, any>;

export const STAR_RADIUS = 28_000;
export const MOON_RADIUS = 26_000;
const DEG = Math.PI / 180;

// ---------- the authored star catalogue ----------

export interface FlatStar {
  ra: number; // radians
  dec: number;
  mag: number;
  /** Density rank 0..1: the star shows when rank ≤ the density uniform.
   * Authored constellation stars are 0 (always shown). */
  rank: number;
}

/** Background-star pool size; the density slider reveals a fraction of it.
 * Owner-locked default (round 8): ×0.5 ≈ 3 300 background stars. */
export const STAR_POOL = 13_200;
export function flattenCatalogue(): FlatStar[] {
  const out: FlatStar[] = [];
  for (const c of catalogue.constellations) {
    const cosDec = Math.max(0.2, Math.cos(c.decDeg * DEG));
    for (const [dRa, dDec, mag] of c.stars as [number, number, number][]) {
      out.push({ ra: (c.raDeg + dRa / cosDec) * DEG, dec: (c.decDeg + dDec) * DEG, mag, rank: 0 });
    }
    const p = (c as { planet?: { dRaDeg: number; dDecDeg: number; magnitude: number } }).planet;
    if (p) {
      out.push({
        ra: (c.raDeg + p.dRaDeg / cosDec) * DEG,
        dec: (c.decDeg + p.dDecDeg) * DEG,
        mag: p.magnitude,
        rank: 0,
      });
    }
  }
  out.push({
    ra: catalogue.poleStar.raDeg * DEG,
    dec: catalogue.poleStar.decDeg * DEG,
    mag: catalogue.poleStar.magnitude,
    rank: 0,
  });
  // Background field (owner round 3, count raised rounds 4–5): the sky
  // between the thirteen authored constellations must not be empty. Faint
  // stars from a SEEDED generator (deterministic — same sky every night),
  // magnitudes below the constellation stars so the authored figures still
  // lead. They share the buffer, so they wheel with the constellations.
  let seed = 0x5eed5;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < STAR_POOL; i++) {
    out.push({
      ra: 2 * Math.PI * rnd(),
      dec: Math.asin(2 * rnd() - 1), // uniform on the sphere
      mag: 2.6 + 2.8 * Math.pow(rnd(), 0.7),
      rank: (i + 1) / STAR_POOL, // density slider reveals in this order
    });
  }
  return out;
}


/** Per-star quad size (device px), luminance, magnitude and density rank. */
export function starAttributes(stars: FlatStar[], devicePixelRatio: number) {
  const size = new Float32Array(stars.length);
  const lum = new Float32Array(stars.length);
  const mag = new Float32Array(stars.length);
  const rank = new Float32Array(stars.length);
  stars.forEach((s, i) => {
    rank[i] = s.rank;
    size[i] = Math.max(1.4, 5.2 - s.mag) * Math.min(2, devicePixelRatio);
    // Bright enough to read as constellations under the night exposures
    // (owner round 2, brightened round 5); day is handled by the staged
    // twilight visibility in the vertex stage.
    lum[i] = 1.5 * Math.pow(10, -0.4 * s.mag);
    mag[i] = s.mag;
  });
  return { size, lum, mag, rank };
}

// ---------- display-referred output under a whole-frame tone map ----------

/*
 * WebGPURenderer tone-maps the whole frame in its output pass (ACES here);
 * there is no per-material `toneMapped = false`. The moons are authored
 * DISPLAY-REFERRED (their value is what the screen shows, before the sRGB
 * encode), so they emit the scene-linear value that the frame's ACES maps
 * back to that display value: three's ACESFilmicToneMapping inverted exactly
 * (output matrix, the RRT+ODT rational fit per channel, input matrix,
 * exposure).
 */
const ACES_IN = new THREE.Matrix3().set(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777,
);
const ACES_OUT = new THREE.Matrix3().set(
  1.60475, -0.10208, -0.00327,
  -0.53108, 1.10813, -0.07276,
  -0.07367, -0.00605, 1.07602,
);
// three's TSL mat3(a..i) is column-major, so these .set() calls (row-major)
// hold the transposes of the literal lists in ToneMappingFunctions.js; the
// matrices themselves are the same.
const ACES_IN_INV = ACES_IN.clone().invert();
const ACES_OUT_INV = ACES_OUT.clone().invert();

/** Inverse of three's RRTAndODTFit for one channel (the positive root). */
export function inverseRrtOdt(y: number): number {
  const A = y * 0.983729 - 1;
  const B = y * 0.983729 * 0.432951 - 0.0245786;
  const C = y * 0.238081 + 0.000090537;
  return (-B - Math.sqrt(Math.max(B * B - 4 * A * C, 0))) / (2 * A);
}

/** CPU twin of `inverseAcesNode` (tests): scene-linear rgb for a display rgb. */
export function inverseAcesFilmic(display: [number, number, number], exposure: number): [number, number, number] {
  const d = new THREE.Vector3(...display).applyMatrix3(ACES_OUT_INV);
  const r = new THREE.Vector3(inverseRrtOdt(d.x), inverseRrtOdt(d.y), inverseRrtOdt(d.z)).applyMatrix3(ACES_IN_INV);
  return [(r.x * 0.6) / exposure, (r.y * 0.6) / exposure, (r.z * 0.6) / exposure];
}

/** m × v as three row dot products: no mat3 node (TSL types mat3 × vec3 as
 * a matrix, which fails to compile). */
const mulMat3 = (m: THREE.Matrix3, v: TslNode): TslNode => {
  const e = m.elements; // column-major: row i is (e[i], e[i+3], e[i+6])
  const row = (i: number) => vec3(e[i], e[i + 3], e[i + 6]);
  return vec3(dot(row(0), v), dot(row(1), v), dot(row(2), v));
};

/** Scene-linear colour that the frame's ACES output maps to `display`. */
export function inverseAcesNode(display: TslNode): TslNode {
  const d = mulMat3(ACES_OUT_INV, vec3(clamp(display, 0, 0.98))).toVar();
  const A = d.mul(0.983729).sub(1);
  const B = d.mul(0.983729 * 0.432951).sub(0.0245786);
  const C = d.mul(0.238081).add(0.000090537);
  const x = B.negate().sub(sqrt(max(B.mul(B).sub(A.mul(C).mul(4)), 0))).div(A.mul(2));
  return mulMat3(ACES_IN_INV, max(x, vec3(0))).mul(0.6).div(toneMappingExposure);
}

// ---------- sky dome (Preetham day + authored night, one node graph) ----------

type U<T> = UniformOf<T>;

export interface SkyExtras {
  uSkyLum: U<number>;
  uSkyFade: U<number>;
  uSunAltDeg: U<number>;
  uNightBoost: U<number>;
  uBeltLum: U<number>;
  uNightZenith: U<THREE.Color>;
  uNightHorizon: U<THREE.Color>;
  uGroundLum: U<THREE.Color>;
  uHorizonLum: U<THREE.Color>;
  uDawnLum: U<number>;
  uDawnDir: U<THREE.Vector2>;
  uTwiGrade: U<number>;
  uMoonGlowDirA: U<THREE.Vector3>;
  uMoonGlowDirB: U<THREE.Vector3>;
  uMoonGlowColA: U<THREE.Color>;
  uMoonGlowColB: U<THREE.Color>;
  uMoonGlowWide: U<THREE.Vector2>;
  uDawnCore: U<THREE.Color>;
  uDawnSpread: U<THREE.Color>;
  uDawnWash: U<THREE.Color>;
  /** Phase 8c weather clouds: colours (exposure-anchored nits, lightRig),
   * silver-lining glow light, lightning. Coverage/shape/scroll live in the
   * SHARED cloud uniforms; fog colours/densities live in the SHARED aerial
   * uniforms (round 5: the dome runs the same fog march as the surfaces). */
  uCloudBright: U<THREE.Color>;
  uCloudDark: U<THREE.Color>;
  uGlowDir: U<THREE.Vector3>;
  uGlowCol: U<THREE.Color>;
  uFlash: U<number>;
  /** Round 3: sunset/sunrise cloud light colour + [deck, cirrus] amounts. */
  uCloudSunset: U<THREE.Color>;
  uCloudSunsetAmt: U<THREE.Vector2>;
}

function createSkyExtras(): SkyExtras {
  return {
    uSkyLum: sharedUniform(16_000),
    uSkyFade: sharedUniform(1),
    uSunAltDeg: sharedUniform(45),
    uNightBoost: sharedUniform(1),
    uBeltLum: sharedUniform(0),
    uNightZenith: sharedUniform(new THREE.Color(0, 0, 0)),
    uNightHorizon: sharedUniform(new THREE.Color(0, 0, 0)),
    uGroundLum: sharedUniform(new THREE.Color(0, 0, 0)),
    uHorizonLum: sharedUniform(new THREE.Color(0, 0, 0)),
    uDawnLum: sharedUniform(0),
    uDawnDir: sharedUniform(new THREE.Vector2(0, 1)),
    uTwiGrade: sharedUniform(0),
    uMoonGlowDirA: sharedUniform(new THREE.Vector3(0, -1, 0)),
    uMoonGlowDirB: sharedUniform(new THREE.Vector3(0, -1, 0)),
    uMoonGlowColA: sharedUniform(new THREE.Color(0, 0, 0)),
    uMoonGlowColB: sharedUniform(new THREE.Color(0, 0, 0)),
    uMoonGlowWide: sharedUniform(new THREE.Vector2(14, 20)),
    uDawnCore: sharedUniform(new THREE.Color(1.0, 0.58, 0.28)),
    uDawnSpread: sharedUniform(new THREE.Color(1.0, 0.45, 0.5)),
    uDawnWash: sharedUniform(new THREE.Color(0.55, 0.35, 0.62)),
    uCloudBright: sharedUniform(new THREE.Color(0, 0, 0)),
    uCloudDark: sharedUniform(new THREE.Color(0, 0, 0)),
    uGlowDir: sharedUniform(new THREE.Vector3(0, 1, 0)),
    uGlowCol: sharedUniform(new THREE.Color(0, 0, 0)),
    uFlash: sharedUniform(0),
    uCloudSunset: sharedUniform(new THREE.Color(0, 0, 0)),
    uCloudSunsetAmt: sharedUniform(new THREE.Vector2(0, 0)),
  };
}

export interface SkyDome {
  sky: SkyMesh;
  extras: SkyExtras;
}

/**
 * The dome: three's SkyMesh (the Preetham model, TSL) with its stock cloud
 * layer off, and our grade/twilight/moon-glow/cloud/fog graph wrapped around
 * its colour. The aerial and cloud uniform objects are SHARED (both domes —
 * main and PMREM bake — and the star layers read the very same nodes).
 */
export function createSkyDome(scale: number, aerial: AerialUniforms, clouds: CloudUniforms): SkyDome {
  const sky = new SkyMesh();
  sky.scale.setScalar(scale);
  sky.cloudCoverage.value = 0; // stock cloud layer stays off — ours below
  const ex = createSkyExtras();
  const field = cloudFieldNodes(clouds);
  const preetham = sky.material.colorNode as TslNode;
  const mat = sky.material;
  // The dome runs its own fog march (skyFogNode); the surface fog node must
  // never haze it a second time.
  mat.fog = false;
  mat.colorNode = Fn(() => {
    const direction = normalize(positionWorld.sub(cameraPosition)).toVar();
    const dy = direction.y;
    // Preetham emits NaN/negatives/INFINITIES at and below the horizon; the
    // PMREM env bake integrates the whole sphere, and one bad texel poisons
    // the env map. The below-horizon half is REPLACED deterministically with
    // a CPU-computed ground-bounce colour, and the above-horizon values are
    // clamped through a NaN-collapsing min/max chain.
    const tc = min(max(vec3(preetham.rgb), vec3(0)), vec3(50)).toVar();
    // Lift the Preetham dome's relative HDR onto the scene's lux scale.
    tc.mulAssign(ex.uSkyLum);
    // TROPICAL TWILIGHT GRADE, part 1 — kill the green (owner 2026-09-10):
    // Preetham's horizon extinction runs yellow-green at low sun. Clamp G back
    // toward the R/B midline, weighted to the horizon; ALWAYS ON and
    // self-limiting. The energy removed is handed back as warm + violet.
    const hzW = pow(float(1).sub(clamp(dy, 0, 1)), 1.5);
    const greenOver = max(tc.g.sub(max(tc.r, tc.b)), 0).mul(hzW).toVar();
    tc.y.subAssign(greenOver);
    tc.addAssign(vec3(0.62, 0.0, 0.55).mul(greenOver));
    // Only the palette WASH below is twilight-gated.
    const greenExcess = greenOver.mul(ex.uTwiGrade).toVar();
    // DIRECTIONAL twilight (research doc §8c): the anti-solar sky runs ~3.5°
    // "later" into dusk than the solar side.
    const azDir = direction.xz;
    const azLen = max(length(azDir), 1e-4);
    const cosAz = clamp(dot(azDir.div(azLen), ex.uDawnDir), -1, 1).toVar();
    const D = ex.uSunAltDeg.negate().toVar();
    const A = float(3.5).mul(float(1).sub(smoothstep(5, 9, D)));
    const altEff = ex.uSunAltDeg.sub(A.mul(float(1).sub(cosAz)).mul(0.5));
    const fade = smoothstep(-9, -1, altEff);
    // Night dome, boosted so its SCREEN brightness is already the night
    // level whenever it shows (uNightBoost).
    const night = ex.uNightZenith
      .add(ex.uNightHorizon.sub(ex.uNightZenith).mul(pow(float(1).sub(clamp(dy, 0, 1)), 3)))
      .mul(ex.uNightBoost);
    tc.assign(mix(night, tc, fade));
    // Earth's shadow (anti-solar dark segment) with the Belt of Venus above,
    // both dissolving by ~7° depression (research §8c).
    const wAnti = max(0, cosAz.negate()).toVar();
    const elevDeg = degrees(asin(clamp(dy, -1, 1))).toVar();
    const shadowIn = smoothstep(0.3, 1.2, D).mul(float(1).sub(smoothstep(5, 7.5, D)));
    const top = D.mul(1.4).toVar();
    const below = float(1).sub(smoothstep(top.sub(2), top.add(1.5), elevDeg));
    tc.mulAssign(float(1).sub(wAnti.mul(shadowIn).mul(below).mul(0.4)));
    const beltR = elevDeg.sub(top).sub(4).div(4);
    const belt = exp(beltR.mul(beltR).negate());
    tc.addAssign(vec3(0.95, 0.45, 0.42).mul(ex.uBeltLum).mul(wAnti).mul(belt));
    // Twilight glow (owner round 3, palette round 6): golden-peach core,
    // coral-pink spread, lavender wash; colours re-rolled per calendar day.
    const az = cosAz.mul(0.5).add(0.5).toVar();
    const hz = pow(float(1).sub(clamp(dy, 0, 1)), 3).toVar();
    tc.addAssign(
      ex.uDawnCore
        .mul(pow(az, 5).mul(1.05))
        .add(ex.uDawnSpread.mul(pow(az, 2).mul(0.55)))
        .add(ex.uDawnWash.mul(0.2))
        .mul(ex.uDawnLum.mul(hz)),
    );
    // TROPICAL TWILIGHT GRADE, part 2 — spend the removed green on the palette.
    tc.addAssign(ex.uDawnSpread.mul(0.8).add(ex.uDawnWash.mul(0.4)).mul(greenExcess.mul(hz)));
    // MOON GLOW (owner 2026-09-10): drawn INTO the dome so the disc covers
    // its centre and the cloud block below composites over it. A tight
    // aerosol aureole plus a wide soft skirt (uMoonGlowWide widens it under
    // thin cloud; thick cloud kills it via the CPU occlusion in the colour).
    const angA = acos(clamp(dot(direction, ex.uMoonGlowDirA), -1, 1));
    const angB = acos(clamp(dot(direction, ex.uMoonGlowDirB), -1, 1));
    const wA = angA.mul(ex.uMoonGlowWide.x);
    const wB = angB.mul(ex.uMoonGlowWide.y);
    const moonGlow = ex.uMoonGlowColA
      .mul(exp(angA.mul(-32)).mul(0.75).add(float(1).div(wA.mul(wA).add(1)).mul(0.4)))
      .add(ex.uMoonGlowColB.mul(exp(angB.mul(-48)).mul(0.55).add(float(1).div(wB.mul(wB).add(1)).mul(0.25))))
      .toVar();
    // A Reinhard knee on this term alone: two full moons close together
    // saturate gracefully instead of clipping.
    tc.addAssign(moonGlow.div(moonGlow.add(1)));
    // Weather cloud layers (Phase 8c round 2): the SHARED cloud field drawn
    // INTO the dome so the PMREM IBL sees the deck. Premultiplied
    // back-to-front over-composite: cirrus, the mid deck (shaded bases,
    // silver lining, squall shelf), then ragged low scud.
    If(
      dy.greaterThan(0.012).and(clouds.uCloudCov.x.add(clouds.uCloudCov.y).add(clouds.uCloudCov.z).greaterThan(0.003)),
      () => {
        const CA = float(0).toVar();
        const CC = vec3(0).toVar();
        // Sunset/sunrise cloud light (round 3): strongest toward the sun's
        // azimuth, a soft rose on the anti-solar side.
        const setCol = ex.uCloudSunset.mul(mix(vec3(0.78, 0.72, 0.95), vec3(1), pow(az, 2))).toVar();
        {
          // high cirrus — thin, bright, catches fire brightest (amt.y)
          const a = field.esCloudHigh(direction).toVar();
          const col = mix(ex.uCloudBright, setCol, ex.uCloudSunsetAmt.y.mul(float(0.35).add(pow(az, 2).mul(0.65))));
          CC.addAssign(col.mul(a.mul(float(1).sub(CA))));
          CA.addAssign(a.mul(float(1).sub(CA)));
        }
        {
          // mid deck
          const mid = field.esCloudMid(direction);
          const a = mid.alpha.toVar();
          const shade = smoothstep(0.45, 0.95, mid.n).toVar();
          const col0 = mix(ex.uCloudBright, ex.uCloudDark, shade);
          const col = mix(
            col0,
            setCol,
            ex.uCloudSunsetAmt.x.mul(float(0.2).add(pow(az, 3).mul(0.8))).mul(float(1).sub(shade.mul(0.65))),
          );
          CC.addAssign(col.mul(a.mul(float(1).sub(CA))));
          // Silver lining (research §8.1): band-pass on the layer alpha,
          // gated by angular proximity to the glow light.
          const edge = smoothstep(0.03, 0.18, a).mul(float(1).sub(smoothstep(0.25, 0.6, a)));
          const toGlow = pow(max(dot(direction, ex.uGlowDir), 0), 6);
          CC.addAssign(ex.uGlowCol.mul(edge.mul(toGlow).mul(float(1).sub(CA))));
          CA.addAssign(a.mul(float(1).sub(CA)));
        }
        {
          // low scud — fast, ragged, storm-dark; a whisper of the sunset
          const a = field.esCloudLow(direction).toVar();
          const col0 = mix(ex.uCloudBright.mul(0.85), ex.uCloudDark, 0.75);
          const col = mix(col0, setCol, ex.uCloudSunsetAmt.x.mul(0.22).mul(pow(az, 3)));
          CC.addAssign(col.mul(a.mul(float(1).sub(CA))));
          CA.addAssign(a.mul(float(1).sub(CA)));
        }
        // lightning glow lives inside the cloud body
        CC.addAssign(ex.uCloudBright.mul(ex.uFlash.mul(3).mul(CA)));
        const hzFade = smoothstep(0.012, 0.09, dy);
        tc.assign(mix(tc, CC.div(max(CA, 1e-4)), CA.mul(hzFade)));
      },
    );
    // Below the horizon (hard branch, not mix(): mix(x, NaN, 0.0) is NaN):
    // a distance-haze band, then the ground-bounce colour for the IBL's deep
    // lower hemisphere.
    If(dy.lessThan(-0.02), () => {
      const toGround = float(1).sub(smoothstep(-0.34, -0.08, dy));
      tc.assign(mix(ex.uHorizonLum, ex.uGroundLum, toGround));
    }).Else(() => {
      tc.assign(mix(ex.uHorizonLum, tc, smoothstep(-0.02, 0.012, dy)));
    });
    // Fog banks on the SKY (round 5): the same regime densities marched
    // along this sky ray, lit by the same derived fog colours.
    tc.assign(skyFogNode(aerial, tc, direction));
    // Stay below the half-float ceiling (65504): the PMREM bake and the
    // frame buffer are HalfFloat targets.
    return vec4(min(tc, vec3(60000)), 1);
  })();
  mat.needsUpdate = true;
  return { sky, extras: ex };
}

const SCALAR_KEYS = ["uSkyLum", "uSkyFade", "uSunAltDeg", "uNightBoost", "uBeltLum", "uDawnLum", "uTwiGrade", "uFlash"] as const;
const OBJECT_KEYS = [
  "uDawnDir", "uMoonGlowDirA", "uMoonGlowDirB", "uMoonGlowColA", "uMoonGlowColB", "uMoonGlowWide",
  "uDawnCore", "uDawnSpread", "uDawnWash", "uCloudBright", "uCloudDark", "uCloudSunset",
  "uCloudSunsetAmt", "uGlowDir", "uGlowCol", "uNightZenith", "uNightHorizon", "uGroundLum", "uHorizonLum",
] as const;

/** Copy the main dome's per-frame values onto the PMREM bake dome (the
 * cloud and aerial uniforms are shared objects: no copy needed). */
export function copySkyUniforms(from: SkyDome, to: SkyDome): void {
  to.sky.turbidity.value = from.sky.turbidity.value;
  to.sky.rayleigh.value = from.sky.rayleigh.value;
  to.sky.mieCoefficient.value = from.sky.mieCoefficient.value;
  to.sky.mieDirectionalG.value = from.sky.mieDirectionalG.value;
  to.sky.sunPosition.value.copy(from.sky.sunPosition.value);
  for (const k of SCALAR_KEYS) to.extras[k].value = from.extras[k].value;
  for (const k of OBJECT_KEYS) (to.extras[k].value as THREE.Vector3).copy(from.extras[k].value as THREE.Vector3);
}

/** Write one frame's light rig into a dome (WorldSky and the harness). */
export function writeDomeFromRig(dome: SkyDome, rig: LightRig, sunDir: THREE.Vector3, flash: number): void {
  const { sky, extras } = dome;
  sky.sunPosition.value.copy(sunDir);
  sky.turbidity.value = rig.turbidity;
  sky.rayleigh.value = rig.rayleigh;
  sky.mieCoefficient.value = rig.mieCoefficient;
  sky.mieDirectionalG.value = rig.mieDirectionalG;
  extras.uSkyLum.value = rig.skyLuminance;
  extras.uSkyFade.value = rig.skyFade;
  extras.uSunAltDeg.value = (rig.sun.altitude * 180) / Math.PI;
  extras.uNightBoost.value = rig.nightBoost;
  extras.uBeltLum.value = rig.beltLum;
  extras.uNightZenith.value.setRGB(...rig.nightZenith);
  extras.uNightHorizon.value.setRGB(...rig.nightHorizon);
  extras.uGroundLum.value.setRGB(...rig.groundBounce);
  extras.uHorizonLum.value.setRGB(...rig.horizonHaze);
  extras.uDawnLum.value = rig.dawnLum;
  extras.uDawnDir.value.set(rig.dawnDir[0], rig.dawnDir[1]);
  extras.uTwiGrade.value = rig.twilightGrade;
  extras.uDawnCore.value.setRGB(...rig.dawnCore);
  extras.uDawnSpread.value.setRGB(...rig.dawnSpread);
  extras.uDawnWash.value.setRGB(...rig.dawnWash);
  extras.uCloudBright.value.setRGB(...rig.cloudBright);
  extras.uCloudDark.value.setRGB(...rig.cloudDarkCol);
  extras.uGlowDir.value.set(...rig.cloudGlowDir);
  extras.uGlowCol.value.setRGB(...rig.cloudGlowCol);
  extras.uFlash.value = flash;
  extras.uCloudSunset.value.setRGB(...rig.cloudSunsetCol);
  extras.uCloudSunsetAmt.value.set(rig.cloudSunsetAmt[0], rig.cloudSunsetAmt[1]);
}

// ---------- star and Serpent layers ----------

export interface StarLayerUniforms {
  uOpacity: U<number>;
  uSunAltDeg: U<number>;
  uStarFrac: U<number>;
  uDawnDir: U<THREE.Vector2>;
  /** Equatorial -> horizontal rotation (perf10 K2): stars are stored once on
   * the celestial sphere; the Serpent, written in horizontal space, keeps identity. */
  uEqToHor: U<THREE.Matrix3>;
}

export interface StarLayer {
  /** Instanced screen-space quads (one per star): WebGPU has no point size. */
  mesh: THREE.Sprite;
  position: THREE.InstancedBufferAttribute;
  uniforms: StarLayerUniforms;
}

/**
 * Stars (additive, lit points) or the Serpent's four "unstars" (dark
 * occluding smudges, normal blend). `size` is in device pixels (the old
 * gl_PointSize), so the quad divides the renderer's DPR back out. Per-star
 * cloud occlusion samples the SAME cloud field the dome draws, in the
 * vertex stage.
 */
const n3 = (x: unknown): TslNode => x as TslNode;

export function createStarLayer(
  kind: "stars" | "serpent",
  attrs: { size: Float32Array; lum: Float32Array; mag?: Float32Array; rank?: Float32Array },
  clouds: CloudUniforms,
): StarLayer {
  const n = attrs.size.length;
  const position = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const aSize = instancedBufferAttribute(new THREE.InstancedBufferAttribute(attrs.size, 1));
  const aLum = instancedBufferAttribute(new THREE.InstancedBufferAttribute(attrs.lum, 1));
  // The Serpent had no magnitude or rank attributes: GLSL read them as 0.
  const aMag = instancedBufferAttribute(new THREE.InstancedBufferAttribute(attrs.mag ?? new Float32Array(n), 1));
  const aRank = instancedBufferAttribute(new THREE.InstancedBufferAttribute(attrs.rank ?? new Float32Array(n), 1));
  const pos = instancedDynamicBufferAttribute(position);
  const uniforms: StarLayerUniforms = {
    uOpacity: sharedUniform(0),
    uSunAltDeg: sharedUniform(45),
    uStarFrac: sharedUniform(kind === "stars" ? 0.5 : 1),
    uDawnDir: sharedUniform(new THREE.Vector2(0, 1)),
    uEqToHor: sharedUniform(new THREE.Matrix3()),
  };
  const hp = n3(uniforms.uEqToHor).mul(vec3(pos));
  const field = cloudFieldNodes(clouds, { vertex: true });
  // Vertex stage: density slider, staged twilight appearance (brighter
  // magnitudes at shallower depressions, anti-solar sky first), per-star
  // cloud occlusion.
  const vLum = varying(
    Fn(() => {
      const density = sel(aRank.lessThanEqual(uniforms.uStarFrac), float(1), float(0));
      const D = uniforms.uSunAltDeg.negate();
      const az = normalize(n3(hp).xz.add(vec2(1e-5, 0)));
      const cosAz = clamp(dot(az, uniforms.uDawnDir), -1, 1);
      const dEff = D.add(float(3.5).mul(float(1).sub(smoothstep(5, 9, D))).mul(float(1).sub(cosAz)).mul(0.5));
      const on = float(3).add(aMag.add(1).mul(2.14));
      const lum = aLum.mul(density).mul(smoothstep(on.sub(2), on, dEff));
      return lum.mul(float(1).sub(field.esCloudAlpha(normalize(hp))));
    })(),
    "vEsStarLum",
  );
  const material = new PointsNodeMaterial();
  material.positionNode = hp;
  material.sizeNode = aSize.div(screenDPR);
  material.sizeAttenuation = false;
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  const d = uv().sub(0.5);
  if (kind === "stars") {
    const falloff = smoothstep(0.5, 0.12, length(d));
    material.colorNode = vec4(vec3(vLum).mul(falloff).mul(uniforms.uOpacity), 1);
    material.blending = THREE.AdditiveBlending;
  } else {
    const falloff = smoothstep(0.5, 0.2, length(d));
    material.colorNode = vec4(vec3(0), falloff.mul(uniforms.uOpacity).mul(vLum));
    material.blending = THREE.NormalBlending;
  }
  const mesh = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  mesh.count = n;
  mesh.frustumCulled = false;
  return { mesh, position, uniforms };
}

// ---------- moons as lit spheres ----------

export interface MoonUniforms {
  uSunDir: U<THREE.Vector3>;
  uTint: U<THREE.Color>;
  uDayDim: U<number>;
}

const esMoonHash = (p: TslNode): TslNode => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
const esMoonNoise = (p: TslNode): TslNode => {
  const i = floor(p).toVar();
  const f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2))).toVar();
  const h = (x: number, y: number, z: number) => esMoonHash(i.add(vec3(x, y, z)));
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z,
  );
};

/**
 * A moon disc (unit sphere, scaled and placed by WorldSky). Real sun
 * direction (even below the local horizon — the moons are in space), so
 * phase and terminator are correct by construction (§95). DISPLAY-REFERRED
 * (owner round 3): the night exposure floor would clip a physically-scaled
 * disc to a flat white circle, so the value is authored in output space and
 * `inverseAcesNode` undoes the frame's tone map. Additive, depth-writing
 * (round 8: stars sit farther out and draw after, so the body occludes them).
 */
export function createMoonMaterial(tint: THREE.Color): { material: NodeMaterial; uniforms: MoonUniforms } {
  const uniforms: MoonUniforms = {
    uSunDir: sharedUniform(new THREE.Vector3(0, 1, 0)),
    uTint: sharedUniform(tint),
    uDayDim: sharedUniform(1),
  };
  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    const n = normalize(positionLocal).toVar();
    // pow > 1 SHARPENS the terminator (round 3: gibbous phases washed out).
    const lit = pow(max(dot(n, uniforms.uSunDir), 0), 1.35);
    // Procedural maria/highlands mottling, stable on the sphere; limb
    // darkening from the view angle so the disc reads as a globe.
    const mar = esMoonNoise(n.mul(3.1)).add(esMoonNoise(n.mul(7.7)).mul(0.5)).add(esMoonNoise(n.mul(16.3)).mul(0.25));
    const pat = float(0.68).add(smoothstep(0.55, 1.15, mar).mul(0.32));
    const view = normalize(cameraPosition.sub(positionWorld));
    const limb = float(0.45).add(pow(max(dot(n, view), 0), 0.6).mul(0.55));
    const display = uniforms.uTint.mul(float(0.005).add(lit.mul(0.68))).mul(pat).mul(limb).mul(uniforms.uDayDim);
    return vec4(inverseAcesNode(display), 1);
  })();
  material.blending = THREE.AdditiveBlending;
  material.transparent = true;
  material.depthWrite = true;
  material.fog = false;
  return { material, uniforms };
}

// ---------- the sun and its cascaded shadows ----------

export interface SunCascadeOptions {
  cascades: number;
  maxFar: number;
  shadowMapSize: number;
}

/**
 * The sun: ONE DirectionalLight whose shadow is a CSMShadowNode (three's
 * node cascades: no material patching, so nothing to re-apply). Same
 * arrangement as the old CSM: practical splits, fade on, light margin 400,
 * shadow near/far 1/2000 (the old CSM defaults), small depth bias plus a
 * normal-offset bias (the old large depth bias pushed shadows off their
 * casters: the ~0.5 m "hovering character" gap, owner round 5).
 */
export function createSunCascades(opts: SunCascadeOptions): { sun: THREE.DirectionalLight; csm: CSMShadowNode } {
  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.name = "sun";
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2000;
  sun.shadow.bias = -6e-5;
  sun.shadow.normalBias = 0.05;
  const csm = new CSMShadowNode(sun, {
    cascades: opts.cascades,
    maxFar: opts.maxFar,
    mode: "practical",
    lightMargin: 400,
  });
  csm.fade = true;
  // Build `normalWorld` at the top of the cascade Fn. Its first use is the
  // cascades' normal bias, inside the per-cascade `If`; a TSL var is emitted
  // where it is first built, so beyond the last cascade the lighting (IBL,
  // hemisphere) read it unassigned: zero on WebGPU, garbage on WebGL, and
  // the two backends split by 6 luma on far terrain (lane L16).
  const setupShadowPosition = csm.setupShadowPosition.bind(csm);
  csm.setupShadowPosition = (builder) => {
    setupShadowPosition(builder);
    (TSL_TYPED.normalWorld as unknown as { toStack(): void }).toStack();
  };
  sun.shadow.shadowNode = csm as unknown as typeof sun.shadow.shadowNode;
  return { sun, csm };
}

/** Aim the sun along `sunDir` (toward the sun) over `focus`, and light it. */
export function aimSun(sun: THREE.DirectionalLight, sunDir: THREE.Vector3, focus: THREE.Vector3, rig: LightRig): void {
  sun.position.copy(focus).addScaledVector(sunDir, 1000);
  sun.target.position.copy(focus);
  sun.target.updateMatrixWorld();
  sun.color.setRGB(...rig.sunColor);
  // castShadow stays true and the sun stays visible: both key every lit program on the node
  // renderer (game-core render/lightSwitch); off is intensity / shadow.intensity
  const held = lightHeldOff(sun);
  sun.intensity = held ? 0 : rig.sunIntensity;
  setShadowShown(sun, rig.sunCastsShadows && !held);
}
