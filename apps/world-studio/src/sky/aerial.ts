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
  /** Radiation-mist CONDITION 0..1 (province-wide, clear-calm-night gated —
   * module 55 §97 regime 1). Locality comes per-pixel from the mist raster
   * along the view path, so a misty basin reads from a dry ridge above it
   * (owner round 3: fog volumes are local, conditions are synoptic). */
  uMistStrength: { value: number };
  /** Phase 8c: climate-weather raster (R rain amp, G storm, B sea fog). */
  uClimateWeather: { value: THREE.Texture | null };
  /** Advection sea-fog CONDITION 0..1 (regime 2); coast/estuary locality is
   * the climate-weather B channel along the path. */
  uAdvectionFog: { value: number };
  /** Cloud-forest whiteout (regime 3): x band centre (runtime m), y lower
   * sigma, z upper sigma (runtime m — asymmetric: summits stand ABOVE the
   * cloud), w strength 0..1. Horizontal locality is the climate-vis R mask
   * (cap cloud clings to the massif). */
  uWhiteout: { value: THREE.Vector4 };
  /** Phase 8c round 3: climate-vis raster (R orographic belt mask, G region
   * ambient-visibility extinction beta/0.02). */
  uClimateVis: { value: THREE.Texture | null };
  /** Weather multiplier on the region ambient haze (settled days thinner,
   * humid rainy days thicker). */
  uRegionHaze: { value: number };
  /** Weather fog/haze density multiplier (rain veil, dry haze — regime 4). */
  uWeatherMie: { value: number };
  /** Asymptotic colour of DENSE fog (exposure-anchored, lightRig.fogLum):
   * what the mist regimes fade terrain into. Round 2 — the thin-haze
   * ambient's asymptote is near-black in daylight, which painted black caps
   * on fogged summits and made mist invisible. */
  uFogLum: { value: THREE.Vector3 };
  /** Fog colour looking INTO the light (round 4) — forward-scattered and
   * sun-tinted. Blended against uFogLum by the view/sun angle so banks are
   * warm and bright when backlit, cool and grey when frontlit. */
  uFogSunLum: { value: THREE.Vector3 };
  /** Cap-cloud drift (round 4): metres of noise-space offset, so the belt
   * cloud is a moving lumpy body rather than a static painted band. */
  uWhiteoutDrift: { value: THREE.Vector2 };
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
    uWhiteout: { value: new THREE.Vector4(470, 150, 55, 0) },
    uClimateVis: { value: null },
    uRegionHaze: { value: 0.55 },
    uWeatherMie: { value: 0 },
    uFogLum: { value: new THREE.Vector3(0, 0, 0) },
    uFogSunLum: { value: new THREE.Vector3(0, 0, 0) },
    uWhiteoutDrift: { value: new THREE.Vector2(0, 0) },
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
uniform vec4 uWhiteout;
uniform sampler2D uClimateVis;
uniform float uRegionHaze;
uniform float uWeatherMie;
uniform vec3 uFogLum;
uniform vec3 uFogSunLum;
uniform vec2 uWhiteoutDrift;

// Province bounds fade (owner round 4): the climate rasters are
// ClampToEdge, so every sample taken beyond the province edge repeated that
// edge pixel — which drew the cap-cloud mask as straight stripes running off
// the map all the way to the horizon. Outside the province there is no data,
// so there is no fog: fade to nothing just inside the border.
float esInBounds(vec2 uv) {
  vec2 e = min(uv, vec2(1.0) - uv);
  return smoothstep(-0.015, 0.02, min(e.x, e.y));
}

// Cheap value noise, for breaking the cap cloud into lumps.
float esHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float esNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(esHash2(i), esHash2(i + vec2(1.0, 0.0)), f.x),
             mix(esHash2(i + vec2(0.0, 1.0)), esHash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
/** Cap-cloud lumpiness at a world point: two octaves drifting on the wind,
 * with the height folded in so it is a BODY of cloud rather than a vertical
 * column of paint (owner round 4: "it almost looks like the cloud is painted
 * onto the mountain"). */
float esCloudLump(vec3 p) {
  vec2 q = p.xz * 0.0055 + uWhiteoutDrift;
  float n = 0.62 * esNoise2(q + vec2(p.y * 0.004, 0.0))
          + 0.38 * esNoise2(q * 2.7 + vec2(0.0, p.y * 0.006));
  return clamp(0.25 + 1.7 * n, 0.0, 1.9);
}

// Mean of exp(-y/H) over the straight path between two heights.
float esPathDensity(float yA, float yB, float H) {
  yA = max(yA, 0.0); yB = max(yB, 0.0);
  float dy = yB - yA;
  if (abs(dy) < 1.0) return exp(-0.5 * (yA + yB) / H);
  return (H / dy) * (exp(-yA / H) - exp(-yB / H));
}

// Asymmetric cloud-forest belt profile (world-weather WHITEOUT_BELT twin):
// soft skirt below the centre, sharp top so summits stand above the cloud.
float esBeltBell(float y) {
  float d = y - uWhiteout.x;
  float s = d < 0.0 ? uWhiteout.y : uWhiteout.z;
  return exp(-pow(d / s, 2.0));
}

vec3 esAerialPerspective(vec3 color, vec3 worldPos, vec3 camPos) {
  vec3 dv = worldPos - camPos;
  float dist = max(length(dv), 1.0);
  vec3 vdir = dv / dist;
  // Fog locality (owner round 3): every regime density is sampled at THREE
  // path points (camera / midpoint / fragment, weights 1-2-1) against its
  // climate raster, so fog banks live where their rasters say — a misty
  // basin seen from a dry ridge, a coastal fog bank seen from inland — and
  // never follow the camera around as a province-wide veil.
  vec2 airUv = vec2(worldPos.x / uProvinceExtentM, 1.0 - worldPos.z / uProvinceExtentM);
  vec2 camUv = vec2(camPos.x / uProvinceExtentM, 1.0 - camPos.z / uProvinceExtentM);
  vec2 midUv = 0.5 * (airUv + camUv);
  vec3 air = texture2D(uClimateAir, airUv).rgb; // r humidity, g mist, b canopy
  vec3 airC = texture2D(uClimateAir, camUv).rgb;
  vec3 airM = texture2D(uClimateAir, midUv).rgb;
  vec3 visF = texture2D(uClimateVis, airUv).rgb; // r belt mask, g region extinction
  vec3 visC = texture2D(uClimateVis, camUv).rgb;
  vec3 visM = texture2D(uClimateVis, midUv).rgb;
  // Beyond the province edge the rasters have no data — fade every LOCAL
  // (raster-driven) density out rather than smearing the border pixel to the
  // horizon. The region extinction keeps a floor instead of vanishing, so the
  // beyond-border apron still has air in it.
  float bF = esInBounds(airUv);
  float bC = esInBounds(camUv);
  float bM = esInBounds(midUv);
  visF.r *= bF; visC.r *= bC; visM.r *= bM;
  visF.g *= mix(0.5, 1.0, bF); visC.g *= mix(0.5, 1.0, bC); visM.g *= mix(0.5, 1.0, bM);
  air.g *= bF; airC.g *= bC; airM.g *= bM;

  float dR = esPathDensity(camPos.y, worldPos.y, 8000.0);
  float dM = esPathDensity(camPos.y, worldPos.y, uBoundaryLayerM) * (0.25 + 1.1 * air.r);
  // Region ambient visibility (round 3; module 55 §97 "the renderer and the
  // env query agree"): the authored per-region sightlines rendered as a
  // boundary-layer extinction floor — thick marsh air, crisp mountain air.
  // Confined to the shallow layer, so summit vistas stay long and looking
  // UP out of the murk clears.
  float esRegionExt = (0.25 * visC.g + 0.5 * visM.g + 0.25 * visF.g) * (0.02 / uBetaM);
  dM += esPathDensity(camPos.y, worldPos.y, uBoundaryLayerM) * esRegionExt * uRegionHaze;
  // The three mist regimes + weather fog (module 55 §97, decision 0032) are
  // ADDED DENSITIES into this one inscatter authority — never a second fog.
  // Regime 1: radiation mist — dawn pooling where the mist raster says.
  float esMist3 = 0.25 * airC.g + 0.5 * airM.g + 0.25 * air.g;
  float dMist = esPathDensity(camPos.y, worldPos.y, 16.0) * esMist3 * uMistStrength * 14.0;
  // Regime 2: advection sea fog — a shallow marine layer over the coastal /
  // estuary corridors (climate-weather B channel along the path).
  float esAdv3 = 0.25 * texture2D(uClimateWeather, camUv).b * bC
               + 0.5 * texture2D(uClimateWeather, midUv).b * bM
               + 0.25 * texture2D(uClimateWeather, airUv).b * bF;
  float dAdv = esPathDensity(camPos.y, worldPos.y, 22.0) * esAdv3 * uAdvectionFog * 125.0;
  // Regime 3: cloud-forest whiteout — the asymmetric elevation band, each
  // path point masked by the orographic belt raster (cap cloud clings to
  // the massif; free air at belt altitude over the lowlands is clear).
  float dWhite = 0.0;
  if (uWhiteout.w > 0.003) {
    vec3 pMid = 0.5 * (camPos + worldPos);
    // Round 4: the mask is DILATED (pow < 1) so cap cloud spills off the
    // massif's footprint instead of stopping dead at the terrain silhouette,
    // and each sample is multiplied by a drifting noise lump so the band is
    // a broken, moving cloud body — the two things that made it read as
    // paint on the mountain rather than cloud the summits poke into.
    float esWg = (esBeltBell(camPos.y) * pow(visC.r, 0.6) * esCloudLump(camPos)
                + esBeltBell(pMid.y) * pow(visM.r, 0.6) * esCloudLump(pMid) * 2.0
                + esBeltBell(worldPos.y) * pow(visF.r, 0.6) * esCloudLump(worldPos)) / 4.0;
    dWhite = esWg * uWhiteout.w * 550.0;
  }
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
  // The ambient inscatter colour depends on WHAT is scattering (round 2):
  // clear-air Rayleigh/Mie haze keeps the sky-ambient tint, but cloud-water
  // fog (mist regimes + heavy weather haze) is a bright lit medium — its
  // asymptote is uFogLum (exposure-anchored white-grey by day), never the
  // dim haze ambient that painted fogged summits near-black.
  float scatMFog = uBetaM * ((dMist + dAdv + dWhite + 0.7 * dWx) * dist);
  float fogFrac = clamp(scatMFog / max(dot(extinction, vec3(0.3333)), 1e-5), 0.0, 1.0);
  // Round 4: fog is a strongly FORWARD-scattering medium, so its apparent
  // colour depends on where the light is. Looking toward the sun a bank is
  // bright and takes the sun's colour (gold at sunset); looking away it is a
  // cooler, darker grey. A single flat fog colour is what made every mist,
  // sea fog and cap cloud a white haze regardless of the light — including
  // the sunset case where a backlit bank should be the warmest thing in
  // frame. The mu weighting is broad (no hotspot), and both endpoints are
  // exposure-anchored, so mixing them keeps the screen envelope bounded.
  float esFogFwd = smoothstep(-0.35, 0.95, mu);
  vec3 esFogCol = mix(uFogLum, uFogSunLum, esFogFwd);
  vec3 ambient = mix(uHazeAmbient, esFogCol, fogFrac);
  vec3 inscatter = (sunScatter * (1.0 - 0.85 * fogFrac) + ambient) * (1.0 - transmittance);
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
