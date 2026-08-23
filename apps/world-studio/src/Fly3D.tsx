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

  // Skyrim ground textures (extracted from the vault BSA by
  // worldgen.export_terrain_textures) blended by the compiled splatmap —
  // the terrain preview's look derives from game assets, per the asset plan.
  const base = import.meta.env.BASE_URL;
  const [grass, marsh, rock, mud, jungle, sand, splat, splat2] = useLoader(THREE.TextureLoader, [
    `${base}textures/terrain/grass.png`, `${base}textures/terrain/marsh.png`,
    `${base}textures/terrain/rock.png`, `${base}textures/terrain/mud.png`,
    `${base}textures/terrain/jungle.png`, `${base}textures/terrain/sand.png`,
    `${base}province/basin/splat.png`, `${base}province/basin/splat2.png`,
  ]);
  const material = useMemo(() => {
    for (const t of [grass, marsh, rock, mud, jungle, sand]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = 4;
    }
    splat.colorSpace = THREE.NoColorSpace;
    splat2.colorSpace = THREE.NoColorSpace;
    return new THREE.ShaderMaterial({
      uniforms: {
        tGrass: { value: grass }, tMarsh: { value: marsh },
        tRock: { value: rock }, tMud: { value: mud },
        tJungle: { value: jungle }, tSand: { value: sand },
        tSplat: { value: splat }, tSplat2: { value: splat2 },
        sunDir: { value: new THREE.Vector3(0.45, 0.8, 0.3).normalize() },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
        void main() {
          vUv = uv; vNormal = normal; vWorld = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tGrass, tMarsh, tRock, tMud, tJungle, tSand, tSplat, tSplat2;
        uniform vec3 sunDir;
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
        void main() {
          vec4 w = texture2D(tSplat, vUv);
          vec4 w2 = texture2D(tSplat2, vUv);
          float total = max(w.r + w.g + w.b + w.a + w2.r + w2.g, 1e-4);
          vec3 col = ( w.r  * texture2D(tGrass,  vWorld.xz / 9.0).rgb
                     + w.g  * texture2D(tMarsh,  vWorld.xz / 8.0).rgb
                     + w.b  * texture2D(tRock,   vWorld.xz / 14.0).rgb
                     + w.a  * texture2D(tMud,    vWorld.xz / 7.0).rgb
                     + w2.r * texture2D(tJungle, vWorld.xz / 10.0).rgb
                     + w2.g * texture2D(tSand,   vWorld.xz / 8.0).rgb ) / total;
          // macro mottle (splat2.b) breaks up tiling monotony at distance
          col *= 0.82 + 0.36 * w2.b;
          float light = 0.62 + 0.85 * max(dot(normalize(vNormal), sunDir), 0.0);
          gl_FragColor = vec4(col * light, 1.0);
        }`,
    });
  }, [grass, marsh, rock, mud, jungle, sand, splat, splat2]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  return <mesh geometry={geometry} material={material} />;
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
