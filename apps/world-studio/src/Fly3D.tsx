import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

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
  onPosition?: (xKm: number, zKm: number, altM: number) => void;
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

function Terrain({ heights, size, metresPerPixel, textureCanvas, exaggeration }: Omit<Fly3DProps, "spawnKm" | "mode">) {
  const geometry = useMemo(() => {
    const n = Math.floor((size - 1) / MESH_STEP) + 1;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const px = Math.min(c * MESH_STEP, size - 1);
        const py = Math.min(r * MESH_STEP, size - 1);
        pos[i * 3] = px * metresPerPixel;
        pos[i * 3 + 1] = heights[py * size + px] * exaggeration;
        pos[i * 3 + 2] = py * metresPerPixel;
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
  }, [heights, size, metresPerPixel, exaggeration]);

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
        textureCanvas={props.textureCanvas} exaggeration={props.exaggeration} />
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
