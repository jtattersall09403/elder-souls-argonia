/**
 * Seam look page (16k walk 9): one placed building on its own ground (the
 * frozen heights with the place's pads applied, from seam_ground.py), the
 * published kit GLB through the runtime KTX2 + meshopt loader at the bundle
 * pose, and the place's published ground paint (ways, trampled ring, contact
 * shade) through the runtime paint material. No vegetation, water, weather or
 * characters. Draws the wall's base from `distM` at `eyeM` over the ground,
 * with the paint and without it.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { paintGeometry, paintMaterial } from "../../../packages/game-core/src/settlement/groundPaintMaterial";
import type { GroundPaintEntry } from "../../../packages/game-core/src/settlement/groundPaint";
import { placementQuaternion } from "../../../packages/game-core/src/settlement/anchoring";

interface Row { name: string; file: string; tileM: number }
interface Opts {
  base: string; set: string; rows: Row[]; entries: GroundPaintEntry[];
  grid: { x0: number; z0: number; step: number; n: number; heights: number[]; wet: number[] };
  place: { positionM: [number, number, number]; yawDeg: number; pitchDeg?: number; scale: number; footprintM: [number, number][] };
  glbUrl: string; node: string; fromPart: boolean; bearingDeg: number; distM: number; eyeM: number;
  width: number; height: number;
}

const load = (url: string) => new Promise<THREE.Texture>((ok, no) => new THREE.TextureLoader().load(url, (t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; ok(t);
}, undefined, no));

function inside(x: number, z: number, poly: [number, number][]): boolean {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i]; const [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) / (bz - az)) * (bx - ax)) r = !r;
  }
  return r;
}

async function run(o: Opts) {
  const t0 = performance.now();
  const canvas = document.createElement("canvas"); canvas.width = o.width; canvas.height = o.height;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(o.width, o.height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c4);
  const { x0, z0, step, n, heights, wet } = o.grid;
  const groundAt = (x: number, z: number): number => {
    // outside the grid: its edge height (a way running out of the look is drawn flat there)
    const fi = Math.min(Math.max((x - x0) / step, 0), n - 1); const fj = Math.min(Math.max((z - z0) / step, 0), n - 1);
    const i = Math.min(Math.floor(fi), n - 2); const j = Math.min(Math.floor(fj), n - 2);
    const u = fi - i; const v = fj - j; const h = (a: number, b: number) => heights[b * n + a];
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  // ground: the grid as a mesh, world-metre UVs, wet posts tinted
  const pos = new Float32Array(n * n * 3); const uv = new Float32Array(n * n * 2); const col = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; const x = x0 + i * step; const z = z0 + j * step;
    pos.set([x, heights[k], z], k * 3); uv.set([x, z], k * 2);
    col.set(wet[k] ? [0.45, 0.55, 0.65] : [1, 1, 1], k * 3);
  }
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const rowOf = (name: string) => o.rows.find((r) => r.name === name) ?? o.rows[0];
  const grass = await load(`${o.base}textures/ground/${o.set}/${rowOf("grass_dirt").file}`);
  grass.repeat.set(1 / rowOf("grass_dirt").tileM, 1 / rowOf("grass_dirt").tileM);
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; scene.add(ground);
  // the paint near the building
  const p = o.place; const [px, , pz] = p.positionM;
  const near = o.entries.filter((e) => e.polygonM.some(([x, z]) => Math.abs(x - px) < 40 && Math.abs(z - pz) < 40));
  const built = near.length ? paintGeometry(near, groundAt) : null;
  let paint: THREE.Mesh | null = null;
  if (built) {
    const mat = paintMaterial(o.base, o.set, built.textures.map(rowOf));
    paint = new THREE.Mesh(built.geometry, mat); paint.renderOrder = 1; paint.receiveShadow = true; scene.add(paint);
  }
  // the building, at its bundle pose
  const loader = new GLTFLoader();
  loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(`${o.base}basis/`).detectSupport(renderer));
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(o.glbUrl);
  let obj: THREE.Object3D = gltf.scene;
  if (!o.fromPart) {
    const found = gltf.scene.getObjectByName(o.node) ?? gltf.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(o.node));
    if (!found) throw new Error(`node ${o.node} not in kit GLB`);
    found.removeFromParent(); found.position.set(0, 0, 0); found.quaternion.identity(); found.scale.setScalar(1); obj = found;
  }
  const holder = new THREE.Group();
  holder.position.set(px, p.positionM[1], pz);
  holder.quaternion.copy(placementQuaternion(p.yawDeg, p.pitchDeg ?? 0));
  holder.scale.setScalar(p.scale); holder.add(obj); scene.add(holder);
  obj.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  // light: a mid-afternoon sun and sky
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a4a30, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.position.set(px + 30, p.positionM[1] + 45, pz + 20); sun.target.position.set(px, p.positionM[1], pz);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 150 });
  sun.shadow.bias = -0.0005; scene.add(sun, sun.target);
  // the camera: from the footprint's centre out along the bearing to the wall, then distM past it
  const fp = p.footprintM;
  const cx = fp.reduce((a, q) => a + q[0], 0) / fp.length; const cz = fp.reduce((a, q) => a + q[1], 0) / fp.length;
  const b = (o.bearingDeg * Math.PI) / 180; const dx = Math.sin(b); const dz = Math.cos(b);
  let s = 0; while (s < 60 && inside(cx + dx * s, cz + dz * s, fp)) s += 0.1;
  const wx = cx + dx * s; const wz = cz + dz * s;
  const ex = wx + dx * o.distM; const ez = wz + dz * o.distM;
  const camera = new THREE.PerspectiveCamera(60, o.width / o.height, 0.1, 500);
  camera.position.set(ex, groundAt(ex, ez) + o.eyeM, ez);
  camera.lookAt(wx, groundAt(wx, wz) + 0.6, wz);
  await new Promise((r) => setTimeout(r, 800));   // the paint's own TextureLoader images
  const shots: Record<string, string> = {};
  const t1 = performance.now();
  renderer.render(scene, camera); shots.live = canvas.toDataURL("image/png");
  const frameMs = performance.now() - t1;
  if (paint) { paint.visible = false; renderer.render(scene, camera); shots.bare = canvas.toDataURL("image/png"); }
  return { shots, frameMs: Math.round(frameMs), setupMs: Math.round(t1 - t0), paintEntries: near.length,
    paintVertices: built?.geometry.getAttribute("position").count ?? 0,
    wallM: [+wx.toFixed(2), +wz.toFixed(2)], eyeM: camera.position.toArray().map((v) => +v.toFixed(2)) };
}
(window as unknown as { runSeam: typeof run }).runSeam = run;
