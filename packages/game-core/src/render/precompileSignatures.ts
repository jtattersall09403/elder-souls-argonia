import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildArchitectureKit } from "../settlement/kit";
import { mergeTransformedParts } from "../settlement/lod";
import { cloneSettlementMaterial, createSettlementMaterialUniforms, prepareSettlementMaterial, type SettlementGlow, type SettlementMaterialUniforms } from "../settlement/materials";
import { isSettlementGlowMaterial } from "../settlement/windowGlow";
import { setCastShadow } from "./shadowCasters";
import { prepareLit } from "./fixtureLights/fixtureLightField";
import { compileInBatches, precompileShadowVariants, type PrecompileRenderer } from "./precompileScene";
import { RENDER_SIGNATURES_SCHEMA_VERSION, type RenderSignature, type RenderSignatures } from "./renderSignatures";

/**
 * Boot precompile of every kit draw signature (decision 0108 §2), run once
 * the sky and light rig are final and before the kits arrive: one
 * one-triangle dummy per baked signature (`render-signatures.json`, see
 * renderSignatures.ts) goes through the kit loader's own conversion
 * (`buildArchitectureKit`: the node twin of a clone), the settlement layer's
 * material sequence (`prepareSettlementMaterial`), its merge
 * (`mergeTransformedParts`: shaded attributes only, the ground-line
 * attribute, stride alignment) and its caster flag, so the dummy's program
 * and pipeline keys are the real draw's. They compile into the frame's
 * targets and the shadow pass, all in parallel, then are disposed.
 *
 * The dummies carry their own uniforms instance, so three's JS node-build
 * cache (keyed on node ids) is not shared with the real draws; the GPU
 * programs (keyed on the WGSL text) and render pipelines (stage ids plus
 * render state) are. A new material class or attribute layout must appear
 * in the baked file (re-run the bake; the dist build does).
 */
export function parseRenderSignatures(json: unknown): RenderSignatures {
  const d = json as Partial<RenderSignatures> | null;
  if (!d || d.schemaVersion !== RENDER_SIGNATURES_SCHEMA_VERSION || !Array.isArray(d.signatures)) {
    throw new Error(`render-signatures.json: schemaVersion ${String(d?.schemaVersion)}, want ${RENDER_SIGNATURES_SCHEMA_VERSION}`);
  }
  return d as RenderSignatures;
}

const ARRAY: Record<number, new (n: number) => THREE.TypedArray> = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};

/** A one-triangle geometry with the signature's attribute layout. */
export function signatureGeometry(sig: RenderSignature): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const a of sig.attributes) {
    const Ctor = ARRAY[a.componentType] ?? Float32Array;
    const array = new Ctor(3 * a.itemSize);
    if (a.name === "position") array.set([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    g.setAttribute(a.name, new THREE.BufferAttribute(array, a.itemSize, a.normalized));
  }
  if (sig.indexed) g.setIndex([0, 1, 2]);
  return g;
}

/** The classic material GLTFLoader would make for the signature (1x1 textures in the filled slots). */
export function signatureMaterial(sig: RenderSignature, textures: THREE.Texture[]): THREE.Material {
  const m = sig.material;
  const tex = (srgb: boolean) => {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false; t.needsUpdate = true; textures.push(t);
    return t;
  };
  const material = m.kind === "unlit" ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial();
  if (m.maps.includes("map")) material.map = tex(true);
  if (material instanceof THREE.MeshStandardMaterial) {
    if (m.maps.includes("normalMap")) material.normalMap = tex(false);
    if (m.maps.includes("emissiveMap")) { material.emissiveMap = tex(true); material.emissive.setRGB(1, 1, 1); }
    if (m.maps.includes("metalRoughMap")) { material.roughnessMap = material.metalnessMap = tex(false); }
    if (m.maps.includes("aoMap")) material.aoMap = tex(false);
  }
  if (m.alphaTest) material.alphaTest = 0.5;
  if (m.transparent) { material.transparent = true; material.depthWrite = false; }
  material.side = m.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  material.vertexColors = m.vertexColors;
  material.userData = { ...(m.decal ? { decal: true } : {}), ...(m.additive ? { additive: true } : {}), ...(m.water ? { water: true } : {}) };
  return material;
}

/** The glow kinds a signature's draws take (settlement layer bucket rules). */
function glowKinds(sig: RenderSignature, material: THREE.Material): { glow: SettlementGlow; flame: boolean }[] {
  if (sig.material.additive) return [{ glow: "flame", flame: true }, { glow: "lamp-flame", flame: true }];
  return [{ glow: isSettlementGlowMaterial(material), flame: false }];
}

/** The dummy draws for a signature list, built through the kit and settlement paths. */
export function signatureDummies(signatures: readonly RenderSignature[], uniforms: SettlementMaterialUniforms):
  { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  group.name = "esSignaturePrecompile";
  const textures: THREE.Texture[] = [];
  const disposables: { dispose(): void }[] = [];
  const scene = new THREE.Group();
  const sources = signatures.map((sig, i) => {
    const root = new THREE.Object3D();
    root.userData.assetId = `sig${i}`;
    const mesh = new THREE.Mesh(signatureGeometry(sig), signatureMaterial(sig, textures));
    root.add(mesh); scene.add(root);
    disposables.push(mesh.geometry, mesh.material as THREE.Material);
    return { sig, root };
  });
  const kit = buildArchitectureKit({ scene } as unknown as GLTF);
  const identity = new THREE.Matrix4();
  sources.forEach(({ sig }, i) => {
    const part = kit.get(`sig${i}`)?.levels[0]?.[0];
    if (!part) return;
    glowKinds(sig, part.material).forEach(({ glow, flame }, k) => {
      // a second glow kind draws a clone, as the layer's materialVariant does
      const material = k === 0 ? part.material : cloneSettlementMaterial(part.material);
      if (material !== part.material) disposables.push(material);
      const flags = prepareSettlementMaterial(material, uniforms, glow, flame);
      // two entries: the merge path real batches take
      const geometry = mergeTransformedParts([
        { geometry: part.geometry, transforms: [identity], groundLinesM: [0] },
        { geometry: part.geometry, transforms: [identity], groundLinesM: [0] },
      ]);
      if (!geometry) return;
      disposables.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      setCastShadow(mesh, flags.castShadow); mesh.receiveShadow = true;
      mesh.renderOrder = flags.renderOrder;
      group.add(mesh);
    });
    disposables.push(part.material);
  });
  return {
    group,
    dispose: () => { for (const d of disposables) d.dispose(); for (const t of textures) t.dispose(); group.clear(); },
  };
}

/**
 * Compile the signature dummies into `targets` (`null` is the canvas) and
 * the shadow pass, `inFlight` compiles at a time, with the real scene's
 * lights, environment and fog. Resolves with the compile count; the dummies
 * are disposed after.
 */
export async function precompileSignatures(renderer: PrecompileRenderer, scene: THREE.Scene, camera: THREE.Camera,
  targets: readonly (THREE.RenderTarget | null)[], signatures: readonly RenderSignature[], inFlight: number,
  uniforms: SettlementMaterialUniforms = createSettlementMaterialUniforms()): Promise<number> {
  const { group, dispose } = signatureDummies(signatures, uniforms);
  group.position.copy(camera.position);
  group.updateMatrixWorld(true);
  // the scene's lit preparer (CSM, fixture lights) patches them as it patches every lit draw
  prepareLit(scene, group);
  try {
    const jobs = group.children.flatMap((mesh) => targets.map((target) => ({ root: mesh, target })));
    const n = await compileInBatches(renderer, scene, camera, jobs, inFlight);
    return n + await precompileShadowVariants(renderer, group, scene, inFlight);
  } finally {
    dispose();
  }
}
