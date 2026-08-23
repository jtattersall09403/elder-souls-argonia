import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { MapControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

/** High-detail terrain patch (Phase 6 refined watershed). */
export interface DetailPatch {
  heights: Float32Array;
  width: number;
  height: number;
  metresPerPixel: number;
  originM: [number, number]; // [x east, z south] of the patch's NW corner
}

/**
 * Province flyover: a preview mesh built straight from the conditioned
 * heightfield with the 2D map canvas draped as its texture. Inspection only —
 * production terrain streaming is Phase 6/14.
 */

const MESH_STEP = 3; // sample every 3rd height pixel for the preview mesh

export interface Fly3DProps {
  heights: Float32Array;
  size: number;            // height grid edge (px)
  metresPerPixel: number;
  textureCanvas: HTMLCanvasElement;
  spawnKm: { x: number; z: number };
  exaggeration: number;
  mode: "fly" | "orbit";
  detail?: DetailPatch | null;
  onPosition?: (xKm: number, zKm: number, altM: number) => void;
}

/** Refined-watershed mesh overlaid on the province mesh (biased up slightly
 * so the coarse terrain doesn't poke through; edge seams are a known pass-1
 * artefact until province-wide refinement). */
function DetailTerrain({ patch, exaggeration }: { patch: DetailPatch; exaggeration: number }) {
  const MESH_STEP_D = 2;
  const geometry = useMemo(() => {
    const { heights, width, height, metresPerPixel, originM } = patch;
    const nx = Math.floor((width - 1) / MESH_STEP_D) + 1;
    const ny = Math.floor((height - 1) / MESH_STEP_D) + 1;
    const pos = new Float32Array(nx * ny * 3);
    const uv = new Float32Array(nx * ny * 2);
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        const i = r * nx + c;
        const px = Math.min(c * MESH_STEP_D, width - 1);
        const py = Math.min(r * MESH_STEP_D, height - 1);
        pos[i * 3] = originM[0] + px * metresPerPixel;
        pos[i * 3 + 1] = heights[py * width + px] * exaggeration + 0.6;
        pos[i * 3 + 2] = originM[1] + py * metresPerPixel;
        uv[i * 2] = px / (width - 1);
        uv[i * 2 + 1] = 1 - py / (height - 1);
      }
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    let j = 0;
    for (let r = 0; r < ny - 1; r++) {
      for (let c = 0; c < nx - 1; c++) {
        const a = r * nx + c;
        idx[j++] = a; idx[j++] = a + nx; idx[j++] = a + 1;
        idx[j++] = a + 1; idx[j++] = a + nx; idx[j++] = a + nx + 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }, [patch, exaggeration]);

  // Ground materials (decision 0011): the land-cover control map compiled by
  // worldgen.landcover picks per-texel material pairs from the global library
  // built by worldgen.build_ground_materials (CC0 + vanilla Skyrim sources).
  // BotW/Terrain3D-style rendering: texture array indexed by texelFetched ids
  // with manual bilinear blending — constant cost at any material count.
  const base = import.meta.env.BASE_URL;
  const manifest = useGroundManifest(base);
  const images = useLoader(THREE.ImageLoader,
    manifest.materials.map((m) => `${base}textures/ground/${m.file}`));
  const ctrl = useLoader(THREE.TextureLoader, `${base}province/basin/ground-control.png`);
  const material = useMemo(() => {
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
    const img = ctrl.image as { width: number; height: number };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uTex: { value: tex },
        uCtrl: { value: ctrl },
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
          float light = 0.62 + 0.85 * max(dot(normalize(vNormal), sunDir), 0.0);
          outColor = vec4(col * light, 1.0);
        }`,
    });
    mat.userData.tex = tex;
    return mat;
  }, [images, ctrl, manifest]);

  useEffect(() => () => {
    geometry.dispose();
    (material.userData.tex as THREE.DataArrayTexture).dispose();
    material.dispose();
  }, [geometry, material]);

  return <mesh geometry={geometry} material={material} />;
}

interface GroundManifest {
  materials: { id: number; name: string; file: string; tileM: number; avgColor: number[] }[];
}
let groundManifest: GroundManifest | null = null;
let groundManifestPromise: Promise<void> | null = null;
/** Suspense-style loader for the ground-material manifest. */
function useGroundManifest(base: string): GroundManifest {
  if (groundManifest) return groundManifest;
  groundManifestPromise ??= fetch(`${base}textures/ground/materials.json`)
    .then((r) => r.json())
    .then((j) => { groundManifest = j; });
  throw groundManifestPromise;
}

function FlyRig({ speedRef, onPosition, extentM }: {
  speedRef: React.MutableRefObject<number>;
  onPosition?: Fly3DProps["onPosition"];
  extentM: number;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  useFrame((_, dt) => {
    const k = keys.current;
    const speed = speedRef.current * (k.ShiftLeft || k.ShiftRight ? 4 : 1);
    camera.getWorldDirection(dir);
    side.crossVectors(dir, camera.up).normalize();
    if (k.KeyW) camera.position.addScaledVector(dir, speed * dt);
    if (k.KeyS) camera.position.addScaledVector(dir, -speed * dt);
    if (k.KeyD) camera.position.addScaledVector(side, speed * dt);
    if (k.KeyA) camera.position.addScaledVector(side, -speed * dt);
    if (k.KeyE || k.Space) camera.position.y += speed * dt;
    if (k.KeyQ || k.KeyC) camera.position.y -= speed * dt;
    camera.position.y = Math.max(5, Math.min(15000, camera.position.y));
    camera.position.x = Math.max(0, Math.min(extentM, camera.position.x));
    camera.position.z = Math.max(0, Math.min(extentM, camera.position.z));
    onPosition?.(camera.position.x / 1000, camera.position.z / 1000, camera.position.y);
  });
  return null;
}

function Terrain({ heights, size, metresPerPixel, textureCanvas, exaggeration, detail }: Omit<Fly3DProps, "spawnKm" | "mode">) {
  const geometry = useMemo(() => {
    const n = Math.floor((size - 1) / MESH_STEP) + 1;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    // Depress the coarse mesh under the detail patch so carved channels and
    // lakes in the refined terrain aren't poked through from below.
    const d = detail
      ? {
          x0: detail.originM[0], z0: detail.originM[1],
          x1: detail.originM[0] + (detail.width - 1) * detail.metresPerPixel,
          z1: detail.originM[1] + (detail.height - 1) * detail.metresPerPixel,
        }
      : null;
    const ramp = 600; // m over which the depression fades at the patch edge
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const px = Math.min(c * MESH_STEP, size - 1);
        const py = Math.min(r * MESH_STEP, size - 1);
        const x = px * metresPerPixel;
        const z = py * metresPerPixel;
        let y = heights[py * size + px] * exaggeration;
        if (d && x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) {
          const edge = Math.min(x - d.x0, d.x1 - x, z - d.z0, d.z1 - z);
          y -= 18 * Math.min(1, edge / ramp);
        }
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        uv[i * 2] = px / (size - 1);
        uv[i * 2 + 1] = 1 - py / (size - 1);
      }
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let j = 0;
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const a = r * n + c;
        // wind so faces point up (+y) with our row-south z axis
        idx[j++] = a; idx[j++] = a + n; idx[j++] = a + 1;
        idx[j++] = a + 1; idx[j++] = a + n; idx[j++] = a + n + 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }, [heights, size, metresPerPixel, exaggeration, detail]);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(textureCanvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [textureCanvas]);

  useEffect(() => () => { geometry.dispose(); texture.dispose(); }, [geometry, texture]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
    </mesh>
  );
}

export function Fly3D(props: Fly3DProps) {
  const extentM = props.size * props.metresPerPixel;
  const speedRef = useRef(300);
  const [locked, setLocked] = useState(false);
  const start: [number, number, number] = [props.spawnKm.x * 1000, 700, props.spawnKm.z * 1000];
  return (
    <Canvas
      camera={{ position: start, fov: 60, near: 2, far: 60000, up: [0, 1, 0] }}
      style={{ width: "100%", height: "100%" }}
      onCreated={({ camera }) => camera.lookAt(start[0], 0, start[2] - 4000)}
    >
      <color attach="background" args={["#7c8fa0"]} />
      <fog attach="fog" args={["#7c8fa0", 4000, 40000]} />
      <hemisphereLight args={["#cfd8e8", "#3c4636", 0.9]} />
      <directionalLight position={[extentM * 0.3, 8000, extentM * 0.2]} intensity={1.4} />
      <Terrain heights={props.heights} size={props.size} metresPerPixel={props.metresPerPixel}
        textureCanvas={props.textureCanvas} exaggeration={props.exaggeration} detail={props.detail} />
      {props.detail && (
        <Suspense fallback={null}>
          <DetailTerrain patch={props.detail} exaggeration={props.exaggeration} />
        </Suspense>
      )}
      {/* sea */}
      <mesh position={[extentM / 2, 0, extentM / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[extentM * 1.5, extentM * 1.5]} />
        <meshStandardMaterial color="#2a5b8a" transparent opacity={0.82} roughness={0.35} />
      </mesh>
      {props.mode === "fly" ? (
        <>
          <PointerLockControls onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
          <FlyRig speedRef={speedRef} onPosition={props.onPosition} extentM={extentM} />
          {!locked && null}
        </>
      ) : (
        <MapControls target={[start[0], 0, start[2] - 2000]} maxDistance={40000} />
      )}
    </Canvas>
  );
}
