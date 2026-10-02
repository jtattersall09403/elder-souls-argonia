import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DrawTargetLinker } from "../../render/drawTargetLinker";
import { waterLinkWarms } from "./waterLinkWarms";
import { setLitPreparer } from "../../render/fixtureLights/fixtureLightField";

// The parts of three's program key (WebGLPrograms.getParameters) a warm can
// get wrong: the object compiled and its flags, the material's hook key, and
// what the bound target implies (output colour space, tone mapping).
const SCREEN_TONE = THREE.ACESFilmicToneMapping;
function key(object: THREE.Mesh, target: THREE.WebGLRenderTarget | null): string {
  const material = object.material as THREE.Material;
  return [object.name, object.receiveShadow, material.customProgramCacheKey(), material.transparent,
    target ? target.texture.colorSpace : THREE.SRGBColorSpace, target ? THREE.NoToneMapping : SCREEN_TONE,
    target?.texture.type ?? "screen"].join("|");
}

function waterMaterial(name: string, transparent = false): THREE.Material {
  const m = new THREE.MeshPhysicalMaterial({ transparent });
  m.customProgramCacheKey = () => name;
  return m;
}

function variants(prefix: string) {
  return { above: waterMaterial(`es-water-above-high-${prefix}-ftex`), below: waterMaterial(`es-water-below-high-${prefix}-ftex`) };
}

function surfaceMesh(name: string, materials: { above: THREE.Material }) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.above);
  mesh.name = name; mesh.receiveShadow = true; mesh.visible = false;
  return mesh;
}

describe("waterLinkWarms (16k walk 10: the underwater water variants linked on the first dive)", () => {
  it("links each water mesh with the program key its draw uses", async () => {
    // WaterPipeline's targets: the scene target (pass 1, the underwater
    // surface) and the screen (pass 3, the surface above water).
    const sceneTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    sceneTarget.texture.colorSpace = THREE.NoColorSpace;
    const field = variants("field"), strips = variants("strip"), pools = variants("pool");
    const fieldMesh = surfaceMesh("field", field), stripMesh = surfaceMesh("strips", strips), poolMesh = surfaceMesh("pools", pools);
    const bubbleScene = new THREE.Scene();
    const bubbleMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ transparent: true }));
    bubbleMesh.name = "bubbles"; bubbleScene.add(bubbleMesh);
    const drawn = new Set<string>();
    for (const [mesh, m] of [[fieldMesh, field], [stripMesh, strips], [poolMesh, pools]] as const) {
      mesh.material = m.above; drawn.add(key(mesh, null));
      mesh.material = m.below; drawn.add(key(mesh, sceneTarget));
      mesh.material = m.above;
    }
    drawn.add(key(bubbleMesh, sceneTarget)); // the bubble pass's target: half-float, NoColorSpace
    const fallsGroup = new THREE.Group();
    const fallsMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMaterial("es-fall-kit-lit", true));
    fallsMesh.name = "falls"; fallsGroup.add(fallsMesh); fallsGroup.visible = false;
    drawn.add(key(fallsMesh, null)); drawn.add(key(fallsMesh, sceneTarget)); // above (screen) and below (target)

    let bound: THREE.WebGLRenderTarget | null = null;
    const warmed = new Set<string>();
    const lit: THREE.Scene[] = [];
    const gl = {
      getRenderTarget: () => bound,
      setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { bound = t; },
      compile: (object: THREE.Object3D, _camera: THREE.Camera, scene: THREE.Scene) => {
        object.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) warmed.add(key(o as THREE.Mesh, bound)); });
        lit.push(scene);
        return new Set();
      },
      extensions: { has: () => true },
    } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    setLitPreparer(scene, () => undefined); // the sky is mounted
    const linker = new DrawTargetLinker(gl, scene).attach();
    scene.onBeforeRender({} as never, scene, new THREE.PerspectiveCamera(), sceneTarget as never, undefined as never, undefined as never);
    const warms = waterLinkWarms({
      field: fieldMesh, fieldMaterials: field, strips: { mesh: stripMesh, materials: strips },
      pools: { mesh: poolMesh, materials: pools }, falls: fallsGroup, bubbles: { object3d: bubbleMesh, scene: bubbleScene },
    });
    // Falls, strips and pools can draw on the first frame: held, not observed (perf10 diag 6 C3).
    expect(new Set(warms.held.map((w) => w.object))).toEqual(new Set([stripMesh, poolMesh, fallsGroup]));
    expect(new Set(warms.observed.map((w) => w.object))).toEqual(new Set([fieldMesh, bubbleMesh]));
    // Held warms name their pass, so their key is right before any scene pass is seen.
    expect(warms.held.every((w) => w.pass === "screen" || w.pass === "target")).toBe(true);
    for (const warm of [...warms.observed, ...warms.held]) await linker.link(warm, new THREE.PerspectiveCamera());

    expect([...warmed].sort()).toEqual([...drawn].sort());
    expect(lit).toContain(bubbleScene);
    expect(fieldMesh.material).toBe(field.above); // own material restored
    expect(fieldMesh.visible).toBe(false); // visibility restored
    expect(bound).toBeNull();
    linker.detach();
  });

  it("holds the falls hidden until their links settle, and releases them on a hung compile", async () => {
    const scene = new THREE.Scene();
    setLitPreparer(scene, () => undefined);
    let firstReady = false;
    const finish = () => { firstReady = true; };
    let calls = 0;
    const mats = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const gl = {
      getRenderTarget: () => null, setRenderTarget: () => undefined,
      // screen link's program is ready when told; the target link's never is
      compile: () => new Set([mats[calls++ === 0 ? 0 : 1]]),
      properties: { get: (m: THREE.Material) => ({ currentProgram: { isReady: () => m === mats[0] && firstReady } }) },
      extensions: { has: () => true },
    } as unknown as THREE.WebGLRenderer;
    const linker = new DrawTargetLinker(gl, scene, 4000, 30);
    const falls = new THREE.Group();
    const held = new Set<THREE.Object3D>();
    const { held: warms } = waterLinkWarms({
      field: null, fieldMaterials: variants("field"), strips: null, pools: null, falls, bubbles: null,
    });
    linker.holdUntilLinked(warms, new THREE.PerspectiveCamera(), (o, on) => { if (on) held.add(o); else held.delete(o); });
    expect(held.has(falls)).toBe(true);
    finish(); await new Promise((r) => setTimeout(r, 15));
    expect(held.has(falls)).toBe(true); // the target link is still pending
    await new Promise((r) => setTimeout(r, 60));
    expect(held.has(falls)).toBe(false);
    linker.detach();
  });
});
