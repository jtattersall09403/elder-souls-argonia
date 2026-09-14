import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * The vanilla Skyrim waterfall FX kit (decision 0064): `waterfall-fx-v1.glb`
 * parsed into the pieces the water runtime stacks along every compiled
 * cascade, plus the ROLE table that says how each of a piece's shapes is
 * shaded — which texture it binds, the UV-scroll rates the glTF export lost
 * (vault audit §4, tiles/s in the piece's own authored UV space, so uniform
 * scale never changes them), its emissive level, peak alpha and soft-depth
 * fade. Geometry and UVs are Bethesda's; every number in the table was read
 * off the NIF controllers; the shader that consumes it is ours
 * (`WaterfallKitMaterial.ts`).
 *
 * Frame of every piece (glTF Y-up, baked by the kit build): the falling
 * bodies and thin sheets hang DOWN −y from an origin at their top edge and
 * bulge forward +z as they descend (the bodytall foot is 4.4 m in front of
 * its lip, 13 m wide against 9.5 m at the top); the skirt stands on its
 * origin with the fog column rising +y and the foam wrapping forward +z;
 * the crest line lies flat, 5.1 m across x and 16 m along z with its scroll
 * running toward −z; the ring and ground-mist discs lie flat about their
 * centre; the mist card is a 10 m × 6 m plane in y–z pivoted at one end.
 */

/** Kit piece ids the stack places (asset stems in the GLB's `assetId` extras). */
export const KIT_PIECE = {
  body16: "vanilla:effects/fxwaterfallbodytall",
  body34: "vanilla:effects/fxwaterfallbodytall02",
  thin7: "vanilla:effects/fxwaterfallthin512x128",
  thin29: "vanilla:effects/fxwaterfallthin2048x128",
  crest: "vanilla:effects/fxrapidsfallsline01",
  ring: "vanilla:effects/fxrapidsringheavy",
  skirt: "vanilla:effects/fxwaterfallskirttallfront",
  mistCard: "vanilla:effects/fxwaterfallmistblastlite",
  groundMist: "vanilla:effects/ambient/fxmistlow01",
} as const;
export type KitPieceId = keyof typeof KIT_PIECE;

/** Measured piece dimensions the layout needs (m, unscaled; kit build 2026-09-14). */
export const KIT_DIMS = {
  /** Curved bodies: height below the origin, width at the top edge (the lip) and at the foot. */
  body16: { heightM: 14.9, topWidthM: 9.5, footWidthM: 12.9, footForwardM: 4.4 },
  body34: { heightM: 33.2, topWidthM: 9.6, footWidthM: 14.1, footForwardM: 6.2 },
  thin7: { heightM: 7.3, topWidthM: 2.0, footWidthM: 2.35, footForwardM: 0.6 },
  thin29: { heightM: 29.5, topWidthM: 2.0, footWidthM: 5.7, footForwardM: 1.3 },
  /** Crest line: across x, along z (−10 … +6.1 from the origin; the scroll runs toward −z). */
  crest: { acrossM: 5.1, alongM: 16.1, aheadM: 10, behindM: 6.1 },
  /** Ring: x × z about its centre. */
  ring: { xM: 20.6, zM: 15.7 },
  /** Skirt: width, foam height, fog column height, forward reach. */
  skirt: { widthM: 17.1, foamM: 3.6, columnM: 47.2, forwardM: 13.2, backM: 0.2 },
  /** Mist card: length along z from the pivot, height. */
  mistCard: { lengthM: 10.3, heightM: 5.9 },
  /** Ground mist disc diameter. */
  groundMist: { diameterM: 12.9 },
} as const;

/** Shape names the runtime never draws (editor helpers, unshipped textures). */
const DROPPED_SHAPES = ["EditorMarker", "boundPush", "Warp", "CurrentPlane"];

export type KitShadeKind = "whitewater" | "lit" | "mist";

/** How one shape of a piece is shaded: texture ids are the PNG kit's stems. */
export interface KitShapeRole {
  /** Substring of the NIF shape name (`pynNodeName`) this role matches. */
  match: string;
  kind: KitShadeKind;
  /** Albedo/coverage texture id (`waterfall-fx-textures/<id>.png`). */
  texture: string;
  /** Normal map id (lit shells only). */
  normal?: string;
  /** UV scroll, tiles per second, added to the authored UV (negative V = down the piece). */
  scroll: readonly [number, number];
  /** Second layer of the same texture at a near-but-unequal rate (0,0 = none). */
  scroll2?: readonly [number, number];
  /** U-scale breathe 1.00 ↔ 1.05 over 8.33 s (the thin sheets). */
  breathe?: boolean;
  /** Emissive multiple × colour (unlit whitewater / mist). */
  emissive: number;
  /** Peak alpha. */
  alpha: number;
  /** Coverage from the texture's LUMINANCE × alpha rather than alpha alone:
   * the textures Bethesda ran through a greyscale-to-alpha gradient
   * (`fxwhitewater02`, `fxfogheavy`) ship nearly opaque, their grey IS the
   * coverage. */
  covFromLum?: boolean;
  /** Soft-particle depth fade (m). */
  softDepthM: number;
  /** Upness for the falls irradiance: 0 vertical sheet, 1 flat on the pool. */
  upness: number;
}

/**
 * Bethesda's shader numbers per shape (audit §4). Order matters only where
 * two matches overlap (`Foam` before `Inner` is irrelevant; `Top06` etc. are
 * distinct). A shape with no role is dropped.
 */
export const KIT_SHAPE_ROLES: Readonly<Record<KitPieceId, readonly KitShapeRole[]>> = Object.freeze({
  body16: [
    { match: "Inner", kind: "lit", texture: "fxwatertile01", normal: "fxwatertile01_n", scroll: [0, -0.12],
      emissive: 1, alpha: 0.92, softDepthM: 0.07, upness: 0 },
    { match: "Foam", kind: "whitewater", texture: "fxwhitewater01", scroll: [0, -0.313], scroll2: [0.01, -0.333],
      emissive: 0.9, alpha: 0.8, softDepthM: 0.14, upness: 0 },
    { match: "CrossStream", kind: "whitewater", texture: "fxfluidtile01", scroll: [0, -0.333],
      emissive: 1.0, alpha: 0.8, softDepthM: 0.14, upness: 0 },
  ],
  body34: [
    { match: "Inner", kind: "lit", texture: "fxwatertile01", normal: "fxwatertile01_n", scroll: [0, -0.12],
      emissive: 1, alpha: 0.92, softDepthM: 0.07, upness: 0 },
    { match: "Foam", kind: "whitewater", texture: "fxwhitewater01", scroll: [0, -0.313], scroll2: [0.01, -0.333],
      emissive: 0.9, alpha: 0.8, softDepthM: 0.14, upness: 0 },
    { match: "CrossStream", kind: "whitewater", texture: "fxfluidtile01", scroll: [0, -0.333],
      emissive: 1.0, alpha: 0.8, softDepthM: 0.14, upness: 0 },
    { match: "jet", kind: "mist", texture: "vaportile01", scroll: [0.015, -0.2],
      emissive: 0.7 * 0.75, alpha: 0.55, softDepthM: 1.07, upness: 0.3 },
  ],
  thin7: [
    { match: "fallsMesh", kind: "whitewater", texture: "fxfluidtile01", scroll: [0.03, -0.857], scroll2: [0.03, -0.79], breathe: true,
      emissive: 0.7 * 0.75, alpha: 1, softDepthM: 0.57, upness: 0 },
    { match: "Object02", kind: "whitewater", texture: "fxfluidtile01", scroll: [0.03, -0.857], breathe: true,
      emissive: 0.7 * 0.75, alpha: 1, softDepthM: 0.57, upness: 0 },
  ],
  thin29: [
    { match: "fallsMesh", kind: "whitewater", texture: "fxfluidtile01", scroll: [0.03, -0.857], scroll2: [0.03, -0.79], breathe: true,
      emissive: 0.7 * 0.75, alpha: 1, softDepthM: 0.57, upness: 0 },
    { match: "fallsCrossMesh", kind: "whitewater", texture: "fxfluidtile01", scroll: [0.03, -0.857], breathe: true,
      emissive: 0.7 * 0.75, alpha: 1, softDepthM: 0.57, upness: 0 },
    { match: "jet", kind: "mist", texture: "vaportile01", scroll: [0.015, -0.2],
      emissive: 0.7 * 0.75, alpha: 0.55, softDepthM: 1.07, upness: 0.3 },
  ],
  crest: [
    { match: "Top06", kind: "whitewater", texture: "fxwhitewater02", scroll: [0, -0.5], covFromLum: true,
      emissive: 1.0, alpha: 0.8, softDepthM: 0.14, upness: 1 },
    { match: "Top08", kind: "whitewater", texture: "fxwhitewater01", scroll: [0, -0.075],
      emissive: 1.0, alpha: 0.8, softDepthM: 0.14, upness: 1 },
    { match: "Top09", kind: "whitewater", texture: "fxwhitewater01", scroll: [0, -0.15],
      emissive: 1.0, alpha: 0.8, softDepthM: 0.14, upness: 1 },
  ],
  ring: [
    { match: "ripplesBig", kind: "whitewater", texture: "fxwhitewater", scroll: [0, -0.667],
      emissive: 1.0, alpha: 0.8, softDepthM: 0.6, upness: 1 },
    { match: "ripplesSmall", kind: "whitewater", texture: "fxwhitewater", scroll: [0, -0.667], scroll2: [0.02, -0.61],
      emissive: 1.0, alpha: 0.8, softDepthM: 0.6, upness: 1 },
    { match: "jetPuffs", kind: "mist", texture: "fxcloudroundtile", scroll: [0, 0.375],
      emissive: 0.78 * 0.75, alpha: 0.6, softDepthM: 0.6, upness: 1 },
  ],
  skirt: [
    { match: "SkirtFillMesh", kind: "mist", texture: "fxcloudroundtile", scroll: [0, -0.158],
      emissive: 0.78 * 0.75, alpha: 0.45, softDepthM: 1.07, upness: 0.3 },
    { match: "jet03", kind: "mist", texture: "fxcloudroundtilestrip", scroll: [0, -0.545],
      emissive: 0.78 * 0.75, alpha: 0.55, softDepthM: 1.07, upness: 0.3 },
    { match: "Object04", kind: "whitewater", texture: "fxfogheavy", scroll: [0, -0.545], scroll2: [0.01, -0.56], covFromLum: true,
      emissive: 0.9, alpha: 0.55, softDepthM: 1.07, upness: 0.3 },
    { match: "newFog", kind: "mist", texture: "fxfogheavy", scroll: [0, 0.362], covFromLum: true,
      emissive: 0.78 * 0.75, alpha: 0.25, softDepthM: 1.07, upness: 0.5 },
  ],
  mistCard: [
    { match: "jet", kind: "mist", texture: "fxcloudroundtilestrip", scroll: [0, -0.158],
      emissive: 0.7 * 0.75, alpha: 0.6, softDepthM: 1.07, upness: 0.5 },
  ],
  groundMist: [
    { match: "FXMistLow", kind: "mist", texture: "cloudtile", scroll: [0.03, -0.017],
      emissive: 0.7 * 0.75, alpha: 0.4, softDepthM: 0.6, upness: 1 },
  ],
});

export interface KitShape {
  name: string;
  geometry: THREE.BufferGeometry;
  role: KitShapeRole;
  triangles: number;
}

export interface KitPiece {
  id: KitPieceId;
  assetId: string;
  shapes: KitShape[];
}

export type WaterfallKit = Partial<Record<KitPieceId, KitPiece>>;

function assetIdOf(object: THREE.Object3D): string | null {
  const id = object.userData?.assetId;
  return typeof id === "string" ? id : null;
}

/** Match a NIF shape name to its role, or null when the shape is not drawn. */
export function roleForShape(piece: KitPieceId, shapeName: string): KitShapeRole | null {
  if (DROPPED_SHAPES.some((d) => shapeName.includes(d))) return null;
  return KIT_SHAPE_ROLES[piece].find((r) => shapeName.includes(r.match)) ?? null;
}

/**
 * Index the loaded GLB by piece: each asset root's mesh children (the NIF
 * shapes, named by their `pynNodeName` extra) matched to a role. Geometry is
 * shared, never cloned — the instanced meshes reference it directly.
 */
export function parseWaterfallKit(gltf: GLTF): WaterfallKit {
  gltf.scene.updateMatrixWorld(true);
  const byAsset = new Map<string, KitPieceId>();
  for (const [id, asset] of Object.entries(KIT_PIECE)) byAsset.set(asset, id as KitPieceId);
  const kit: WaterfallKit = {};
  for (const root of gltf.scene.children) {
    const assetId = assetIdOf(root);
    const pieceId = assetId ? byAsset.get(assetId) : undefined;
    if (!assetId || !pieceId) continue;
    const shapes: KitShape[] = [];
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const name = typeof child.userData?.pynNodeName === "string" ? child.userData.pynNodeName : child.name;
      const role = roleForShape(pieceId, name);
      if (!role) return;
      // the build bakes every transform into the vertices; keep any residual
      // node transform honest anyway
      const geometry = mesh.geometry;
      if (!mesh.matrixWorld.equals(gltf.scene.matrixWorld)) {
        const local = gltf.scene.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
        if (!local.equals(new THREE.Matrix4())) geometry.applyMatrix4(local);
      }
      const index = geometry.index;
      shapes.push({ name, geometry, role,
        triangles: index ? index.count / 3 : geometry.getAttribute("position").count / 3 });
    });
    kit[pieceId] = { id: pieceId, assetId, shapes };
  }
  return kit;
}

/** Pieces the stack needs; a kit missing any of them cannot draw a fall. */
export const REQUIRED_PIECES: readonly KitPieceId[] = ["body16", "body34", "crest", "ring", "skirt", "mistCard", "groundMist"];

export function kitIsComplete(kit: WaterfallKit | undefined): kit is WaterfallKit {
  return !!kit && REQUIRED_PIECES.every((p) => (kit[p]?.shapes.length ?? 0) > 0);
}

/** Load and parse the kit from an app-composed URL; null when it cannot load. */
export async function loadWaterfallKit(url: string,
  loader?: { loadAsync(url: string): Promise<GLTF> }): Promise<WaterfallKit | null> {
  try {
    const gltfLoader = loader ?? new GLTFLoader();
    const gltf = await gltfLoader.loadAsync(url);
    const kit = parseWaterfallKit(gltf);
    return kitIsComplete(kit) ? kit : null;
  } catch {
    return null;
  }
}
