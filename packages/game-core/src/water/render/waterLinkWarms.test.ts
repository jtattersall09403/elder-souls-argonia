import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DrawTargetLinker, type LinkingRenderer } from "../../render/drawTargetLinker";
import { waterLinkWarms } from "./waterLinkWarms";
import { setLitPreparer } from "../../render/fixtureLights/fixtureLightField";

// The parts of a pipeline's key a warm can get wrong: the object compiled and
// its flags, the material variant, and what the bound target implies (output
// colour space, tone mapping).
const SCREEN_TONE = THREE.ACESFilmicToneMapping;
function key(object: THREE.Mesh, target: THREE.RenderTarget | null): string {
  const material = object.material as THREE.Material;
  return [object.name, object.receiveShadow, material.name, material.transparent,
    target ? target.texture.colorSpace : THREE.SRGBColorSpace, target ? THREE.NoToneMapping : SCREEN_TONE,
    target?.texture.type ?? "screen"].join("|");
}

function waterMaterial(name: string, transparent = false): THREE.Material {
  const m = new THREE.MeshPhysicalMaterial({ transparent });
  m.name = name;
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
    const sceneTarget = new THREE.RenderTarget(4, 4, { type: THREE.HalfFloatType });
    sceneTarget.texture.colorSpace = THREE.NoColorSpace;
    const field = variants("field"), strips = variants("strip"), pools = variants("pool");
    const fieldMesh = surfaceMesh("field", field), stripMesh = surfaceMesh("strips", strips), poolMesh = surfaceMesh("pools", pools);
    const bubbleScene = new THREE.Scene();
    const bubbleMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true }));
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

    let bound: THREE.RenderTarget | null = null;
    const warmed = new Set<string>();
    const lit: THREE.Scene[] = [];
    const gl = {
      getRenderTarget: () => bound,
      setRenderTarget: (t: THREE.RenderTarget | null) => { bound = t; },
      compileAsync: (object: THREE.Object3D, _camera: THREE.Camera, scene: THREE.Scene) => {
        object.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) warmed.add(key(o as THREE.Mesh, bound)); });
        lit.push(scene);
        return Promise.resolve();
      },
    } as unknown as LinkingRenderer;
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
    let finish = () => undefined as void;
    let calls = 0;
    const gl = {
      getRenderTarget: () => null, setRenderTarget: () => undefined,
      // the screen link settles when told; the target link's never does
      compileAsync: () => (calls++ === 0 ? new Promise<void>((r) => { finish = r; }) : new Promise(() => undefined)),
    } as unknown as LinkingRenderer;
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
