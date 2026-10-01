import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import * as TSL from "three/tsl";
import type { AerialUniforms, UniformOf } from "./sky/aerial";
import { sel, type TslNode } from "@elder-souls/game-core/render/nodes/materialNodes";
import { applyShoreWetness } from "./water/groundWetness";

// TSL builders typed loosely (standard 0111 §1: the chained typings are too
// deep for tsc to check usefully).
type LooseFn = (...args: TslNode[]) => TslNode;
const {
  Fn, If, abs, clamp, float, floor, fract, int, ivec2, length, mix, normalize, pow, sign, smoothstep,
  texture, textureLoad, uniform, uniformArray, uv, vec2, vec3, vec4,
} = TSL as unknown as Record<string, LooseFn>;
const { cameraPosition, cameraViewMatrix, positionWorld } = TSL as unknown as Record<string, TslNode>;

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
 * The splat is a TSL node graph on a MeshStandardNodeMaterial (decision
 * 0111): `colorNode` is the splat albedo, `normalNode` the province
 * gradient-map normal (with the cliff relief), and lighting, cascaded
 * shadows, IBL, the scene's aerial fog node and tone mapping are three.js's
 * own, so the terrain is lit by the same sun, sky and exposure as
 * everything else in the scene (module 55 §96).
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
  /** Province slope-gradient texture node (`.value` swaps the texture). */
  uGrad: UniformOf<THREE.Texture>;
  uVerticalScale: UniformOf<number>;
  uTintStrength: UniformOf<number>;
  /** Canopy sky-visibility darkening strength (module 55 §96), 0..1. */
  uCanopyStrength: UniformOf<number>;
}

/** Signed-sqrt gradient decode (see export_gradients); must match
 * export_web_chunks.GRADIENT_CLAMP. */
const GRADIENT_CLAMP = 8.0;

/** Builds the splat material. The caller owns disposal of the material and of
 * `material.userData.tex` (the albedo array texture) when
 * `material.userData.ownsTex` is true; a material given a shared array borrows
 * it and disposes nothing. Live-tunable uniforms (TSL uniform nodes: write
 * `.value`) are exposed on `material.userData.groundUniforms`.
 *
 * The surface normal comes from one province-wide slope-gradient texture
 * (`gradTex`, written by `worldgen.export_web_chunks`) scaled by
 * `uVerticalScale`, NOT from vertex normals, which are computed per chunk and
 * disagree along shared edges, painting a visible seam down every chunk
 * border. Chunk geometry therefore carries no normal attribute at all.
 *
 * The aerial haze is the scene's `fogNode` (the material keeps `fog: true`);
 * the aerial uniforms are read here only for the climate-air raster (canopy
 * darkening, shore-wetness shelter) and the province extent. */
/** Ground layer images decode AND resize to the 512² array layer off the main
 * thread (walk 6: drawImage of full-size HTMLImageElements decoded and
 * resampled every layer synchronously, ~1.3 s of main-thread work). Use as
 * `useLoader(THREE.ImageBitmapLoader, urls, groundLayerBitmaps)`; every
 * caller passes the same options so useLoader's cache is shared. */
export const GROUND_LAYER_SIZE = 512;
export function groundLayerBitmaps(loader: THREE.Loader): void {
  (loader as THREE.ImageBitmapLoader).setOptions({
    imageOrientation: "none",
    premultiplyAlpha: "none",
    resizeWidth: GROUND_LAYER_SIZE,
    resizeHeight: GROUND_LAYER_SIZE,
    resizeQuality: "high",
  });
}

export function createGroundMaterial(
  images: CanvasImageSource[],
  cliffNormals: CanvasImageSource[],
  ctrl: THREE.Texture,
  tintTex: THREE.Texture,
  gradTex: THREE.Texture,
  manifest: GroundManifest,
  verticalScale: number,
  aerialUniforms: AerialUniforms,
  options: { shoreWetness?: boolean } = {},
  /** Reuse another material's albedo array instead of building a second one
   * (16d: the apron's two materials share the province's ~40 MB array). The
   * borrower sets `userData.ownsTex = false` and must not dispose it. */
  sharedArrayTexture?: THREE.DataArrayTexture,
): MeshStandardNodeMaterial {
  const n = images.length;
  const size = GROUND_LAYER_SIZE;
  // Cliff materials (Phase 16b item 3): the two library slots the triplanar
  // SIDE projections sample instead of the texel's own ground texture, so a
  // steep face reads as rock or dirt cliff rather than a smeared top texture.
  const cliffRock = manifest.materials.find((m) => m.name === "cliff_rock");
  const cliffDirt = manifest.materials.find((m) => m.name === "cliff_dirt");
  const hasCliff = !!cliffRock && !!cliffDirt;
  const cliffNrmOk = hasCliff && cliffNormals.length === 2;
  // The two cliff NORMAL maps ride in the SAME array texture as the albedos,
  // as layers n and n+1 (one sampler, one allocation).
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
    tex.name = "es-ground-albedo-array";
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
    uGrad: texture(gradTex) as UniformOf<THREE.Texture>,
    uVerticalScale: uniform(verticalScale) as UniformOf<number>,
    uTintStrength: uniform(1.0) as UniformOf<number>,
    uCanopyStrength: uniform(0.7) as UniformOf<number>,
  };
  const uTileM: TslNode = uniformArray(manifest.materials.map((m) => m.tileM), "float");
  const uAvgCol: TslNode = uniformArray(manifest.materials.map((m) =>
    new THREE.Vector3(m.avgColor[0] / 255, m.avgColor[1] / 255, m.avgColor[2] / 255)), "vec3");
  // per-material: 0 = rock cliff, 1 = dirt cliff
  const uCliffOf: TslNode = uniformArray(manifest.materials.map((m) => (m.cliff === "rock" ? 0 : 1)), "float");
  // Under-canopy litter (16f deliverable 10): where a crown covers the
  // ground, bare rock covers read as leaf litter. The mask is the ALPHA of
  // the province tint raster, written by worldgen/compile_scatter; per
  // material, 1 = "blend me toward litter under a canopy".
  const uLitterOf: TslNode = uniformArray(manifest.materials.map(
    (m) => (LITTER_BLEND_IDS.includes(m.id) ? 1 : 0)), "float");
  // albedo array layer indices of the two cliff slots (read by name)
  const cliffLayerRock: TslNode = float(cliffRock?.id ?? 0);
  const cliffLayerDirt: TslNode = float(cliffDirt?.id ?? 0);
  const ctrlSize: TslNode = vec2(img.width, img.height);
  const ctrlMax: TslNode = ivec2(img.width - 1, img.height - 1);
  const provinceUv: TslNode = uv();
  const { uVerticalScale, uTintStrength, uCanopyStrength } = groundUniforms;

  const layer = (uvNode: TslNode, index: TslNode): TslNode => texture(tex!, uvNode).depth(int(index)).rgb;
  // gradient-map normal (signed-sqrt decode, see export_gradients)
  const gradientNormal = (): TslNode => {
    const s = groundUniforms.uGrad.sample(provinceUv).rg.mul(2.0).sub(1.0);
    const g = sign(s).mul(s).mul(s).mul(GRADIENT_CLAMP);
    return normalize(vec3(g.x.negate().mul(uVerticalScale), 1.0, g.y.negate().mul(uVerticalScale)));
  };
  // Triplanar weights: pixel-constant, sharpened so flat ground stays a
  // single cheap top sample (Phase 6b).
  const triWeights = (nrm: TslNode): TslNode => {
    const w = pow(abs(nrm), vec3(6.0));
    return w.div(w.x.add(w.y).add(w.z));
  };
  // The cliff albedo layer this material's steep faces use (rock or dirt).
  const cliffLayerOf = (i: TslNode): TslNode =>
    sel(uCliffOf.element(i).lessThan(0.5), cliffLayerRock, cliffLayerDirt);

  const splatColor = Fn(() => {
    const nrm = gradientNormal().toVar("esNrmW");
    const wp = positionWorld.toVar("esWorldPos");
    const fade = smoothstep(1200.0, 5500.0, length(wp.sub(cameraPosition))).toVar("esFade");
    const w = triWeights(nrm).toVar("esW");
    const litter = texture(tintTex, provinceUv).a.toVar("esLitter");

    // Triplanar sample: planar top projection stretches to smears on
    // near-vertical faces, so the two side projections blend in by the
    // surface normal. Side projections take the CLIFF texture at ITS tile
    // size, not material i: a steep face is a rock or dirt cliff, never the
    // ground texture smeared down it (Phase 16b item 3).
    const triSample = (i: TslNode): TslNode => {
      const c = w.y.mul(layer(wp.xz.div(uTileM.element(i)), i)).toVar();
      const cl = cliffLayerOf(i).toVar();
      const clTile = uTileM.element(int(cl)).toVar();
      If(w.x.greaterThan(0.004), () => { c.addAssign(w.x.mul(layer(wp.zy.div(clTile), cl))); });
      If(w.z.greaterThan(0.004), () => { c.addAssign(w.z.mul(layer(wp.xy.div(clTile), cl))); });
      return c;
    };
    // Far field: the flat average colours. Steep texels average toward the
    // cliff's colour by the same side weight, so distant cliffs stay cliff-
    // coloured once the tiled samples have faded out.
    const avgCol = (i: TslNode): TslNode =>
      mix(uAvgCol.element(int(cliffLayerOf(i))), uAvgCol.element(i), w.y);
    // Under a crown, a bare-rock texel reads as leaf litter: the rock forest
    // floor of Argonia's uplands is covered, not swept (16f deliverable 10).
    // The blend is on the SAMPLE, so the rock still shows through at the
    // mask's soft edge and on the triplanar cliff faces. The litter sample
    // depends only on the fragment, so it is taken once (every per-texel
    // blend weight is at most `litter`, so none applies below 0.001).
    const litterSample = vec3(0.0).toVar("esLitterSample");
    If(litter.greaterThan(0.001), () => { litterSample.assign(triSample(int(LITTER_MATERIAL_ID))); });
    const litterAvg = uAvgCol.element(int(LITTER_MATERIAL_ID));
    const litterMix = (i: TslNode, c: TslNode): TslNode => {
      const k = uLitterOf.element(i).mul(litter);
      return sel(k.greaterThan(0.001), mix(c, litterSample, k), c);
    };
    // near: tiled texture of the texel's two materials; far: their flat
    // average colours (kills distant tiling, Frostbite near/far pattern)
    const texelCol = (tc: TslNode): TslNode => {
      const c = textureLoad(ctrl, clamp(tc, ivec2(0, 0), ctrlMax)).toVar();
      const i0 = int(c.r.mul(255.0).add(0.5)).toVar();
      const i1 = int(c.g.mul(255.0).add(0.5)).toVar();
      const near = mix(litterMix(i0, triSample(i0)), litterMix(i1, triSample(i1)), c.b);
      const far = mix(mix(avgCol(i0), litterAvg, uLitterOf.element(i0).mul(litter)),
        mix(avgCol(i1), litterAvg, uLitterOf.element(i1).mul(litter)), c.b);
      return mix(near, far, fade).toVar();
    };
    const p = provinceUv.mul(ctrlSize).sub(0.5).toVar();
    const p0 = ivec2(floor(p)).toVar();
    const f = fract(p).toVar();
    // ids can't be hardware-filtered: manual bilinear over 4 texels
    const col = mix(
      mix(texelCol(p0), texelCol(p0.add(ivec2(1, 0))), f.x),
      mix(texelCol(p0.add(ivec2(0, 1))), texelCol(p0.add(ivec2(1, 1))), f.x),
      f.y).toVar();
    const macro = texture(ctrl, provinceUv).a;
    col.mulAssign(float(0.84).add(float(0.32).mul(macro)));
    // macro climate tint (coastal/wetness/latitude palette drift),
    // with a live strength control for owner tuning
    col.mulAssign(mix(vec3(1.0), texture(tintTex, provinceUv).rgb.mul(2.0), uTintStrength));
    // canopy sky-visibility darkening (module 55 §96): jungle and rootland
    // floors live in permanent dusk. Tier-1 approximation on albedo.
    const canopy = aerialUniforms.uClimateAir.sample(provinceUv).b;
    col.mulAssign(float(1.0).sub(uCanopyStrength.mul(canopy)));
    return vec4(col, 1.0);
  });

  // The lighting normal, world space: the gradient-map normal, with the
  // cliff relief on the SIDE projections where the set ships cliff normal
  // maps (the gradient map is province-scale and knows nothing of a face's
  // own strata). Tangent frames: X projection (u = world z, v = world y,
  // face +-x), Z projection (u = world x, v = world y, face +-z).
  const litNormal = Fn(() => {
    const nrm = gradientNormal().toVar("esNrmL");
    if (!cliffNrmOk) return nrm;
    const wp = positionWorld.toVar("esWorldPosL");
    const w = triWeights(nrm).toVar("esWL");
    const p = provinceUv.mul(ctrlSize).sub(0.5);
    const ci = int(textureLoad(ctrl, clamp(ivec2(floor(p)), ivec2(0, 0), ctrlMax)).r.mul(255.0).add(0.5)).toVar();
    const clN = cliffLayerOf(ci).toVar();
    const clT = uTileM.element(int(clN)).toVar();
    // its normal map's layer: n for rock, n + 1 for dirt
    const clNrm = float(n).add(sel(clN.equal(cliffLayerRock), 0.0, 1.0)).toVar();
    const sx = sel(nrm.x.lessThan(0.0), -1.0, 1.0).toVar();
    const sz = sel(nrm.z.lessThan(0.0), -1.0, 1.0).toVar();
    const nx = vec3(nrm).toVar();
    const nz = vec3(nrm).toVar();
    If(w.x.greaterThan(0.004), () => {
      const t = layer(wp.zy.div(clT), clNrm).mul(2.0).sub(1.0).toVar();
      nx.assign(normalize(vec3(sx.mul(t.z), t.y, t.x)));
    });
    If(w.z.greaterThan(0.004), () => {
      const t = layer(wp.xy.div(clT), clNrm).mul(2.0).sub(1.0).toVar();
      nz.assign(normalize(vec3(t.x, t.y, sz.mul(t.z))));
    });
    return normalize(w.y.mul(nrm).add(w.x.mul(nx)).add(w.z.mul(nz)));
  });

  const material = new MeshStandardNodeMaterial({ roughness: 1.0, metalness: 0.0 });
  material.name = "es-ground";
  // Fixture lights (render/fixtureLights, installed by the sky's scene walk):
  // a near terrain tile is 117 m across and holds a whole place's lamps, so
  // its fragments read up to 16 per tile, not the default 8.
  material.userData.esFixtureLightsPerObject = 16;
  material.colorNode = splatColor();
  const worldNormal = litNormal();
  material.normalNode = worldNormal.transformDirection(cameraViewMatrix);

  // Shore wetness (8b round 2): darken + polish the swash band so retreating
  // water leaves visibly wet ground. Wraps the splat colour and roughness, so
  // it runs after both are set. Skipped where there is no water to be wet
  // from (the ladder hiding the water layer, the border apron).
  const shoreWetness = options.shoreWetness !== false;
  if (shoreWetness) {
    applyShoreWetness(material, {
      worldPosition: positionWorld,
      worldNormal,
      verticalScale: uVerticalScale,
      climateAir: aerialUniforms.uClimateAir,
      provinceExtent: aerialUniforms.uProvinceExtentM,
    });
  }
  material.userData.patchInfo = {
    compiled: true, nodeMaterial: true, cliffSides: hasCliff, cliffNormalMap: cliffNrmOk, shoreWetness,
  };

  material.userData.tex = tex;
  material.userData.ownsTex = ownsTex;
  material.userData.groundUniforms = groundUniforms;
  return material;
}
