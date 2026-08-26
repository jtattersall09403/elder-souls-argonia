import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import anchorsFile from "../../../world/sources/anchors/settlement-anchors.json";
import { sharedChunkStore, type ChunksManifest } from "./character/chunkStore";
import { headingOf } from "./compass";
import { ChunkTerrain } from "./character/ChunkTerrain";
import { WorldSky } from "./sky/WorldSky";
import { SeaPlane } from "./sky/SeaPlane";
import { DistantLands } from "./sky/DistantLands";

/**
 * Province flyover. Terrain comes from the same streamed chunks as the
 * character mode (same sampling, same splat material) so relief judged from
 * the air matches the ground truth; the coarse macro mesh is only a fallback
 * while the chunk manifest loads.
 */

const MESH_STEP = 3; // sample every 3rd height pixel for the fallback mesh

export interface Fly3DProps {
  heights: Float32Array;
  size: number;            // height grid edge (px)
  metresPerPixel: number;
  textureCanvas: HTMLCanvasElement;
  spawnKm: { x: number; z: number };
  exaggeration: number;
  mode: "fly" | "orbit";
  matSet?: string;
  waterLevelM?: number; // wet-season water rise (true metres; ×exaggeration at render)
  tintStrength?: number; // 0..2 multiplier on the macro climate tint
  showLanes?: boolean;   // boat-lane overlay (cyan water / amber portage)
  flySpeed?: number;     // m/s (owner slider: running pace up to fast skim)
  onPosition?: (xKm: number, zKm: number, altM: number, headingDeg: number) => void;
}

/** Boat-lane overlay: cyan where the lane is on water, amber over land
 * (portage hops / carved canoe channels) — the painted ground hid them
 * (owner request). Elevated lines above the terrain. */
function LanesOverlay({ heights, size, metresPerPixel, exaggeration }: {
  heights: Float32Array; size: number; metresPerPixel: number; exaggeration: number;
}) {
  const [lanes, setLanes] = useState<{ px: number[][]; land: number[] }[] | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}province/waterways.json`)
      .then((r) => r.json()).then((j) => setLanes(j.lanes)).catch(() => setLanes([]));
  }, []);
  const object = useMemo(() => {
    if (!lanes || !lanes.length) return null;
    const extentM = size * metresPerPixel;
    const pos: number[] = [];
    const col: number[] = [];
    const water = [0.35, 0.8, 1.0];
    const amber = [1.0, 0.7, 0.3];
    const at = (mx: number, my: number) => {
      const u = mx / 1345, v = my / 1345; // macro grid -> uv
      const px = Math.min(Math.round(u * size), size - 1);
      const py = Math.min(Math.round(v * size), size - 1);
      return [u * extentM, Math.max(heights[py * size + px], 0) * exaggeration + 10, v * extentM];
    };
    for (const lane of lanes) {
      for (let i = 0; i + 1 < lane.px.length; i++) {
        const c = lane.land[i] || lane.land[i + 1] ? amber : water;
        pos.push(...at(lane.px[i][0], lane.px[i][1]), ...at(lane.px[i + 1][0], lane.px[i + 1][1]));
        col.push(...c, ...c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    return new THREE.LineSegments(g, m);
  }, [lanes, heights, size, metresPerPixel, exaggeration]);
  useEffect(() => () => {
    if (object) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
  }, [object]);
  return object ? <primitive object={object} /> : null;
}

/** City beacons + name labels above the terrain, so anchors stay findable
 * now that the detail patch covers the map drape's dots (owner request). */
function CityMarkers({ heights, size, metresPerPixel, exaggeration }: {
  heights: Float32Array; size: number; metresPerPixel: number; exaggeration: number;
}) {
  const markers = useMemo(() => {
    const anchors = (anchorsFile.anchors as { name: string; u: number; v: number; rank?: string }[]);
    return anchors.map((a) => {
      const px = Math.min(Math.round(a.u * size), size - 1);
      const py = Math.min(Math.round(a.v * size), size - 1);
      const ground = Math.max(heights[py * size + px] * exaggeration, 0);
      const label = document.createElement("canvas");
      label.width = 512; label.height = 128;
      const g = label.getContext("2d")!;
      g.font = "bold 72px system-ui, sans-serif";
      g.textAlign = "center";
      g.lineWidth = 10; g.strokeStyle = "rgba(0,0,0,0.85)";
      g.strokeText(a.name, 256, 88);
      g.fillStyle = a.rank === "major" ? "#ffd76a" : "#d9e2ea";
      g.fillText(a.name, 256, 88);
      const tex = new THREE.CanvasTexture(label);
      return {
        key: a.name, major: a.rank === "major",
        x: a.u * size * metresPerPixel, z: a.v * size * metresPerPixel,
        ground, tex,
      };
    });
  }, [heights, size, metresPerPixel, exaggeration]);
  useEffect(() => () => markers.forEach((m) => m.tex.dispose()), [markers]);
  return (
    <group>
      {markers.map((m) => (
        <group key={m.key} position={[m.x, m.ground, m.z]}>
          {/* toneMapped={false}: markers are UI, not scenery — the physical
              exposure (~2e-5 by day) otherwise crushes them to black. */}
          <mesh position={[0, 400, 0]}>
            <cylinderGeometry args={[14, 14, 800, 6]} />
            <meshBasicMaterial color={m.major ? "#ffd76a" : "#b9c4cc"} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
          </mesh>
          <sprite position={[0, 950, 0]} scale={[1400, 350, 1]}>
            <spriteMaterial map={m.tex} transparent depthTest={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
}

/** Feeds the camera's ground position to the chunk LOD selector each frame. */
function FocusTracker({ focusRef }: { focusRef: React.MutableRefObject<{ x: number; z: number }> }) {
  const { camera } = useThree();
  useFrame(() => {
    focusRef.current.x = camera.position.x;
    focusRef.current.z = camera.position.z;
  });
  return null;
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
    camera.getWorldDirection(dir);
    onPosition?.(
      camera.position.x / 1000,
      camera.position.z / 1000,
      camera.position.y,
      headingOf(dir.x, dir.z).deg,
    );
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
        const x = px * metresPerPixel;
        const z = py * metresPerPixel;
        pos[i * 3] = x;
        pos[i * 3 + 1] = heights[py * size + px] * exaggeration;
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
  const speedRef = useRef(props.flySpeed ?? 60);
  speedRef.current = props.flySpeed ?? 60;
  const [locked, setLocked] = useState(false);
  const start: [number, number, number] = [props.spawnKm.x * 1000, 700, props.spawnKm.z * 1000];
  // The flyover renders the SAME chunked terrain as the character mode (same
  // sampling, same splat material), so relief judged from the air matches
  // what the character walks on. LOD follows the camera.
  const store = useMemo(() => sharedChunkStore(import.meta.env.BASE_URL), []);
  const [chunkManifest, setChunkManifest] = useState<ChunksManifest | null>(null);
  useEffect(() => {
    store.manifest().then(setChunkManifest).catch(() => setChunkManifest(null));
  }, [store]);
  const focusRef = useRef({ x: start[0], z: start[2] });
  return (
    <Canvas
      camera={{ position: start, fov: 60, near: 2, far: 60000, up: [0, 1, 0] }}
      shadows="soft"
      style={{ width: "100%", height: "100%" }}
      onCreated={({ camera }) => camera.lookAt(start[0], 0, start[2] - 4000)}
    >
      {/* Natural light and sky (Phase 8a): sun/moons/stars, CSM shadows,
          exposure and the aerial haze all come from WorldSky — the old fixed
          hemisphere+directional pair and hand-tuned fog are gone. */}
      <WorldSky mode="fly" extentM={extentM}>
        {chunkManifest ? (
          <Suspense fallback={null}>
            <FocusTracker focusRef={focusRef} />
            <ChunkTerrain store={store} manifest={chunkManifest} focusRef={focusRef}
              matSet={props.matSet} tintStrength={props.tintStrength}
              verticalScale={props.exaggeration} />
          </Suspense>
        ) : (
          <Terrain heights={props.heights} size={props.size} metresPerPixel={props.metresPerPixel}
            textureCanvas={props.textureCanvas} exaggeration={props.exaggeration} />
        )}
        <CityMarkers heights={props.heights} size={props.size}
          metresPerPixel={props.metresPerPixel} exaggeration={props.exaggeration} />
        {props.showLanes !== false && (
          <LanesOverlay heights={props.heights} size={props.size}
            metresPerPixel={props.metresPerPixel} exaggeration={props.exaggeration} />
        )}
        {/* sea (rises with the wet-season toggle, §36 flood states) */}
        <SeaPlane extentM={extentM} levelM={(props.waterLevelM ?? 0) * props.exaggeration} />
        <DistantLands extentM={extentM} verticalScale={props.exaggeration} />
      </WorldSky>
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
