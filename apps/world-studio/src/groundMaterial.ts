import * as THREE from "three";

/**
 * Ground-material splat shader (decision 0011), shared between the flyover's
 * whole-province detail mesh and the character mode's chunked terrain.
 *
 * BotW/Terrain3D-style rendering: a texture array indexed by texelFetched ids
 * from the land-cover control map, with manual bilinear blending — constant
 * cost at any material count. Near: tiled albedo of the texel's two
 * materials; far: their flat average colours (kills distant tiling). Meshes
 * supply `uv` spanning the full province control map (u east 0→1, v = 1 at
 * north) and world-space positions in metres.
 */

export interface GroundManifest {
  materials: { id: number; name: string; file: string; tileM: number; avgColor: number[] }[];
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

/** Builds the splat ShaderMaterial. The caller owns disposal of the material
 * and of `material.userData.tex` (the albedo array texture).
 *
 * Lighting comes from one province-wide slope-gradient texture (`gradTex`,
 * written by `worldgen.export_web_chunks`) scaled by `uVerticalScale` — NOT
 * from vertex normals, which are computed per chunk and disagree along shared
 * edges, painting a visible seam down every chunk border. */
export function createGroundMaterial(
  images: HTMLImageElement[],
  ctrl: THREE.Texture,
  tintTex: THREE.Texture,
  gradTex: THREE.Texture,
  manifest: GroundManifest,
  verticalScale: number,
): THREE.ShaderMaterial {
  const n = images.length;
  const size = 512;
  const data = new Uint8Array(size * size * 4 * n);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g2d = canvas.getContext("2d")!;
  images.forEach((img, i) => {
    g2d.drawImage(img, 0, 0, size, size);
    data.set(g2d.getImageData(0, 0, size, size).data, size * size * 4 * i);
  });
  const tex = new THREE.DataArrayTexture(data, size, size, n);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  // integer ids: never let the GPU filter or mip the control map
  ctrl.minFilter = THREE.NearestFilter;
  ctrl.magFilter = THREE.NearestFilter;
  ctrl.generateMipmaps = false;
  ctrl.colorSpace = THREE.NoColorSpace;
  tintTex.colorSpace = THREE.NoColorSpace;
  gradTex.colorSpace = THREE.NoColorSpace;
  gradTex.wrapS = gradTex.wrapT = THREE.ClampToEdgeWrapping;
  const img = ctrl.image as { width: number; height: number };
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTex: { value: tex },
      uCtrl: { value: ctrl },
      uTint: { value: tintTex },
      uGrad: { value: gradTex },
      uVerticalScale: { value: verticalScale },
      uGradClamp: { value: 8.0 }, // must match export_web_chunks.GRADIENT_CLAMP (signed-sqrt encoding)
      uTintStrength: { value: 1.0 },
      uCtrlSize: { value: new THREE.Vector2(img.width, img.height) },
      uTileM: { value: new Float32Array(manifest.materials.map((m) => m.tileM)) },
      uAvgCol: { value: new Float32Array(manifest.materials.flatMap((m) => m.avgColor.map((c) => c / 255))) },
      sunDir: { value: new THREE.Vector3(0.45, 0.8, 0.3).normalize() },
    },
    vertexShader: `
      out vec2 vUv; out vec3 vWorld;
      void main() {
        vUv = uv; vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      #define N ${n}
      uniform highp sampler2DArray uTex;
      uniform sampler2D uCtrl;
      uniform sampler2D uTint;
      uniform sampler2D uGrad;
      uniform float uVerticalScale;
      uniform float uGradClamp;
      uniform float uTintStrength;
      uniform vec2 uCtrlSize;
      uniform float uTileM[N];
      uniform vec3 uAvgCol[N];
      uniform vec3 sunDir;
      in vec2 vUv; in vec3 vWorld;
      out vec4 outColor;
      // Triplanar sample (Phase 6b): planar top projection stretches to smears
      // on near-vertical faces, so blend the two side projections in by the
      // surface normal. Weights are pixel-constant, sharpened so flat ground
      // stays a single cheap top sample.
      vec3 triSample(int i, vec3 w) {
        vec3 c = w.y * texture(uTex, vec3(vWorld.xz / uTileM[i], float(i))).rgb;
        if (w.x > 0.004) c += w.x * texture(uTex, vec3(vWorld.zy / uTileM[i], float(i))).rgb;
        if (w.z > 0.004) c += w.z * texture(uTex, vec3(vWorld.xy / uTileM[i], float(i))).rgb;
        return c;
      }
      // near: tiled texture of the texel's two materials; far: their flat
      // average colours (kills distant tiling, Frostbite near/far pattern)
      vec3 texelCol(ivec2 tc, float fade, vec3 w) {
        vec4 c = texelFetch(uCtrl, clamp(tc, ivec2(0), ivec2(uCtrlSize) - 1), 0);
        int i0 = int(c.r * 255.0 + 0.5);
        int i1 = int(c.g * 255.0 + 0.5);
        vec3 n = mix(triSample(i0, w), triSample(i1, w), c.b);
        vec3 f = mix(uAvgCol[i0], uAvgCol[i1], c.b);
        return mix(n, f, fade);
      }
      void main() {
        float dist = length(vWorld - cameraPosition);
        float fade = smoothstep(1200.0, 5500.0, dist);
        // surface normal from the province gradient map (shared by lighting);
        // signed-sqrt decode: g = sign(s) * s^2 * clamp (see export_gradients)
        vec2 s = texture(uGrad, vUv).rg * 2.0 - 1.0;
        vec2 g = sign(s) * s * s * uGradClamp;
        vec3 nrm = normalize(vec3(-g.x * uVerticalScale, 1.0, -g.y * uVerticalScale));
        vec3 w = pow(abs(nrm), vec3(6.0));
        w /= (w.x + w.y + w.z);
        vec2 p = vUv * uCtrlSize - 0.5;
        ivec2 p0 = ivec2(floor(p));
        vec2 f = fract(p);
        // ids can't be hardware-filtered: manual bilinear over 4 texels
        vec3 col = mix(
          mix(texelCol(p0, fade, w), texelCol(p0 + ivec2(1, 0), fade, w), f.x),
          mix(texelCol(p0 + ivec2(0, 1), fade, w), texelCol(p0 + ivec2(1, 1), fade, w), f.x),
          f.y);
        float macro = texture(uCtrl, vUv).a;
        col *= 0.84 + 0.32 * macro;
        // macro climate tint (coastal/wetness/latitude palette drift),
        // with a live strength control for owner tuning
        col *= mix(vec3(1.0), texture(uTint, vUv).rgb * 2.0, uTintStrength);
        // continuous lighting: same gradient-map normal as the triplanar blend
        float light = 0.62 + 0.85 * max(dot(nrm, sunDir), 0.0);
        outColor = vec4(col * light, 1.0);
      }`,
  });
  material.userData.tex = tex;
  return material;
}
