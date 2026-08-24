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
 * and of `material.userData.tex` (the albedo array texture). */
export function createGroundMaterial(
  images: HTMLImageElement[],
  ctrl: THREE.Texture,
  tintTex: THREE.Texture,
  manifest: GroundManifest,
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
  const img = ctrl.image as { width: number; height: number };
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTex: { value: tex },
      uCtrl: { value: ctrl },
      uTint: { value: tintTex },
      uTintStrength: { value: 1.0 },
      uCtrlSize: { value: new THREE.Vector2(img.width, img.height) },
      uTileM: { value: new Float32Array(manifest.materials.map((m) => m.tileM)) },
      uAvgCol: { value: new Float32Array(manifest.materials.flatMap((m) => m.avgColor.map((c) => c / 255))) },
      sunDir: { value: new THREE.Vector3(0.45, 0.8, 0.3).normalize() },
    },
    vertexShader: `
      out vec2 vUv; out vec3 vNormal; out vec3 vWorld;
      void main() {
        vUv = uv; vNormal = normal; vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      #define N ${n}
      uniform highp sampler2DArray uTex;
      uniform sampler2D uCtrl;
      uniform sampler2D uTint;
      uniform float uTintStrength;
      uniform vec2 uCtrlSize;
      uniform float uTileM[N];
      uniform vec3 uAvgCol[N];
      uniform vec3 sunDir;
      in vec2 vUv; in vec3 vNormal; in vec3 vWorld;
      out vec4 outColor;
      // near: tiled texture of the texel's two materials; far: their flat
      // average colours (kills distant tiling, Frostbite near/far pattern)
      vec3 texelCol(ivec2 tc, float fade) {
        vec4 c = texelFetch(uCtrl, clamp(tc, ivec2(0), ivec2(uCtrlSize) - 1), 0);
        int i0 = int(c.r * 255.0 + 0.5);
        int i1 = int(c.g * 255.0 + 0.5);
        vec3 near0 = texture(uTex, vec3(vWorld.xz / uTileM[i0], float(i0))).rgb;
        vec3 near1 = texture(uTex, vec3(vWorld.xz / uTileM[i1], float(i1))).rgb;
        vec3 n = mix(near0, near1, c.b);
        vec3 f = mix(uAvgCol[i0], uAvgCol[i1], c.b);
        return mix(n, f, fade);
      }
      void main() {
        float dist = length(vWorld - cameraPosition);
        float fade = smoothstep(1200.0, 5500.0, dist);
        vec2 p = vUv * uCtrlSize - 0.5;
        ivec2 p0 = ivec2(floor(p));
        vec2 f = fract(p);
        // ids can't be hardware-filtered: manual bilinear over 4 texels
        vec3 col = mix(
          mix(texelCol(p0, fade), texelCol(p0 + ivec2(1, 0), fade), f.x),
          mix(texelCol(p0 + ivec2(0, 1), fade), texelCol(p0 + ivec2(1, 1), fade), f.x),
          f.y);
        float macro = texture(uCtrl, vUv).a;
        col *= 0.84 + 0.32 * macro;
        // macro climate tint (coastal/wetness/latitude palette drift),
        // with a live strength control for owner tuning
        col *= mix(vec3(1.0), texture(uTint, vUv).rgb * 2.0, uTintStrength);
        float light = 0.62 + 0.85 * max(dot(normalize(vNormal), sunDir), 0.0);
        outColor = vec4(col * light, 1.0);
      }`,
  });
  material.userData.tex = tex;
  return material;
}
