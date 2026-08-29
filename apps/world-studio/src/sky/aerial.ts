import * as THREE from "three";

/**
 * Aerial perspective (module 55 §97): ONE height-modulated exponential
 * inscatter term shared by every material — a tall-scale-height Rayleigh term
 * (blue distance) and a shallow boundary-layer Mie term (warm, forward,
 * g≈0.8) whose density comes from the climate humidity field, plus a bounded
 * ground-mist lump from the mist field. The Blacksmith pattern (research doc
 * §2.2); scene fog stays OFF everywhere so inscatter is never double-counted
 * (the Unreal trap, §2.3). Injected before tone mapping, in linear HDR, on
 * the same lux scale as the light rig.
 */

export interface AerialUniforms {
  uSunDirW: { value: THREE.Vector3 };
  /** Sun/moon radiance available to the haze (colour × lux-scale factor). */
  uHazeSunLight: { value: THREE.Vector3 };
  /** Isotropic sky ambient inscatter (lux-scale colour). */
  uHazeAmbient: { value: THREE.Vector3 };
  uClimateAir: { value: THREE.Texture | null };
  uProvinceExtentM: { value: number };
  /** Rayleigh scattering coefficient per metre (RGB). */
  uBetaR: { value: THREE.Vector3 };
  /** Mie scattering coefficient per metre at humidity 1 inside the boundary layer. */
  uBetaM: { value: number };
  /** Boundary-layer (Mie) scale height, metres — hydrology-meta climateAir. */
  uBoundaryLayerM: { value: number };
  /** Radiation ground-mist strength 0..1 (weather machine, clear-calm-night
   * gated — module 55 §97 regime 1). */
  uMistStrength: { value: number };
  /** Phase 8c: climate-weather raster (R rain amp, G storm, B sea fog). */
  uClimateWeather: { value: THREE.Texture | null };
  /** Advection sea-fog strength 0..1 (regime 2, coasts/estuaries). */
  uAdvectionFog: { value: number };
  /** Cloud-forest whiteout (regime 3): x band centre (runtime m), y band
   * half-width (runtime m), z strength 0..1. */
  uWhiteout: { value: THREE.Vector3 };
  /** Weather fog/haze density multiplier (rain veil, dry haze — regime 4). */
  uWeatherMie: { value: number };
}

/** One shared uniform set: WorldSky writes it, every patched material reads it. */
export function createAerialUniforms(): AerialUniforms {
  return {
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uHazeSunLight: { value: new THREE.Vector3(0, 0, 0) },
    uHazeAmbient: { value: new THREE.Vector3(0, 0, 0) },
    uClimateAir: { value: null },
    uProvinceExtentM: { value: 7373 },
    uBetaR: { value: new THREE.Vector3(6.5e-6, 1.5e-5, 3.5e-5) },
    uBetaM: { value: 9e-5 },
    uBoundaryLayerM: { value: 60 },
    uMistStrength: { value: 0 },
    uClimateWeather: { value: null },
    uAdvectionFog: { value: 0 },
    uWhiteout: { value: new THREE.Vector3(520, 130, 0) },
    uWeatherMie: { value: 0 },
  };
}

export const AERIAL_PARS_GLSL = /* glsl */ `
uniform vec3 uSunDirW;
uniform vec3 uHazeSunLight;
uniform vec3 uHazeAmbient;
uniform sampler2D uClimateAir;
uniform float uProvinceExtentM;
uniform vec3 uBetaR;
uniform float uBetaM;
uniform float uBoundaryLayerM;
uniform float uMistStrength;
uniform sampler2D uClimateWeather;
uniform float uAdvectionFog;
uniform vec3 uWhiteout;
uniform float uWeatherMie;

// Mean of exp(-y/H) over the straight path between two heights.
float esPathDensity(float yA, float yB, float H) {
  yA = max(yA, 0.0); yB = max(yB, 0.0);
  float dy = yB - yA;
  if (abs(dy) < 1.0) return exp(-0.5 * (yA + yB) / H);
  return (H / dy) * (exp(-yA / H) - exp(-yB / H));
}

vec3 esAerialPerspective(vec3 color, vec3 worldPos, vec3 camPos) {
  vec3 dv = worldPos - camPos;
  float dist = max(length(dv), 1.0);
  vec3 vdir = dv / dist;
  vec2 airUv = vec2(worldPos.x / uProvinceExtentM, 1.0 - worldPos.z / uProvinceExtentM);
  vec3 air = texture2D(uClimateAir, airUv).rgb; // r humidity, g mist, b canopy

  float dR = esPathDensity(camPos.y, worldPos.y, 8000.0);
  float dM = esPathDensity(camPos.y, worldPos.y, uBoundaryLayerM) * (0.25 + 1.1 * air.r);
  // The three mist regimes + weather fog (module 55 §97, decision 0032) are
  // ADDED DENSITIES into this one inscatter authority — never a second fog.
  // Regime 1: radiation mist — dawn pooling weighted by the mist raster.
  float dMist = esPathDensity(camPos.y, worldPos.y, 16.0) * air.g * uMistStrength * 14.0;
  // Regime 2: advection sea fog — a shallow marine layer over the coastal /
  // estuary corridors (climate-weather B channel).
  vec3 airW = texture2D(uClimateWeather, airUv).rgb;
  float dAdv = esPathDensity(camPos.y, worldPos.y, 22.0) * airW.b * uAdvectionFog * 125.0;
  // Regime 3: cloud-forest whiteout — a Gaussian elevation band on the
  // montane belt (3-point path sample: endpoints + midpoint).
  float esWg = 0.0;
  if (uWhiteout.z > 0.003) {
    float yMid = 0.5 * (camPos.y + worldPos.y);
    esWg = (exp(-pow((camPos.y - uWhiteout.x) / uWhiteout.y, 2.0))
          + exp(-pow((yMid - uWhiteout.x) / uWhiteout.y, 2.0))
          + exp(-pow((worldPos.y - uWhiteout.x) / uWhiteout.y, 2.0))) / 3.0;
  }
  float dWhite = esWg * uWhiteout.z * 550.0;
  // Regime 4: weather fog/haze — rain veil and dry haze fill the air column
  // (tall 200 m scale height, unlike the shallow boundary-layer Mie).
  float dWx = esPathDensity(camPos.y, worldPos.y, 200.0) * uWeatherMie * 8.0;

  vec3 scatR = uBetaR * (dR * dist);
  float scatM = uBetaM * ((dM + dMist + dAdv + dWhite + dWx) * dist);
  vec3 extinction = scatR + vec3(scatM);
  vec3 transmittance = exp(-extinction);

  float mu = dot(vdir, uSunDirW);
  float phaseR = 0.0597 * (1.0 + mu * mu);
  const float g = 0.8;
  float phaseM = 0.0796 * (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
  vec3 sunScatter = uHazeSunLight
    * (scatR * phaseR + vec3(scatM * phaseM)) / max(extinction, vec3(1e-5));
  vec3 inscatter = (sunScatter + uHazeAmbient) * (1.0 - transmittance);
  return color * transmittance + inscatter;
}
`;

/** Fragment epilogue: runs on gl_FragColor just before tone mapping. */
export const AERIAL_APPLY_GLSL = /* glsl */ `
  gl_FragColor.rgb = esAerialPerspective(gl_FragColor.rgb, vEsWorldPos, cameraPosition);
`;

export const AERIAL_VARYING_PARS = /* glsl */ `
varying vec3 vEsWorldPos;
`;

export const AERIAL_VARYING_VERTEX = /* glsl */ `
  vEsWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

/**
 * Patches a built-in material (e.g. the sea plane) with the aerial term.
 * The terrain splat material embeds the same GLSL itself. Chain-safe: keeps
 * any existing onBeforeCompile (e.g. CSM's).
 */
export function applyAerialPerspective(
  material: THREE.Material,
  uniforms: AerialUniforms,
): void {
  (material as THREE.Material & { fog?: boolean }).fog = false;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${AERIAL_VARYING_PARS}`)
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>\n${AERIAL_VARYING_VERTEX}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${AERIAL_VARYING_PARS}\n${AERIAL_PARS_GLSL}`)
      .replace("#include <tonemapping_fragment>", `${AERIAL_APPLY_GLSL}\n#include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => "es-aerial";
  material.needsUpdate = true;
}
