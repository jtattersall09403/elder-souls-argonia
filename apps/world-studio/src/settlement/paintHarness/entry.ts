/**
 * Path-paint harness page (16k walk 7): the published place paint through the
 * runtime material chain WorldSky gives every lit material (CSM, then the
 * aerial haze for `esAerial`, then the paint's own reapply), over a flat
 * ground drawn with the same chain. Renders the views `run.mjs` asks for and
 * measures paint contrast against a control strip of opaque track texture
 * (what the terrain's own road paint looks like) at each range.
 */
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { paintGeometry, paintMaterial, reapplyGroundPaint } from "@elder-souls/game-core/settlement/groundPaintMaterial";
import type { GroundPaintEntry } from "@elder-souls/game-core/settlement/groundPaint";
import { applyAerialPerspective, createAerialUniforms } from "../../sky/aerial";

const W = 900; const H = 500;
interface Row { id: number; name: string; file: string; tileM: number }
interface Shot { eye: [number, number, number]; at: [number, number, number] }
interface Opts { base: string; set: string; rows: Row[]; entries: GroundPaintEntry[]; shots: Shot[]; mist: number;
  control: [number, number, number, number]; wiped?: boolean }

const load = (url: string) => new Promise<THREE.Texture>((ok, no) => new THREE.TextureLoader().load(url, (t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; ok(t);
}, undefined, no));

/** The runtime paint samples the set's KTX2 albedo array by row id; the
 * harness has no transcoder, so it builds the same layers, raw (the shader
 * decodes sRGB), from the build-input PNGs at the array's 512². */
async function layerArray(base: string, set: string, rows: Row[]): Promise<THREE.DataArrayTexture> {
  const S = 512; const depth = Math.max(...rows.map((r) => r.id)) + 1;
  const data = new Uint8Array(S * S * 4 * depth);
  const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  for (const r of rows) {
    const img = await createImageBitmap(await (await fetch(`${base}textures/ground/${set}/${r.file}`)).blob());
    x.drawImage(img, 0, 0, S, S);
    data.set(x.getImageData(0, 0, S, S).data, r.id * S * S * 4);
  }
  const t = new THREE.DataArrayTexture(data, S, S, depth);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

async function run(o: Opts) {
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.72, 0.76, 0.8);
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.2, 4000);
  const sun = new THREE.Vector3(-0.4, -0.8, -0.3).normalize();
  const csm = new CSM({ camera, parent: scene, cascades: 3, maxFar: 400, lightDirection: sun, lightIntensity: 2.6, shadowMapSize: 1024 });
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x55503a, 1.1));
  const aerial = createAerialUniforms();
  aerial.uSunDirW.value.copy(sun).negate();
  aerial.uHazeSunLight.value.set(1.6, 1.55, 1.45);
  aerial.uHazeAmbient.value.set(0.75, 0.8, 0.85);
  aerial.uMistStrength.value = o.mist;
  aerial.uBetaM.value = 9e-5;
  // a humid, misty marsh cell everywhere (r humidity, g mist; vis r belt, g extinction)
  const cell = (r: number, g: number, b: number) => {
    const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t;
  };
  aerial.uClimateAir.value = cell(200, 180, 0);
  aerial.uClimateVis.value = cell(255, 200, 0);
  aerial.uClimateWeather.value = cell(0, 0, 0);
  // WorldSky.patchMaterial, in its order: CSM (replaces the hook), aerial for esAerial, the reapplies
  const chain = (m: THREE.MeshStandardMaterial) => {
    csm.setupMaterial(m);
    if (m.userData.esAerial) applyAerialPerspective(m, aerial);
    if (!o.wiped) reapplyGroundPaint(m);
    m.needsUpdate = true;
  };
  const rowOf = (n: string) => o.rows.find((r) => r.name === n)!;
  const groundTex = await load(`${o.base}textures/ground/${o.set}/${rowOf("grass_dirt").file}`);
  const trackTex = await load(`${o.base}textures/ground/${o.set}/${rowOf("track_mud").file}`);
  const tileM = (t: THREE.Texture, m: number) => { t.repeat.set(1 / m, 1 / m); return t; };
  const worldUv = (g: THREE.BufferGeometry) => {
    const p = g.getAttribute("position"); const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return g;
  };
  const groundMat = new THREE.MeshStandardMaterial({ map: tileM(groundTex, rowOf("grass_dirt").tileM), roughness: 1 });
  groundMat.userData.esAerial = true; chain(groundMat);
  const cx = o.shots[0].at[0]; const cz = o.shots[0].at[2];
  const plane = new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2).translate(cx, 0, cz);
  const ground = new THREE.Mesh(worldUv(plane), groundMat); ground.receiveShadow = true; scene.add(ground);
  const [x0, z0, x1, z1] = o.control;
  const ctrlMat = new THREE.MeshStandardMaterial({ map: tileM(trackTex, rowOf("track_mud").tileM), roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  ctrlMat.userData.esAerial = true; chain(ctrlMat);
  const ctrlGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
  const control = new THREE.Mesh(worldUv(ctrlGeo), ctrlMat); control.receiveShadow = true; scene.add(control);
  const built = paintGeometry(o.entries, () => 0)!;
  const rows = built.textures.map((t) => rowOf(t));
  const paintMat = paintMaterial(await layerArray(o.base, o.set, rows), rows);
  chain(paintMat);
  const paint = new THREE.Mesh(built.geometry, paintMat); paint.renderOrder = 1; paint.receiveShadow = true; scene.add(paint);
  const flat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const grab = () => { const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d")!; x.drawImage(canvas, 0, 0); return x.getImageData(0, 0, W, H).data; };
  const draw = () => { camera.updateMatrixWorld(); csm.update(); renderer.render(scene, camera); };
  const out: unknown[] = [];
  for (const s of o.shots) {
    camera.position.set(...s.eye); camera.lookAt(...s.at); camera.updateProjectionMatrix();
    draw(); draw();
    const img = canvas.toDataURL("image/png"); const lit = grab();
    const masks: Record<string, Uint8ClampedArray> = {};
    for (const [name, mesh] of [["paint", paint], ["control", control]] as const) {
      const keep = mesh.material; paint.visible = control.visible = false;
      draw(); const bare = grab();
      mesh.visible = true; (mesh as THREE.Mesh).material = flat; ground.visible = false; draw(); masks[name] = grab();
      mesh.material = keep; ground.visible = true; paint.visible = control.visible = true;
      masks[name + "Bare"] = bare;
    }
    const stat = (name: string) => {
      const m = masks[name]; const bare = masks[name + "Bare"];
      let n = 0; let dl = 0; let pl = 0; let gl = 0;
      for (let i = 0; i < m.length; i += 4) {
        if (!(m[i] > 200 && m[i + 1] < 40)) continue;
        n++; dl += Math.abs(lum(lit, i) - lum(bare, i)); pl += lum(lit, i); gl += lum(bare, i);
      }
      return n ? { pixels: n, meanAbsLumDiff: +(dl / n).toFixed(2), meanLum: +(pl / n).toFixed(1), groundLum: +(gl / n).toFixed(1) } : { pixels: 0 };
    };
    draw();
    out.push({ eye: s.eye, dist: +Math.hypot(s.eye[0] - s.at[0], s.eye[2] - s.at[2]).toFixed(0), img, paint: stat("paint"), control: stat("control") });
  }
  return out;
}
(window as unknown as { runPaint: typeof run }).runPaint = run;
