import * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import { applyAerialPerspective, type AerialUniforms } from "./sky/aerial";
import { applyShoreWetness } from "./water/groundWetness";

/**
 * Ground-material splat shader (decision 0011), shared between the flyover's
 * whole-province detail mesh and the character mode's chunked terrain.
 *
 * BotW/Terrain3D-style splatting: a texture array indexed by texelFetched ids
 * from the land-cover control map, with manual bilinear blending — constant
 * cost at any material count. Near: tiled albedo of the texel's two
 * materials; far: their flat average colours (kills distant tiling). Meshes
 * supply `uv` spanning the full province control map (u east 0→1, v = 1 at
 * north) and world-space positions in metres.
 *
 * Since Phase 8a the splat rides on MeshStandardMaterial via onBeforeCompile
 * (not a bespoke ShaderMaterial): albedo comes from the splat, the surface
 * normal from the province gradient map, and lighting/shadows (CSM)/IBL/tone
 * mapping are three.js's own — so the terrain is lit by the same sun, sky and
 * exposure as everything else in the scene (module 55 §96).
 */

export interface GroundManifest {
  materials: {
    id: number; name: string; file: string; tileM: number; avgColor: number[];
    /** Tangent-space normal map beside the albedo, when the source ships one. */
    normalFile?: string;
    /** Which cliff texture this material's steep faces use (Phase 16b item 3). */
    cliff?: "rock" | "dirt";
  }[];
}
export interface GroundIndex { default: string; sets: Record<string, { label: string }> }

let groundIndex: GroundIndex | null = null;
const groundCache: Record<string, GroundManifest> = {};
const groundPending: Record<string, Promise<void>> = {};

/** Suspense-style loader for the ground-material set index + manifest.
 * Sets live under textures/ground/<set>/ and are switchable via ?mats=
 * so palette experiments stay A/B-comparable (owner request). */
export function useGroundManifest(base: string, requested?: string): { set: string; manifest: GroundManifest } {
  if (!groundIndex) {
    groundPending.__index ??= fetch(`${base}textures/ground/index.json`)
      .then((r) => r.json()).then((j) => { groundIndex = j; });
    throw groundPending.__index;
  }
  const set = requested && groundIndex.sets[requested] ? requested : groundIndex.default;
  if (!groundCache[set]) {
    groundPending[set] ??= fetch(`${base}textures/ground/${set}/materials.json`)
      .then((r) => r.json()).then((j) => { groundCache[set] = j; });
    throw groundPending[set];
  }
  return { set, manifest: groundCache[set] };
}

/** Land-cover ids of the bare-rock covers the under-canopy litter mask blends
 * away, and of leaf litter itself. Mirrors `worldgen/landcover.py`'s material
 * order (BC_ROCK 23, MOUNTAIN_ROCK 31, DIRT_CLIFF 36, LITTER 21); ids, not
 * names, because a material SET renames the slots (`trop_rocks` is the
 * bmv-v1 name for DIRT_CLIFF). */
export const LITTER_BLEND_IDS = [23, 31, 36];
export const LITTER_MATERIAL_ID = 21;

export interface GroundUniforms {
  uGrad: { value: THREE.Texture };
  uVerticalScale: { value: number };
  uTintStrength: { value: number };
  /** Canopy sky-visibility darkening strength (module 55 §96), 0..1. */
  uCanopyStrength: { value: number };
}

/** Builds the splat material. The caller owns disposal of the material and of
 * `material.userData.tex` (the albedo array texture) when
 * `material.userData.ownsTex` is true; a material given a shared array borrows
 * it and disposes nothing. Live-tunable uniforms
 * are exposed on `material.userData.groundUniforms`.
 *
 * The surface normal comes from one province-wide slope-gradient texture
 * (`gradTex`, written by `worldgen.export_web_chunks`) scaled by
 * `uVerticalScale` — NOT from vertex normals, which are computed per chunk and
 * disagree along shared edges, painting a visible seam down every chunk
 * border. Chunk geometry therefore carries no normal attribute at all. */
export function createGroundMaterial(
  images: HTMLImageElement[],
  cliffNormals: HTMLImageElement[],
  ctrl: THREE.Texture,
  tintTex: THREE.Texture,
  gradTex: THREE.Texture,
  manifest: GroundManifest,
  verticalScale: number,
  aerialUniforms: AerialUniforms,
  csm?: CSM | null,
  options: { shoreWetness?: boolean } = {},
  /** Reuse another material's albedo array instead of building a second one
   * (16d: the apron's two materials share the province's ~40 MB array). The
   * borrower sets `userData.ownsTex = false` and must not dispose it. */
  sharedArrayTexture?: THREE.DataArrayTexture,
): THREE.MeshStandardMaterial {
  const n = images.length;
  const size = 512;
  // Cliff materials (Phase 16b item 3): the two library slots the triplanar
  // SIDE projections sample instead of the texel's own ground texture, so a
  // steep face reads as rock or dirt cliff rather than a smeared top texture.
  const cliffRock = manifest.materials.find((m) => m.name === "cliff_rock");
  const cliffDirt = manifest.materials.find((m) => m.name === "cliff_dirt");
  const hasCliff = !!cliffRock && !!cliffDirt;
  const cliffNrmOk = hasCliff && cliffNormals.length === 2;
  // The two cliff NORMAL maps ride in the SAME array texture as the albedos,
  // as layers n and n+1: a second sampler2DArray for them took the fragment
  // shader to 17 texture units with the flyover's 3 shadow cascades, over the
  // 16 most GPUs allow, so the ground material failed to compile and the
  // flyover drew no terrain at all (owner's console, 2026-09-13). Character
  // mode has 2 cascades, exactly 16, which is why it still worked.
  const layers = n + (cliffNrmOk ? 2 : 0);
  const ownsTex = !sharedArrayTexture;
  let tex = sharedArrayTexture;
  if (!tex) {
    const data = new Uint8Array(size * size * 4 * layers);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g2d = canvas.getContext("2d", { willReadFrequently: true })!;
    [...images, ...(cliffNrmOk ? cliffNormals : [])].forEach((img, i) => {
      g2d.clearRect(0, 0, size, size);
      g2d.drawImage(img, 0, 0, size, size);
      data.set(g2d.getImageData(0, 0, size, size).data, size * size * 4 * i);
    });
    tex = new THREE.DataArrayTexture(data, size, size, layers);
    tex.format = THREE.RGBAFormat;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  }

  // integer ids: never let the GPU filter or mip the control map
  ctrl.minFilter = THREE.NearestFilter;
  ctrl.magFilter = THREE.NearestFilter;
  ctrl.generateMipmaps = false;
  ctrl.colorSpace = THREE.NoColorSpace;
  tintTex.colorSpace = THREE.NoColorSpace;
  gradTex.colorSpace = THREE.NoColorSpace;
  gradTex.wrapS = gradTex.wrapT = THREE.ClampToEdgeWrapping;
  const img = ctrl.image as { width: number; height: number };

  const groundUniforms: GroundUniforms = {
    uGrad: { value: gradTex },
    uVerticalScale: { value: verticalScale },
    uTintStrength: { value: 1.0 },
    uCanopyStrength: { value: 0.7 },
  };
  const staticUniforms = {
    uTex: { value: tex },
    uCtrl: { value: ctrl },
    uTint: { value: tintTex },
    uGradClamp: { value: 8.0 }, // must match export_web_chunks.GRADIENT_CLAMP (signed-sqrt encoding)
    uCtrlSize: { value: new THREE.Vector2(img.width, img.height) },
    uTileM: { value: new Float32Array(manifest.materials.map((m) => m.tileM)) },
    uAvgCol: { value: new Float32Array(manifest.materials.flatMap((m) => m.avgColor.map((c) => c / 255))) },
    // per-material: 0 = rock cliff, 1 = dirt cliff
    uCliffOf: { value: new Float32Array(manifest.materials.map((m) => (m.cliff === "rock" ? 0 : 1))) },
    // albedo array layer indices of the two cliff slots (read by name)
    uCliffLayer: { value: new THREE.Vector2(cliffRock?.id ?? 0, cliffDirt?.id ?? 0) },
    uCliffNrmBase: { value: n },   // layer of the first cliff normal map in uTex (rock; dirt follows)
    // Under-canopy litter (16f deliverable 10): where a crown covers the
    // ground, bare rock covers read as leaf litter. The mask is the ALPHA of
    // the province tint raster, written by worldgen/compile_scatter; per
    // material, 1 = "blend me toward litter under a canopy".
    uLitterOf: { value: new Float32Array(manifest.materials.map(
      (m) => (LITTER_BLEND_IDS.includes(m.id) ? 1 : 0))) },
    uLitterLayer: { value: LITTER_MATERIAL_ID },
  };

  const material = new THREE.MeshStandardMaterial({ roughness: 1.0, metalness: 0.0 });

  // CSM must install its hook first so the splat patch can chain after it.
  csm?.setupMaterial(material);
  const csmHook = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    csmHook?.call(material, shader, renderer);
    Object.assign(shader.uniforms, staticUniforms, groundUniforms);
    material.userData.patchInfo = { compiled: true };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
varying vec2 vProvinceUv;
uniform sampler2D uGrad;
uniform float uGradClamp;
uniform float uVerticalScale;`,
      )
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvProvinceUv = uv;")
      // Chunk geometry has no normal attribute (per-chunk normals seam at
      // borders) — derive the vertex normal from the province gradient map so
      // vNormal/transformedNormal and the shadow-projection path stay finite
      // (a zero attribute normal would normalize to NaN and black the mesh).
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
vec2 esVS = texture2D(uGrad, uv).rg * 2.0 - 1.0;
vec2 esVG = sign(esVS) * esVS * esVS * uGradClamp;
vec3 objectNormal = normalize(vec3(-esVG.x * uVerticalScale, 1.0, -esVG.y * uVerticalScale));`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
#define ES_N ${n}
varying vec2 vProvinceUv;
uniform highp sampler2DArray uTex;
uniform sampler2D uCtrl;
uniform sampler2D uTint;
uniform sampler2D uGrad;
uniform float uVerticalScale;
uniform float uGradClamp;
uniform float uTintStrength;
uniform float uCanopyStrength;
uniform vec2 uCtrlSize;
uniform float uTileM[ES_N];
uniform vec3 uAvgCol[ES_N];
uniform float uCliffOf[ES_N];
uniform vec2 uCliffLayer;
uniform float uLitterOf[ES_N];
uniform float uLitterLayer;
float esLitter;   // under-canopy litter coverage at this fragment (0..1)
${cliffNrmOk ? "#define ES_CLIFF_NRM\nuniform float uCliffNrmBase;" : ""}
vec3 esNrmW; // world-space gradient-map normal, shared by splat + lighting

// The cliff albedo layer this material's steep faces use (rock or dirt).
float esCliffLayer(int i) {
  return uCliffOf[i] < 0.5 ? uCliffLayer.x : uCliffLayer.y;
}

// Triplanar sample (Phase 6b): planar top projection stretches to smears
// on near-vertical faces, so blend the two side projections in by the
// surface normal. Weights are pixel-constant, sharpened so flat ground
// stays a single cheap top sample.
vec3 esTriSample(int i, vec3 w, vec3 worldPos) {
  vec3 c = w.y * texture(uTex, vec3(worldPos.xz / uTileM[i], float(i))).rgb;
  // Side projections take the CLIFF texture at ITS tile size, not material i:
  // a steep face is a rock or dirt cliff, never the ground texture smeared
  // down it (Phase 16b item 3).
  float esCl = esCliffLayer(i);
  float esClTile = uTileM[int(esCl)];
  if (w.x > 0.004) c += w.x * texture(uTex, vec3(worldPos.zy / esClTile, esCl)).rgb;
  if (w.z > 0.004) c += w.z * texture(uTex, vec3(worldPos.xy / esClTile, esCl)).rgb;
  return c;
}
// Far field: the flat average colours. Steep texels average toward the
// cliff's colour by the same side weight, so distant cliffs stay cliff-
// coloured once the tiled samples have faded out.
vec3 esAvgCol(int i, vec3 w) {
  return mix(uAvgCol[int(esCliffLayer(i))], uAvgCol[i], w.y);
}
// near: tiled texture of the texel's two materials; far: their flat
// average colours (kills distant tiling, Frostbite near/far pattern)
// Under a crown, a bare-rock texel reads as leaf litter: the rock forest
// floor of Argonia's uplands is covered, not swept (16f deliverable 10).
// The blend is on the SAMPLE, so the rock still shows through at the mask's
// soft edge and on the triplanar cliff faces.
vec3 esLitterMix(int i, vec3 c, vec3 w, vec3 worldPos) {
  float k = uLitterOf[i] * esLitter;
  if (k <= 0.001) return c;
  return mix(c, esTriSample(int(uLitterLayer), w, worldPos), k);
}
vec3 esTexelCol(ivec2 tc, float fade, vec3 w, vec3 worldPos) {
  vec4 c = texelFetch(uCtrl, clamp(tc, ivec2(0), ivec2(uCtrlSize) - 1), 0);
  int i0 = int(c.r * 255.0 + 0.5);
  int i1 = int(c.g * 255.0 + 0.5);
  vec3 near_ = mix(esLitterMix(i0, esTriSample(i0, w, worldPos), w, worldPos),
                   esLitterMix(i1, esTriSample(i1, w, worldPos), w, worldPos), c.b);
  vec3 far_ = mix(mix(esAvgCol(i0, w), uAvgCol[int(uLitterLayer)], uLitterOf[i0] * esLitter),
                  mix(esAvgCol(i1, w), uAvgCol[int(uLitterLayer)], uLitterOf[i1] * esLitter), c.b);
  return mix(near_, far_, fade);
}`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
{
  // gradient-map normal (signed-sqrt decode, see export_gradients) — computed
  // here because the triplanar weights need it before the lighting does
  vec2 esS = texture2D(uGrad, vProvinceUv).rg * 2.0 - 1.0;
  vec2 esG = sign(esS) * esS * esS * uGradClamp;
  esNrmW = normalize(vec3(-esG.x * uVerticalScale, 1.0, -esG.y * uVerticalScale));
  float esDist = length(vEsWorldPos - cameraPosition);
  float esFade = smoothstep(1200.0, 5500.0, esDist);
  vec3 esW = pow(abs(esNrmW), vec3(6.0));
  esW /= (esW.x + esW.y + esW.z);
  esLitter = texture2D(uTint, vProvinceUv).a;
  vec2 esP = vProvinceUv * uCtrlSize - 0.5;
  ivec2 esP0 = ivec2(floor(esP));
  vec2 esF = fract(esP);
  // ids can't be hardware-filtered: manual bilinear over 4 texels
  vec3 esCol = mix(
    mix(esTexelCol(esP0, esFade, esW, vEsWorldPos), esTexelCol(esP0 + ivec2(1, 0), esFade, esW, vEsWorldPos), esF.x),
    mix(esTexelCol(esP0 + ivec2(0, 1), esFade, esW, vEsWorldPos), esTexelCol(esP0 + ivec2(1, 1), esFade, esW, vEsWorldPos), esF.x),
    esF.y);
  float esMacro = texture2D(uCtrl, vProvinceUv).a;
  esCol *= 0.84 + 0.32 * esMacro;
  // macro climate tint (coastal/wetness/latitude palette drift),
  // with a live strength control for owner tuning
  esCol *= mix(vec3(1.0), texture2D(uTint, vProvinceUv).rgb * 2.0, uTintStrength);
  // canopy sky-visibility darkening (module 55 §96): jungle and rootland
  // floors live in permanent dusk. Tier-1 approximation on albedo — the
  // compiled per-chunk occlusion raster refines this in later phases.
  float esCanopy = texture2D(uClimateAir, vProvinceUv).b;
  esCol *= 1.0 - uCanopyStrength * esCanopy;
  diffuseColor.rgb = esCol;
#ifdef ES_CLIFF_NRM
  // Cliff relief: the gradient map is province-scale and knows nothing of a
  // face's own strata, so perturb the normal on the SIDE projections with the
  // cliff normal map. Tangent frames: X projection (u = world z, v = world y,
  // face +-x), Z projection (u = world x, v = world y, face +-z).
  {
    ivec2 esCtc = clamp(ivec2(floor(esP)), ivec2(0), ivec2(uCtrlSize) - 1);
    int esCi = int(texelFetch(uCtrl, esCtc, 0).r * 255.0 + 0.5);
    float esClN = esCliffLayer(esCi);
    float esClT = uTileM[int(esClN)];
    float esClNrm = uCliffNrmBase + (esClN == uCliffLayer.x ? 0.0 : 1.0);   // its normal map's layer
    float esSx = esNrmW.x < 0.0 ? -1.0 : 1.0;
    float esSz = esNrmW.z < 0.0 ? -1.0 : 1.0;
    vec3 esNx = esNrmW;
    vec3 esNz = esNrmW;
    if (esW.x > 0.004) {
      vec3 t = texture(uTex, vec3(vEsWorldPos.zy / esClT, esClNrm)).rgb * 2.0 - 1.0;
      esNx = normalize(vec3(esSx * t.z, t.y, t.x));
    }
    if (esW.z > 0.004) {
      vec3 t = texture(uTex, vec3(vEsWorldPos.xy / esClT, esClNrm)).rgb * 2.0 - 1.0;
      esNz = normalize(vec3(t.x, t.y, esSz * t.z));
    }
    esNrmW = normalize(esW.y * esNrmW + esW.x * esNx + esW.z * esNz);
  }
#endif
}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
vec3 normal = normalize((viewMatrix * vec4(esNrmW, 0.0)).xyz);
vec3 nonPerturbedNormal = normal;`,
      );
    Object.assign(material.userData.patchInfo, {
      vertexNormal: shader.vertexShader.includes("esVG"),
      fragSplat: shader.fragmentShader.includes("esTexelCol"),
      fragNormal: shader.fragmentShader.includes("nonPerturbedNormal = normal;"),
      cliffSides: hasCliff,
      cliffNormalMap: cliffNrmOk,
      usesCsm: !!material.defines?.USE_CSM,
    });
  };

  // Shore wetness (8b round 2): darken + polish the swash band so retreating
  // water leaves visibly wet ground. Chains between splat and aerial. It
  // costs four texture units; skipped while the ladder hides the water layer
  // (no water to be wet from), which keeps the fragment shader well under
  // the 16-unit limit: 4 splat + 3 climate + 3 shadow cascades.
  if (options.shoreWetness !== false) applyShoreWetness(material);
  // The aerial term chains after the splat patch (it also declares
  // uClimateAir + vEsWorldPos, which the splat code above uses).
  applyAerialPerspective(material, aerialUniforms);
  // The key must name EVERY option that changes the shader: a material built
  // without shore wetness given the wet program's texture slots drew nothing
  // ("two textures of different types use the same sampler location", the
  // apron's first mount, 16d).
  material.customProgramCacheKey = () =>
    `es-ground-${n}-${cliffNrmOk ? 1 : 0}-${options.shoreWetness !== false ? "wet" : "dry"}`;

  material.userData.tex = tex;
  material.userData.ownsTex = ownsTex;
  material.userData.groundUniforms = groundUniforms;
  return material;
}
