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
    for (const warm of waterLinkWarms({
      field: fieldMesh, fieldMaterials: field, strips: { mesh: stripMesh, materials: strips },
      pools: { mesh: poolMesh, materials: pools }, falls: null, bubbles: { object3d: bubbleMesh, scene: bubbleScene },
    })) await linker.link(warm, new THREE.PerspectiveCamera());

    expect([...warmed].sort()).toEqual([...drawn].sort());
    expect(lit.at(-1)).toBe(bubbleScene);
    expect(fieldMesh.material).toBe(field.above); // own material restored
    expect(fieldMesh.visible).toBe(false); // visibility restored
    expect(bound).toBeNull();
    linker.detach();
  });
});
