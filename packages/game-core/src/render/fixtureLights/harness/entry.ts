import * as THREE from "three";
import { fixtureLightFieldOf, FIXTURE_LIGHTS_MAX } from "../fixtureLightField";

const W = 640; const H = 400;
function setup() {
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  const gl = renderer.getContext();
  let useProgramCalls = 0;
  const orig = gl.useProgram.bind(gl);
  (gl as any).useProgram = (p: WebGLProgram | null) => { useProgramCalls += 1; orig(p); };
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  camera.position.set(0, 3, 12); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  return { renderer, camera, gl, counts: () => useProgramCalls };
}
function wall(material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 12, 1, 1), material);
  m.position.set(0, 6, -2); m.updateMatrixWorld(); return m;
}
const colour = new THREE.Color().setRGB(226 / 255, 140 / 255, 63 / 255, THREE.SRGBColorSpace);

(window as any).runPrograms = (sharedMaterials = false) => {
  const { renderer, camera, counts } = setup();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x404040, 0.2));
  const field = fixtureLightFieldOf(scene);
  const meshes: THREE.Mesh[] = [];
  const one = new THREE.MeshStandardMaterial({ color: 0x888888 });
  for (let i = 0; i < 20; i++) {
    const std = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sharedMaterials ? one : new THREE.MeshStandardMaterial({ color: 0x888888 }));
    std.position.set((i % 10) * 2 - 10, 0.5, -Math.floor(i / 10) * 2); meshes.push(std);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x668866 }), 4);
    for (let k = 0; k < 4; k++) inst.setMatrixAt(k, new THREE.Matrix4().makeTranslation((i % 10) * 2 - 10 + k * 0.2, 1.5, -Math.floor(i / 10) * 2));
    inst.computeBoundingSphere(); meshes.push(inst);
    const lam = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshLambertMaterial({ color: 0x886666 }));
    lam.position.set((i % 10) * 2 - 10, 2.5, -Math.floor(i / 10) * 2); meshes.push(lam);
  }
  for (const m of meshes) { scene.add(m); field.install(m.material as THREE.Material); field.attach(m); }
  scene.updateMatrixWorld(true);
  const rows: any[] = [];
  for (const n of [0, 5, 40, 100, 0, 17, 100]) {
    const lights = Array.from({ length: n }, (_, i) => ({ position: new THREE.Vector3((i % 20) - 10, 2, -(i % 5)), radiusM: 6 }));
    field.setLights(lights);
    for (let i = 0; i < n; i++) field.setIntensity(i, colour, 6);
    field.commit();
    const before = counts();
    renderer.info.reset();
    renderer.render(scene, camera);
    const calls = renderer.info.render.calls;
    renderer.render(scene, camera);
    rows.push({ lights: n, programs: renderer.info.programs!.length, drawCalls: calls,
      useProgramCallsPerFrame: (counts() - before) / 2, directUploadsTotal: field.directUploads });
  }
  return { cap: FIXTURE_LIGHTS_MAX, rows };
};

/** A wall lit by a real PointLight vs the same lamp through the field: pixel difference. */
(window as any).runParity = () => {
  const out: any = {};
  for (const mode of ["point", "field"]) {
    const { renderer, camera } = setup();
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.8 });
    const mesh = wall(material); scene.add(mesh);
    const lampAt = [new THREE.Vector3(-3, 3, 0), new THREE.Vector3(4, 5, 1)];
    if (mode === "point") {
      for (const at of lampAt) { const l = new THREE.PointLight(colour, 6, 6, 2); l.position.copy(at); scene.add(l); }
    } else {
      const field = fixtureLightFieldOf(scene);
      field.install(material); field.attach(mesh);
      field.setLights(lampAt.map((position) => ({ position, radiusM: 6 })));
      lampAt.forEach((_, i) => field.setIntensity(i, colour, 6)); field.commit();
    }
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const px = new Uint8Array(W * H * 4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out[mode] = px;
  }
  let maxDiff = 0; let sumDiff = 0; let lit = 0;
  for (let i = 0; i < out.point.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(out.point[i + c] - out.field[i + c]);
      maxDiff = Math.max(maxDiff, d); sumDiff += d;
    }
    if (out.point[i] > 8) lit += 1;
  }
  return { pixels: W * H, litPixels: lit, maxChannelDiff: maxDiff, meanChannelDiff: sumDiff / (W * H * 3) };
};

/** Frame cost: a lit field of 60 lit objects, 16 real point lights (the old path) vs 16 fixture lamps. */
(window as any).runCost = (frames: number) => {
  const res: any = {};
  for (const mode of ["point16", "field16", "none"]) {
    const { renderer, camera, gl } = setup();
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0x404040, 0.3));
    const field = fixtureLightFieldOf(scene);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 8, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x556644 }));
    scene.add(ground);
    const objs: THREE.Mesh[] = [ground];
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 1.5), new THREE.MeshStandardMaterial({ color: 0x999999 }));
      m.position.set((i % 12) * 3 - 18, 1.5, -Math.floor(i / 12) * 4); scene.add(m); objs.push(m);
    }
    const lamps = Array.from({ length: 16 }, (_, i) => new THREE.Vector3((i % 8) * 5 - 18, 2.5, -Math.floor(i / 8) * 8 - 1));
    if (mode === "point16") for (const at of lamps) { const l = new THREE.PointLight(colour, 6, 6, 2); l.position.copy(at); scene.add(l); }
    if (mode === "field16") {
      for (const o of objs) { field.install(o.material as THREE.Material); field.attach(o); }
      field.setLights(lamps.map((position) => ({ position, radiusM: 6 })));
      lamps.forEach((_, i) => field.setIntensity(i, colour, 6)); field.commit();
    }
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    res[mode] = (performance.now() - t0) / frames;
  }
  return res;
};

/** The same 60 objects with no field at all: three's own useProgram calls per frame. */
(window as any).runBaseline = () => {
  const { renderer, camera, counts } = setup();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x404040, 0.2));
  for (let i = 0; i < 20; i++) {
    const std = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    std.position.set((i % 10) * 2 - 10, 0.5, 0); scene.add(std);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial(), 4);
    scene.add(inst);
    const lam = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshLambertMaterial());
    lam.position.set((i % 10) * 2 - 10, 2.5, 0); scene.add(lam);
  }
  renderer.render(scene, camera);
  const before = counts();
  renderer.render(scene, camera); renderer.render(scene, camera);
  return { useProgramCallsPerFrame: (counts() - before) / 2, programs: renderer.info.programs!.length };
};

/** Objects SHARING one material, each with its own lamp list (the direct-upload
 * path) vs the same objects with a material each (three's own upload): pixels. */
(window as any).runSharedParity = () => {
  const out: any = {};
  for (const shared of [true, false]) {
    const { renderer, camera } = setup();
    const scene = new THREE.Scene();
    const field = fixtureLightFieldOf(scene);
    const one = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.7 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3, 1.6), shared ? one : one.clone());
      m.position.set(i * 2.2 - 12, 1.5, 0); scene.add(m);
      field.install(m.material as THREE.Material); field.attach(m);
    }
    const lamps = Array.from({ length: 30 }, (_, i) => ({ position: new THREE.Vector3(i * 0.9 - 13, 2 + (i % 3), 1.5), radiusM: 3 + (i % 4) }));
    field.setLights(lamps); lamps.forEach((_, i) => field.setIntensity(i, colour, 3 + (i % 5))); field.commit();
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera); renderer.render(scene, camera);
    const px = new Uint8Array(W * H * 4); const gl = renderer.getContext();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); out[String(shared)] = px;
    out[`uploads${shared}`] = field.directUploads;
  }
  let maxDiff = 0; let lit = 0;
  for (let i = 0; i < out.true.length; i++) { maxDiff = Math.max(maxDiff, Math.abs(out.true[i] - out.false[i])); if (i % 4 === 0 && out.true[i] > 8) lit += 1; }
  return { maxChannelDiff: maxDiff, litPixels: lit, directUploadsShared: out.uploadstrue, directUploadsSeparate: out.uploadsfalse };
};
