import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { createKitLoader } from "../assets/kitLoader";
import { useFrameWork } from "../scheduling/frameWorkContext";
import type { FrameJobHandle } from "../scheduling/frameWork";
import { useKitDecoders } from "../assets/useKitDecoders";
import { KitCache } from "./kitCache";
import { GroundPaintLayer } from "./GroundPaintLayer";
import {
  footprintDiagonalM,
  createPlacementResolver,
  runJointErrors,
  type RunJointSample,
  placementGroundAudit,
  settlementGroundAudits,
} from "./anchoring";
import {
  buildArchitectureKit, kitAssetMetaFromManifest, kitAssetMetaOf, type ArchitectureAsset, type ArchitecturePart,
} from "./kit";
import {
  batchVisibleAt,
  ladderClassKey,
  ladderLevelAt,
  mergeTransformedParts,
  quantizedLadder,
  type SettlementBatchView,
  vertexLayoutKey,
  type MergeEntry,
  settlementLadder,
  validateLodTriangles,
  validateMaterialTextureCap,
} from "./lod";
import {
  residentPlacementIdsAt,
  selectCollisionResidency,
} from "./collisionResidency";
import {
  cloneSettlementMaterial,
  createSettlementMaterialUniforms,
  isSettlementGlowMaterial,
  prepareSettlementMaterial,
  updateSettlementEnvironment,
  type SettlementMaterialUniforms,
} from "./materials";
import { isLanternShellMaterial } from "./fixtureGlow";
import { SettlementMaterialIdentities } from "./materialIdentity";
import {
  SETTLEMENT_COLLISION_FRAME,
  type GroundArea,
  type SettlementBundle,
  type SettlementCollisionShape,
  type SettlementFrameEvidence,
  type SettlementKitAssetMeta,
  type SettlementLayerProps,
  type SettlementPlacement,
  type SettlementPlacementGroundAudit,
  type SettlementProofState,
  type SettlementSolid,
} from "./types";
import { trimeshFromGeometry } from "../physics/floraSolids";
import { PRECIP_LAYER } from "../water/render/waterMaterial";
import {
  FLAME_TEXTURE_ASSET_ID, FLAME_TEXTURE_KIT, fixtureFromFireSocket, fixtureFromPiece,
  burnsByDay, drawsOwnFire, isFireSocket, isLightFixturePlacement, isSpriteHolderPlacement,
  SettlementLightFixtures,
  type LightFixture,
} from "./lighting";
import { isFlameCardMaterial } from "../fx/fire/flameAnchors";
import { mergeRunColliders, type RunColliderCache } from "./runColliders";
import { fixtureLightFieldOf } from "../render/fixtureLights";
import { DrawTargetLinker, type LinkingRenderer } from "../render/drawTargetLinker";
import { assertPoolsSchema, syncPlacePools } from "./pools";
import { TransientFetchError, fetchJsonWithRetry, loadGltfWithRetry } from "./fetchRetry";
import {
  SETTLEMENT_REQUERY_MOVE_M, useSettlementBundleSource,
  type AssembledSettlementBundle, type SettlementBundleSource,
} from "./settlementIndex";
import {
  effectTextureFile, isSmokeColumnPlacement, SMOKE_CALM_WIND, SMOKE_COLUMN_ASSET_ID,
  SMOKE_MAX_DISTANCE_M, SmokeColumns, type SmokeAnchor,
} from "./smokeColumn";
import { setCastShadow } from "../render/shadowCasters";
import { orderPieceRequests, requestKit, type PieceNeed } from "./pieceRequestOrder";
import {
  MAX_RENDER_DISTANCE_M, REBUILD_MOVE_M, placementDrawCapM, placementsInReachKey, settlementPassKind,
  type FullPassInputs,
} from "./settlementReach";
import { kitPartsDir, parseKitPartsIndex, type KitPartsIndex } from "../assets/kitParts";
import { SharedKtx2Textures } from "../assets/sharedTextures";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

interface DrawBucket {
  part: ArchitecturePart;
  /** The part's material for this bucket's glow kind (`materialVariant`). */
  material?: THREE.Material;
  transforms: THREE.Matrix4[];
  groundLinesM: number[];
  farTransforms: THREE.Matrix4[];
  farGroundLinesM: number[];
  /** An additive effect card (flame, glow overlay): drawn unlit and additive
   * under `fixtureFactor` (materials.ts), a fire's by day too. */
  flame?: boolean;
  /** The card's piece, or the fire kind it is mounted on, burns by day (lighting.ts `burnsByDay`). */
  alwaysLit?: boolean;
  /** A lantern's shell, lit from inside on the lamp clock (fixtureGlow.ts). */
  shell?: boolean;
  /** The chunk its placements stand in (`settlementChunkKey`). */
  chunk: string;
  /** Where its batch draws (chunk centre, level, ladder class). */
  view: SettlementBatchView;
  /** Its ladder class (`ladderClassKey`). */
  ladderClass: string;
}

/** What one settlement draw holds: every part of one cell drawing with one
 * material and one vertex layout, baked into one geometry. */
export interface DrawBatch {
  material: THREE.Material;
  drawFlags: { castShadow: boolean; renderOrder: number };
  entries: MergeEntry[];
  /** Per bucket, its key and copies: the merge is reused while these hold. */
  signatures: string[];
  /** It holds far-tier copies. */
  far: boolean;
  /** When it draws (F40); absent = always. */
  view?: SettlementBatchView;
}

/** The batch a bucket draws in: material instance (one per identity,
 * materialIdentity.ts), vertex layout, cell and draw flags. */
export function drawBatchKey(
  material: THREE.Material, geometry: THREE.BufferGeometry, cell: string,
  drawFlags: { castShadow: boolean; renderOrder: number },
): string {
  return `${material.uuid}|${vertexLayoutKey(geometry)}|${cell}|${drawFlags.castShadow ? 1 : 0}|${drawFlags.renderOrder}`;
}

/** Add one bucket's part and copies to its batch. */
export function addToBatch(
  batches: Map<string, DrawBatch>, key: string,
  row: {
    material: THREE.Material; drawFlags: DrawBatch["drawFlags"];
    far: boolean; entry: MergeEntry; signature: string; view?: SettlementBatchView;
  },
): void {
  const batch = batches.get(key) ?? {
    material: row.material, drawFlags: row.drawFlags,
    entries: [], signatures: [], far: false, view: row.view,
  };
  batch.entries.push(row.entry);
  batch.signatures.push(row.signature);
  batch.far ||= row.far;
  batches.set(key, batch);
}

/**
 * Swap a finished detached build into the live group. An empty build adds
 * nothing: `group.add()` with no argument logs three's "object not an
 * instance of THREE.Object3D" (walk 2 D1, SettlementLayer.tsx:738).
 */
export function swapInBuild(group: THREE.Group, next: THREE.Group): void {
  // Snapshot: `add` detaches each child from `next` as it goes.
  if (next.children.length) group.add(...[...next.children]);
}

/**
 * The mark a build leaves while it runs: the focus it builds for, and the
 * covered radius of the LIVE build until the new one swaps in. Resetting it
 * to 0 at the start made the per-frame rebuild check fire after 1 m of
 * walking and restart a sliced build over and over (walk 2 D1).
 */
export function buildStartMark(
  focus: { x: number; z: number }, liveCoveredRadiusM: number | null,
): { x: number; z: number; coveredRadiusM: number } {
  // No live build yet: an infinite radius, so the frame check moves on the
  // full REBUILD_MOVE_M rather than 1 m and the first build is not restarted.
  return { x: focus.x, z: focus.z,
    coveredRadiusM: liveCoveredRadiusM ?? Number.POSITIVE_INFINITY };
}

/** Margin (m) round an unresolved placement's position inside which an
 * arriving ground area can resolve it (a footprint's corner samples). */
export const MISSING_GROUND_MARGIN_M = 64;

/**
 * Whether an arriving ground area can resolve an incomplete build: it covers
 * (with the margin) the position of a placement the build could not seat.
 * An incomplete build is retried only on such an arrival, never on a timer: a
 * 2 s timer rebuilt Riverwalk forever inside rAF, a 2 s hitch, for a
 * placement whose ground was outside the loaded chunks (perf10 diag Q2). A
 * retry is still deferred while a build runs: retrying cancelled it (walk 9:
 * Gang Ground, 300 s at `loading`).
 */
export function groundArrivalResolves(area: readonly [number, number, number, number],
  missing: readonly (readonly [number, number])[]): boolean {
  const m = MISSING_GROUND_MARGIN_M;
  for (const [x, z] of missing) {
    if (x >= area[0] - m && x <= area[2] + m && z >= area[1] - m && z <= area[3] + m) return true;
  }
  return false;
}

/**
 * The manifest path of the kit that publishes the billboard flame: its bundle
 * entry where the bundle lists it, else the same kits folder as any kit the
 * bundle lists (a bundle placing nothing from works-v1 does not list it).
 */
export function flameManifestPath(kits: Record<string, { manifest: string }>): string {
  const listed = kits[FLAME_TEXTURE_KIT]?.manifest;
  if (listed) return listed;
  const any = Object.values(kits)[0]?.manifest;
  const folder = any ? any.replace(/[^/]*$/, "") : "kits/";
  return `${folder}${FLAME_TEXTURE_KIT}.kit.json`;
}

/** The works-v1 `effectTextures` ids a fixture sprite may name (`role` flame or glow). */
export function spriteTextureIds(manifest: unknown): string[] {
  const rows = (manifest as { effectTextures?: Record<string, { role?: string }> } | null)?.effectTextures;
  return Object.entries(rows ?? {})
    .filter(([, row]) => row?.role === "flame" || row?.role === "glow")
    .map(([id]) => id).sort();
}

/** A load failure as text: a failed image load rejects with an Event, which prints as "[object Event]". */
function describeLoadError(error: unknown): string {
  if (error instanceof Error) return error.message;
  const target = (error as { target?: { src?: unknown } } | null)?.target;
  if (typeof target?.src === "string") return `could not load ${target.src}`;
  return String(error);
}

const EMPTY_FINAL_TRANSFORM_EVIDENCE = Object.freeze({
  finalAnchoredPlacements: 0, nearInstances: 0, farMergedInstances: 0,
  groundBoundInstances: 0, shadowPairedDraws: 0,
  shadowPairFailures: Object.freeze([] as string[]),
  runJointFailures: Object.freeze([] as string[]),
});

/** Settlement pieces are bucketed per square of this edge (m), so the
 * instances of a part off screen are frustum-culled with their square (walk 5
 * perf: one bucket spanning the place was never culled from inside it). */
export const SETTLEMENT_CHUNK_M = 48;

/** The chunk key of a world position. */
export function settlementChunkKey(x: number, z: number): string {
  return `${Math.floor(x / SETTLEMENT_CHUNK_M)},${Math.floor(z / SETTLEMENT_CHUNK_M)}`;
}


/** The camera moves this far (m) before the batches' visibility is chosen again. */
const BATCH_VISIBILITY_MOVE_M = 2;

/** The cell a batch draws in (F40): its 48 m chunk (culled with its square,
 * lit by its own lamps: fixture lights are chosen per object from its
 * bounds), its kit level and its ladder class. Never the camera: every key is
 * built once and walking only flips visibility (`batchVisibleAt`). */
export function settlementBatchCell(chunk: string, level: number, ladderClass: string): string {
  return `c${chunk}|L${level}|${ladderClass}`;
}

/** The centre of a chunk, world metres. */
export function settlementChunkCentre(chunk: string): { x: number; z: number } {
  const [cx, cz] = chunk.split(",").map(Number);
  return { x: (cx + 0.5) * SETTLEMENT_CHUNK_M, z: (cz + 0.5) * SETTLEMENT_CHUNK_M };
}

/** Show the prebuilt batches that draw at `focus`, hide the rest. */
export function applyBatchVisibility(group: THREE.Object3D, focus: { x: number; z: number }): void {
  for (const child of group.children) {
    const view = child.userData.esSettlementView as SettlementBatchView | undefined;
    if (view) child.visible = batchVisibleAt(view, focus);
  }
}

/** Dispose and detach everything the layer put in `group`: the merged batch
 * geometries the next build does not keep (`keep`: the batch cache's live
 * geometries). Materials belong to the kit,
 * so a swap never frees a material the next build still draws with. */
function disposeChildren(group: THREE.Group, keep?: ReadonlySet<THREE.BufferGeometry>): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.Mesh && !keep?.has(child.geometry)) child.geometry.dispose();
  }
}

/**
 * What a build draws, as one string: every bucket's key and instance counts
 * and the sum of its translations to the millimetre. A retry that resolves
 * exactly what is already live is not swapped in (check-in 2 item 2).
 */
function buildSignature(buckets: Map<string, DrawBucket>): string {
  const rows: string[] = [];
  for (const [key, bucket] of buckets) {
    let sum = 0;
    for (const m of bucket.transforms) sum += m.elements[12] + m.elements[13] + m.elements[14];
    for (const m of bucket.farTransforms) sum += m.elements[12] + m.elements[13] + m.elements[14];
    rows.push(`${key}:${bucket.transforms.length}:${bucket.farTransforms.length}:${Math.round(sum * 1000)}`);
  }
  return rows.sort().join(",");
}

/** How long a finished build waits for its programs to link before it swaps
 * in anyway (a driver without parallel compile links on first draw). */
const SETTLEMENT_LINK_WAIT_MS = 4000;

/** A far merge's identity: its instance count and every transform and ground
 * line to the millimetre. The same instances reuse the merged geometry. */
function farSignatureOf(transforms: readonly THREE.Matrix4[], groundLinesM: readonly number[]): string {
  let sum = 0;
  transforms.forEach((m, i) => {
    const e = m.elements;
    sum += (e[12] * 3 + e[13] * 5 + e[14] * 7 + e[0] + e[2] * 11 + groundLinesM[i] * 13) * (i + 1);
  });
  return `${transforms.length}:${Math.round(sum * 1000)}`;
}
/** After a kit fails its retries (`fetchRetry`), the layer asks for it again this much later, ms. */
const KIT_RETRY_MS = 5000;
export const SETTLEMENT_PROOF_KEY = "__STUDIO_SETTLEMENT_DEBUG__";

type SettlementProofHost = typeof globalThis & {
  __STUDIO_SETTLEMENT_DEBUG__?: SettlementProofState;
};

/** Read-only evidence for browser probes; it exposes no runtime controls. */
export function readSettlementProof(): SettlementProofState | undefined {
  return (globalThis as SettlementProofHost).__STUDIO_SETTLEMENT_DEBUG__;
}

function publishSettlementProof(state: SettlementProofState): void {
  // `frames` stays the layer's own live counter object (see SettlementLayer):
  // the proof is frozen, the per-frame evidence is not republished per frame.
  const grounding = state.grounding.map((report) => Object.freeze({
    ...report,
    placements: Object.freeze(report.placements.map((placement) => Object.freeze({ ...placement }))),
  }));
  (globalThis as SettlementProofHost).__STUDIO_SETTLEMENT_DEBUG__ = Object.freeze({
    ...state,
    grounding: Object.freeze(grounding),
    finalTransformEvidence: Object.freeze({
      ...state.finalTransformEvidence,
      shadowPairFailures: Object.freeze([...state.finalTransformEvidence.shadowPairFailures]),
      runJointFailures: Object.freeze([...state.finalTransformEvidence.runJointFailures]),
    }),
    collision: Object.freeze({
      ...state.collision,
      activeSettlementIds: Object.freeze([...state.collision.activeSettlementIds]),
      residentPlacementIds: Object.freeze([...state.collision.residentPlacementIds]),
      omittedPlacementIds: Object.freeze([...state.collision.omittedPlacementIds]),
    }),
  });
}

const emptyCollisionProof = () => ({
  status: "loading" as const,
  activeSettlementIds: [], residentPlacementIds: [], omittedPlacementIds: [],
  parts: 0, requiredResidentParts: 0, partBudget: 0, coveredRadiusM: 0,
});

/**
 * The published settlements in range of `at` (S8: the per-place bundles the
 * index names, `settlementIndex.ts`), refused unless the schema and the
 * collision frame are the ones this layer draws.
 */
export async function loadSettlementBundle(
  source: SettlementBundleSource, at: { x: number; z: number } | null, rangeM?: number,
): Promise<AssembledSettlementBundle> {
  const bundle = await source.load(at, rangeM);
  // 16h item 5: schema 2 carried anchorClass, parentPlacementId,
  // mountOffsetM and the water fields; schema 3 adds the run record every
  // modular-run piece is seated on (check-in 3 §2) and the treatment kind
  // and aprons (§5). An older bundle is refused rather than drawn with its
  // runs stepped at every joint. Schema 4 adds the optional `yFinal` flag
  // (16k walk 2); a schema-3 bundle is read as "no placement is final".
  if (bundle.bundleIds.length === 0) return bundle;   // nothing published in range
  // Schema 5 adds a place's optional `pools` (16k walk 4); pools on an older
  // schema are refused (`assertPoolsSchema`).
  if (bundle.schemaVersion !== 3 && bundle.schemaVersion !== 4 && bundle.schemaVersion !== 5) {
    throw new Error(`unsupported settlement schema ${bundle.schemaVersion}`);
  }
  assertPoolsSchema(bundle.schemaVersion, bundle.settlements);
  if (bundle.collisionFrame !== SETTLEMENT_COLLISION_FRAME) {
    throw new Error(`unsupported settlement collision frame ${bundle.collisionFrame}`);
  }
  return bundle;
}

/**
 * The published kit manifest, reduced to what the runtime needs. Every asset
 * must carry a mined or measured `designedSinkM`; the layer refuses to guess
 * a height from a class table (16h item 1), so a manifest without it fails
 * loudly at the placement, not silently at the ground line.
 */
export async function loadKitAssetMeta(
  url: string,
): Promise<Map<string, SettlementKitAssetMeta>> {
  return kitAssetMetaFromManifest(await fetchJsonWithRetry(url), url);
}

/**
 * The colliders of one placed piece (16h item 4).
 *
 * A `mesh` or `convex` piece collides as its own LOD0 triangles, one trimesh
 * per primitive, through the same helper the rocks use
 * (`floraSolids.trimeshFromGeometry`, 0071 §5): a bounding box across a gate
 * arch is an invisible wall where the road goes. The mesh geometry is baked
 * through the part's local matrix and the placement scale; the body still
 * carries the position and the yaw.
 *
 * Only pieces with no drawn triangles of their own (measured manifest proxy
 * boxes, capsule pieces) stay boxes.
 */
const TRIMESH_COLLISION_KINDS = new Set(["mesh", "convex"]);

function trimeshParts(
  placement: SettlementPlacement,
  parts: ArchitecturePart[],
): SettlementCollisionShape[] {
  if (!parts?.length) {
    throw new Error(
      `${placement.id}: ${placement.collision.kind} collision needs LOD0 geometry and none is loaded`,
    );
  }
  return parts.map((part) => {
    const position = part.geometry.getAttribute("position");
    const index = part.geometry.index;
    if (!position || !index) {
      throw new Error(
        `${placement.id}: ${placement.kit}/${placement.assetId} LOD0 part has no index buffer; `
        + "refusing to collide it as a box",
      );
    }
    const matrix = part.localMatrix.clone().premultiply(
      new THREE.Matrix4().makeScale(placement.scale, placement.scale, placement.scale),
    );
    const vertices = new Float32Array(position.count * 3);
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      vertices[i * 3] = point.x; vertices[i * 3 + 1] = point.y; vertices[i * 3 + 2] = point.z;
    }
    const mesh = trimeshFromGeometry(vertices, index.array);
    return { kind: "trimesh" as const, vertices: mesh.vertices, indices: mesh.indices };
  });
}

export type SolidCache = Map<string, { signature: string; solid: SettlementSolid | null }>;

/**
 * One placement's collider as pump steps (perf10 O5). A trimesh collider is up
 * to ~30 ms of vertex baking, so it yields once BEFORE baking: each trimesh is
 * its own `next()` and the frame budget check runs between them. A collider
 * whose placement, asset and final matrix are unchanged since the last build
 * is reused from `cache` with no step. Every result is recorded in `kept`.
 */
export function* solidSteps(
  placement: SettlementPlacement,
  transform: THREE.Matrix4,
  buryM: number,
  parts: ArchitecturePart[],
  cache: SolidCache,
  kept: SolidCache,
): Generator<void, SettlementSolid | null> {
  const signature = `${placement.kit}|${placement.assetId}|${placement.scale}|`
    + `${placement.collision.kind}|${transform.elements.join(",")}|${buryM}`;
  const reused = cache.get(placement.id);
  let solid: SettlementSolid | null;
  if (reused?.signature === signature) solid = reused.solid;
  else {
    if (TRIMESH_COLLISION_KINDS.has(placement.collision.kind)) yield;
    solid = solidFrom(placement, transform, buryM, parts);
  }
  kept.set(placement.id, { signature, solid });
  return solid;
}

export function solidFrom(
  placement: SettlementPlacement,
  transform: THREE.Matrix4,
  buryM: number,
  parts: ArchitecturePart[],
): SettlementSolid | null {
  if (placement.collision.kind === "none") return null;
  if (placement.collision.frame !== SETTLEMENT_COLLISION_FRAME) {
    throw new Error(`${placement.id}: untagged/old collision frame refused`);
  }
  // The collider stands exactly where the draw does, mount chain, pitch and
  // rotation sign included: it reads the SAME final matrix (16h item 3).
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  transform.decompose(position, rotation, new THREE.Vector3());
  const solid = (collisionParts: SettlementCollisionShape[]): SettlementSolid | null =>
    collisionParts.length
    ? { id: placement.id, frame: SETTLEMENT_COLLISION_FRAME,
        position: [position.x, position.y, position.z] as [number, number, number],
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as
          [number, number, number, number],
        scale: placement.scale,
        parts: collisionParts }
    : null;
  if (TRIMESH_COLLISION_KINDS.has(placement.collision.kind)) {
    return solid(trimeshParts(placement, parts));
  }
  const measuredParts = placement.collision.parts?.flatMap((part) => {
    const minY = Math.min(part.offsetM[1] + part.halfExtentsM[1] - 0.05,
      part.offsetM[1] - part.halfExtentsM[1] + buryM);
    const maxY = part.offsetM[1] + part.halfExtentsM[1];
    if (maxY <= minY) return [];
    return [{
      kind: "box" as const,
      halfExtentsM: [part.halfExtentsM[0], (maxY - minY) / 2, part.halfExtentsM[2]] as
        [number, number, number],
      offsetM: [part.offsetM[0], (maxY + minY) / 2, part.offsetM[2]] as
        [number, number, number],
    }];
  });
  const collisionParts: SettlementCollisionShape[] = measuredParts?.length
    ? measuredParts
    : parts.flatMap((part) => {
      part.geometry.computeBoundingBox();
      if (!part.geometry.boundingBox) return [];
      const box = part.geometry.boundingBox.clone().applyMatrix4(part.localMatrix);
      // Do not create a standable ledge for the buried slice.
      box.min.y = Math.min(box.max.y - 0.05, box.min.y + buryM);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) return [];
      return [{ kind: "box" as const,
        halfExtentsM: [size.x / 2, size.y / 2, size.z / 2] as [number, number, number],
        offsetM: [centre.x, centre.y, centre.z] as [number, number, number] }];
    });
  return solid(collisionParts);
}

export function SettlementLayer({
  baseUrl, focusRef, groundAt, groundArrivals, quality, environment, onSolids, onStats, materialPatch,
  rebuildRef, onDoors, kitCache: sharedKitCache, lightFixtures: sharedLightFixtures, onError,
  localSurfaces, ringPendingRef,
}: SettlementLayerProps) {
  const root = useRef<THREE.Group>(null);
  const [bundle, setBundle] = useState<SettlementBundle | null>(null);
  // The app's settlement source (SettlementBundleSourceContext), else the
  // layer's own; `queriedAt` is where the bundles in range were last picked.
  const bundleSource = useSettlementBundleSource(baseUrl);
  const queriedAt = useRef<{ x: number; z: number } | null>(null);
  const loadedBundle = useRef<AssembledSettlementBundle | null>(null);
  const [queryRevision, setQueryRevision] = useState(0);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  // An effect sprite (flame, smoke) that failed to load: reported, never fatal;
  // the places draw without the sprite (decision 0052 addendum 2026-09-28).
  // One slot per sprite, owned by the effect that loads it: each load clears
  // its own slot when it starts (a new manifest), so a later success clears
  // an earlier failure and the two never overwrite each other.
  const [effectErrors, setEffectErrors] = useState<{ flame: string | null; smoke: string | null }>(
    { flame: null, smoke: null });
  const setEffectError = useCallback((sprite: "flame" | "smoke", message: string | null) =>
    setEffectErrors((current) => (current[sprite] === message ? current : { ...current, [sprite]: message })), []);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // Loaded part GLTFs, keyed `kit#asset` (decision 0120). Arrivals queue in `arrived` and join this
  // map only between builds (useFrame), so a stream of pieces never cancels
  // a running build over and over.
  const [gltfs, setGltfs] = useState<Map<string, GLTF>>(() => new Map());
  const arrived = useRef(new Map<string, GLTF>());
  // Each kit's parts index, fetched once.
  const [partIndexes, setPartIndexes] = useState<Map<string, KitPartsIndex>>(() => new Map());
  const pendingIndexes = useRef(new Set<string>());
  // The spawn ring (0120 rule 2): the request keys in the near band at the
  // first request pass; the warm gate waits until a build draws them all.
  const ringKeys = useRef<string[] | null>(null);
  useEffect(() => {
    if (!ringPendingRef) return undefined;
    ringPendingRef.current = 1;
    return () => { ringPendingRef.current = 0; };
  }, [ringPendingRef]);
  // Per-asset kit truth (designed sink, waterline, anchor class): the runtime
  // reads the SAME published manifest the compile measured (16h item 1).
  const [manifests, setManifests] = useState<Map<string, Map<string, SettlementKitAssetMeta>>>(
    () => new Map());
  const pendingKits = useRef(new Set<string>());
  /** A kit or kit manifest that failed after its retries (reported, retried after KIT_RETRY_MS). */
  const [kitError, setKitError] = useState<string | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [kitRetry, setKitRetry] = useState(0);
  const kitRetryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingManifests = useRef(new Set<string>());
  const decoders = useKitDecoders(baseUrl);
  // The scene's shared cache when one is injected (the interior loader reads
  // the same one), else the layer's own.
  const ownKitCache = useMemo(() => new KitCache(), []);
  const kitCache = sharedKitCache ?? ownKitCache;
  const [revision, setRevision] = useState(0);
  // A walk that changed what is in reach (settlementReach.ts): a reach pass, never a bucket pass.
  const [reachRevision, setReachRevision] = useState(0);
  // The inputs of the last full pass on screen and the reach key of the last pass.
  const lastFull = useRef<FullPassInputs | null>(null);
  const liveReachKey = useRef<string | null>(null);
  const builtAt = useRef<{ x: number; z: number; coveredRadiusM: number } | null>(null);
  // The covered radius of the build on screen, held while a new one runs.
  const liveCoveredRadiusM = useRef<number | null>(null);
  // Positions [x, z] of the placements the last build could not seat, and
  // whether a ground arrival over one of them asks for a retry.
  const missing = useRef<[number, number][]>([]);
  const missingLogged = useRef("");
  const arrivals = useRef<GroundArea[]>([]);
  const retryDue = useRef(false);
  useEffect(() => groundArrivals?.((area) => { arrivals.current.push(area); }), [groundArrivals]);
  const collisionFailure = useRef<SettlementProofState["collision"] | null>(null);
  // What the live group draws, so a retry that resolves the same set is not
  // swapped in; and how many draws the last swap put on screen.
  const liveSignature = useRef("");
  /** Where the live batches' visibility was last chosen (F40). */
  const visibleAt = useRef<{ x: number; z: number } | null>(null);
  const liveDraws = useRef(0);
  // Per-frame evidence for the flash probe (check-in 2 item 2): a frame whose
  // live group is empty while the last finished build drew something is a
  // building that vanished. One mutable object, referenced by every proof.
  const frames = useMemo<SettlementFrameEvidence>(() => ({
    frames: 0, blankFrames: 0, swaps: 0, skippedSwaps: 0, fullPasses: 0, reachPasses: 0, liveChildren: 0,
  }), []);
  // The whole build is sliced over frames at priority 40 — last, behind
  // colliders, terrain and vegetation — and assembled into a DETACHED group
  // that replaces the live one in a single final step, so a half-built
  // settlement is never on screen (owner 2026-09-20, walking stutter).
  const running = useRef<FrameJobHandle | null>(null);
  const queue = useFrameWork();
  const uniforms = useMemo<SettlementMaterialUniforms>(createSettlementMaterialUniforms, []);
  // Chimney smoke (smokeColumn.ts): one draw for every anchored column, made
  // once the effect texture named by its kit manifest has loaded.
  const [smoke, setSmoke] = useState<SmokeColumns | null>(null);
  const smokeAnchors = useRef<SmokeAnchor[]>([]);
  // Light fixtures (lighting.ts): injected by the scene, else the layer's own,
  // lighting through the scene's fixture light field (render/fixtureLights).
  const { camera: sceneCamera, scene, gl } = useThree();
  const linker = useMemo(() => new DrawTargetLinker(gl as unknown as LinkingRenderer, scene), [gl, scene]);
  useEffect(() => { linker.attach(); return () => linker.detach(); }, [linker]);
  const ownLightFixtures = useMemo(
    () => (sharedLightFixtures ? null
      : new SettlementLightFixtures(uniforms.esSettlementNight, fixtureLightFieldOf(scene))),
    [sharedLightFixtures, uniforms, scene]);
  const lightFixtures = sharedLightFixtures ?? ownLightFixtures!;
  useEffect(() => () => ownLightFixtures?.dispose(), [ownLightFixtures]);
  // Smoke and billboard flames draw on the post-water layer (like rain): the
  // camera must see it in a plain render too, where no water pipeline runs.
  useEffect(() => { sceneCamera.layers.enable(PRECIP_LAYER); }, [sceneCamera]);
  const placementById = useMemo(
    () => new Map((bundle?.placements ?? []).map((p) => [p.id, p])), [bundle]);

  useEffect(() => {
    collisionFailure.current = null;
    publishSettlementProof({ status: "loading", settlements: 0, placements: 0,
      renderedPlacements: 0, draws: 0, triangles: 0, grounding: [],
      finalTransformEvidence: EMPTY_FINAL_TRANSFORM_EVIDENCE,
      collision: emptyCollisionProof(), frames });
  }, [baseUrl, frames]);

  useEffect(() => {
    if (!rebuildRef) return undefined;
    rebuildRef.current = () => setRevision((v) => v + 1);
    return () => { rebuildRef.current = null; };
  }, [rebuildRef]);

  useEffect(() => {
    let cancelled = false;
    const at = { x: focusRef.current.x, z: focusRef.current.z };
    queriedAt.current = at;
    // The pick reaches everything this layer can draw before the next
    // re-pick: the far-LOD draw distance at this quality, plus the move
    // that triggers the re-pick (S8 review round).
    const rangeM = MAX_RENDER_DISTANCE_M * (quality?.architectureDrawScale ?? 1) + SETTLEMENT_REQUERY_MOVE_M;
    loadSettlementBundle(bundleSource, at, rangeM).then((data) => {
      if (cancelled) return;   // a newer pick (or unmount) owns the layer now
      // Only the validated set is handed to the followers (groundcover,
      // sockets, navigation), and a set with an unchanged content key
      // does not rebuild.
      bundleSource.publish(data);
      setBundleError(null);   // any successful pick clears the bundle line
      if (data.key === loadedBundle.current?.key) return;
      loadedBundle.current = data;
      setBundle(data);
      // The door interaction hook (0103 decision 4): the door records go to
      // whoever runs the doors; the layer itself draws no door.
      onDoors?.(data.doors ?? []);
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (error instanceof TransientFetchError) {
        // the connection, not the data: reported, and the pick runs again
        setBundleError(`settlement bundle failed: ${error.message}; retrying`);
        clearTimeout(kitRetryTimer.current);
        kitRetryTimer.current = setTimeout(() => setQueryRevision((n) => n + 1), KIT_RETRY_MS);
        return;
      }
      const failure = error instanceof Error ? error : new Error(String(error));
      bundleSource.fail(failure);
      setFatalError(failure);
    });
    return () => { cancelled = true; };
    // onDoors is read once per bundle load, like the bundle itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleSource, queryRevision]);

  // The loaded places' pools go to the injected water registry; a place that
  // leaves the set (or the layer unmounting) clears its own.
  const registeredPools = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!localSurfaces) return;
    registeredPools.current = syncPlacePools(localSurfaces, registeredPools.current, bundle?.settlements ?? []);
  }, [localSurfaces, bundle]);
  useEffect(() => {
    if (!localSurfaces) return undefined;
    return () => { registeredPools.current = syncPlacePools(localSurfaces, registeredPools.current, []); };
  }, [localSurfaces]);

  // Stream kit GLBs by the references in visual range. The complete exemplar
  // shelf is hundreds of MB; loading it province-wide would undo instancing's
  // benefit before the first frame. A route kit or culture shelf arrives only
  // when its placed references can actually be drawn.
  // Parts share the province texture pool by URI: each texture is transcoded
  // and uploaded once however many parts name it (sharedTextures.ts).
  const partLoader = useMemo(() => createKitLoader(decoders)
    .setKTX2Loader(new SharedKtx2Textures(decoders.ktx2) as unknown as KTX2Loader), [decoders]);
  useEffect(() => {
    if (!bundle) return;
    const focus = focusRef.current;
    const residents = residentPlacementIdsAt(bundle.settlements, focus);
    const drawScale = quality?.architectureDrawScale ?? 1;
    const wantedPlacements = bundle.placements.filter((p) => !isSmokeColumnPlacement(p)
      && (residents.has(p.id)
        || Math.hypot(p.positionM[0] - focus.x, p.positionM[2] - focus.z) <= placementDrawCapM(p.kind) * drawScale));
    const wanted = new Set(wantedPlacements.map((p) => p.kit));
    // One need per placement, keyed by the piece (0120); ordered in pieceRequestOrder.
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4()
      .multiplyMatrices(sceneCamera.projectionMatrix, sceneCamera.matrixWorldInverse));
    const sphere = new THREE.Sphere();
    const needs: PieceNeed[] = [];
    for (const p of wantedPlacements) {
      if (!partIndexes.has(p.kit)) continue;   // its index is still out
      const distanceM = Math.hypot(p.positionM[0] - focus.x, p.positionM[2] - focus.z);
      const capM = placementDrawCapM(p.kind);
      let band = 0;
      try {
        band = ladderLevelAt(settlementLadder(footprintDiagonalM(p), 3, bundle.lod, capM, drawScale), distanceM);
      } catch { band = 0; }   // a two-tier piece: the build's own gate names it
      sphere.center.set(p.positionM[0], p.positionM[1], p.positionM[2]);
      sphere.radius = footprintDiagonalM(p) * 0.5 * p.scale + 1;
      needs.push({ key: `${p.kit}#${p.assetId}`, distanceM, band,
        inView: frustum.intersectsSphere(sphere) });
    }
    const requests = orderPieceRequests(needs);
    // The ring is fixed at the first pass that knows every wanted kit's format.
    if (!ringKeys.current && [...wanted].every((id) => partIndexes.has(id))) {
      ringKeys.current = requests.filter((r) => r.ring).map((r) => r.key);
    }
    const failed = (what: string) => (error: unknown) => {
      if (!(error instanceof TransientFetchError)) {
        setFatalError(new Error(`settlement kit ${what} failed: `
          + `${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      // A kit that will not arrive after its retries (a dropped connection on
      // a phone) is reported, never fatal (a refused manifest still is): the
      // layer asks again after KIT_RETRY_MS (`kitRetry`), and the report clears when it arrives.
      setKitError(`settlement kit ${what} failed: `
        + `${error instanceof Error ? error.message : String(error)}; retrying`);
      clearTimeout(kitRetryTimer.current);
      kitRetryTimer.current = setTimeout(() => setKitRetry((n) => n + 1), KIT_RETRY_MS);
    };
    for (const id of wanted) {
      const kit = bundle.kits[id];
      if (!kit) {
        setFatalError(new Error(`settlement bundle references missing kit ${id}`));
        continue;
      }
      if (!partIndexes.has(id) && !pendingIndexes.current.has(id)) {
        pendingIndexes.current.add(id);
        fetchJsonWithRetry(`${baseUrl}${kit.parts}`, { priority: "high" })
          .then((raw) => {
            const index = parseKitPartsIndex(raw, id, kit.parts);
            setPartIndexes((current) => new Map(current).set(id, index));
          })
          .catch(failed(`parts index ${id}`))
          .finally(() => pendingIndexes.current.delete(id));
      }
      if (!manifests.has(id) && !pendingManifests.current.has(id)) {
        pendingManifests.current.add(id);
        loadKitAssetMeta(`${baseUrl}${kit.manifest}`).then((assets) => {
          setManifests((current) => new Map(current).set(id, assets));
        }).catch(failed(`manifest ${id}`))
          .finally(() => pendingManifests.current.delete(id));
      }
    }
    for (const request of requests) {
      const id = request.key;
      if (gltfs.has(id) || arrived.current.has(id) || pendingKits.current.has(id)) continue;
      const kitId = requestKit(id);
      const kit = bundle.kits[kitId];
      const row = partIndexes.get(kitId)!.assets[id.slice(kitId.length + 1)];
      if (!row) {
        setFatalError(new Error(`settlement piece ${id} has no published part (${kit.parts})`));
        continue;
      }
      const url = `${baseUrl}${kitPartsDir(kit)}${row.file}`;
      pendingKits.current.add(id);
      if (!performance.getEntriesByName("es:load:kit-fetch-start").length) performance.mark("es:load:kit-fetch-start");
      kitCache.load(id, url, (u) => loadGltfWithRetry(u, partLoader,
        { priority: request.priority })).then((gltf) => {
        if (!performance.getEntriesByName("es:load:kit-fetch-end").length) performance.mark("es:load:kit-fetch-end");
        arrived.current.set(id, gltf);
      }).catch(failed(id))
        .finally(() => pendingKits.current.delete(id));
    }
    if (requests.every((r) => gltfs.has(r.key)) && [...wanted].every((id) => manifests.has(id))) setKitError(null);
  }, [bundle, revision, reachRevision, baseUrl, focusRef, quality?.architectureDrawScale, gltfs, manifests,
      decoders, kitCache, kitRetry, partIndexes, partLoader, sceneCamera]);
  useEffect(() => () => clearTimeout(kitRetryTimer.current), []);

  // One index (and one set of material clones) per loaded GLTF for the
  // layer's life: a new kit arriving must not re-clone every other kit's
  // materials (new materials meant new programs and relinks per kit load).
  // A part's GLTF holds one asset; its kit's map gathers every loaded part.
  const kitIndex = useRef(new WeakMap<GLTF, ReturnType<typeof buildArchitectureKit>>());
  const kits = useMemo(() => {
    const out = new Map<string, Map<string, ArchitectureAsset>>();
    for (const [key, gltf] of gltfs) {
      let kit = kitIndex.current.get(gltf);
      if (!kit) { kit = buildArchitectureKit(gltf); kitIndex.current.set(gltf, kit); }
      const kitId = requestKit(key);
      let into = out.get(kitId);
      if (!into) { into = new Map(); out.set(kitId, into); }
      for (const [assetId, asset] of kit) into.set(assetId, asset);
    }
    return out;
  }, [gltfs]);
  // A part material drawn with a second glow kind (a fire asset in a brazier,
  // burning by day, and the same asset alone) gets one clone per kind for the
  // layer's life, so no material flips kind (and relinks) between builds.
  const glowVariants = useRef(new Map<THREE.Material, Map<string, THREE.Material>>());
  const materialVariant = useCallback((material: THREE.Material, kind: string): THREE.Material => {
    let byKind = glowVariants.current.get(material);
    if (!byKind) { byKind = new Map([[kind, material]]); glowVariants.current.set(material, byKind); }
    let variant = byKind.get(kind);
    if (!variant) { variant = cloneSettlementMaterial(material); byKind.set(kind, variant); }
    return variant;
  }, []);
  // One material instance per identity for the layer's life (materialIdentity.ts):
  // pieces of different assets and kits sharing textures and factors share a draw.
  const identities = useMemo(() => new SettlementMaterialIdentities(), []);
  // Merged batch geometries kept across builds while their copies are unchanged.
  const farCache = useRef(new Map<string, { signature: string; geometry: THREE.BufferGeometry }>());
  // Colliders kept across builds while their placement's final matrix is unchanged.
  const solidCache = useRef<SolidCache>(new Map());
  // Joined run colliders kept while their member solids (from solidCache) are the same objects.
  const runColliderCache = useRef<RunColliderCache>(new Map());
  useEffect(() => { solidCache.current = new Map(); runColliderCache.current = new Map(); }, [bundle]);

  // The smoke texture: read from the effect placement's kit manifest
  // (`effectTextures`, build_kit.publish_effect_textures), loaded once per
  // manifest: keyed on the manifest path, not the set in range, so a re-pick
  // (S8) neither blinks the columns nor re-fetches the texture.
  const smokeSource = useMemo(() => {
    const placement = bundle?.placements.find(isSmokeColumnPlacement);
    if (!bundle || !placement) return null;
    const kit = bundle.kits[placement.kit];
    return kit ? { manifest: kit.manifest, missing: "" }
      : { manifest: "", missing: `settlement effect ${placement.id} names missing kit ${placement.kit}` };
  }, [bundle]);
  const smokeManifest = smokeSource?.manifest ?? null;
  const smokeMissing = smokeSource?.missing ?? "";
  useEffect(() => {
    setEffectError("smoke", null);
    if (smokeMissing) {
      setFatalError(new Error(smokeMissing));
      return undefined;
    }
    if (!smokeManifest) return undefined;
    const kit = { manifest: smokeManifest };
    let cancelled = false;
    let made: SmokeColumns | null = null;
    const manifestUrl = `${baseUrl}${kit.manifest}`;
    fetchJsonWithRetry(manifestUrl).then((manifest: unknown) => {
      const file = effectTextureFile(manifest, SMOKE_COLUMN_ASSET_ID, manifestUrl);
      return new THREE.TextureLoader().loadAsync(`${manifestUrl.replace(/[^/]*$/, "")}${file}`);
    }).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      if (cancelled) { texture.dispose(); return; }
      made = new SmokeColumns(texture, uniforms.esSettlementNight);
      made.setAnchors(smokeAnchors.current);
      setSmoke(made);
    }).catch((error: unknown) => {
      if (!cancelled) setEffectError("smoke", `settlement smoke texture failed: ${describeLoadError(error)}`);
    });
    return () => {
      cancelled = true;
      made?.dispose();
      setSmoke(null);
    };
  }, [baseUrl, smokeManifest, smokeMissing, uniforms, setEffectError]);

  // The flame and glow sprite textures: every works-v1 `effectTextures` row
  // whose `role` is flame or glow (build_kit, the NIF fire layer), loaded
  // once per bundle. A fixture is known only after a build (a LIGH record can
  // make one on any layer), and the files are a handful of small PNGs, so
  // every bundle with placements loads them all.
  const flameManifest = useMemo(
    () => (bundle?.placements.length ? flameManifestPath(bundle.kits) : null), [bundle]);
  useEffect(() => {
    setEffectError("flame", null);
    if (!flameManifest) return undefined;
    let cancelled = false;
    const manifestUrl = `${baseUrl}${flameManifest}`;
    fetchJsonWithRetry(manifestUrl).then((manifest: unknown) => {
      const ids = spriteTextureIds(manifest);
      if (!ids.includes(FLAME_TEXTURE_ASSET_ID)) ids.push(FLAME_TEXTURE_ASSET_ID);
      const folder = manifestUrl.replace(/[^/]*$/, "");
      return Promise.all(ids.map((id) => new THREE.TextureLoader()
        .loadAsync(`${folder}${effectTextureFile(manifest, id, manifestUrl)}`)
        .then((texture) => [id, texture] as const)));
    }).then((textures) => {
      for (const [id, texture] of textures) {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (cancelled) { texture.dispose(); continue; }
        // disposes the one it replaces; shown once both draws are linked
        // (the flames draw in the screen pass, the bloom copy into the bloom target)
        void lightFixtures.setFlameTexture(texture, id, (flame, bloom) => Promise.all([
          linker.link({ object: flame, pass: "screen" }, sceneCamera),
          linker.link({ object: bloom, pass: "target" }, sceneCamera),
        ]));
      }
    }).catch((error: unknown) => {
      if (!cancelled) setEffectError("flame", `settlement flame texture failed: ${describeLoadError(error)}`);
    });
    return () => { cancelled = true; };
  }, [baseUrl, flameManifest, lightFixtures, setEffectError]);

  useFrame(({ camera, clock, gl: renderer }) => {
    if (fatalError) return;
    const env = environment?.();
    if (env) updateSettlementEnvironment(uniforms, env.rainIntensity, env.epochMinutes, renderer.toneMappingExposure);
    lightFixtures.update(clock.elapsedTime, camera);
    if (smoke) {
      smoke.setAnchors(smokeAnchors.current);
      if (env?.sunLighting) smoke.setLighting(env.sunLighting.dir, env.sunLighting.sunIrradiance, env.sunLighting.skyIrradiance);
      smoke.update(clock.elapsedTime, camera, env?.windDirXZ && env.windSpeedMS !== undefined
        ? { dirXZ: env.windDirXZ, speedMS: env.windSpeedMS } : SMOKE_CALM_WIND);
    }
    const liveChildren = root.current?.children.length ?? 0;
    frames.frames += 1;
    frames.liveChildren = liveChildren;
    if (liveChildren === 0 && liveDraws.current > 0) frames.blankFrames += 1;
    const at = builtAt.current; const focus = focusRef.current;
    // walking swaps prebuilt batches; it never merges (F40)
    const shown = visibleAt.current;
    if (root.current && (!shown || Math.hypot(focus.x - shown.x, focus.z - shown.z) > BATCH_VISIBILITY_MOVE_M)) {
      applyBatchVisibility(root.current, focus);
      visibleAt.current = { x: focus.x, z: focus.z };
    }
    const rebuildMoveM = at ? Math.min(REBUILD_MOVE_M, Math.max(1, at.coveredRadiusM * 0.5)) : REBUILD_MOVE_M;
    if (at && bundle && Math.hypot(focus.x - at.x, focus.z - at.z) > rebuildMoveM) {
      // G-a: a move re-judges only what is in reach; the batches stay (F40).
      const key = placementsInReachKey(bundle, focus, quality?.architectureDrawScale ?? 1);
      if (key !== liveReachKey.current) { builtAt.current = null; setReachRevision((v) => v + 1); }
      else { at.x = focus.x; at.z = focus.z; }
    }
    // Pieces that arrived join between builds, all at once (0120).
    if (arrived.current.size && running.current === null) {
      const fresh = arrived.current;
      arrived.current = new Map();
      setGltfs((current) => new Map([...current, ...fresh]));
    }
    // S8: the bundles in range are re-picked once the player has moved
    // SETTLEMENT_REQUERY_MOVE_M from where they were last picked.
    const queried = queriedAt.current;
    if (queried && Math.hypot(focus.x - queried.x, focus.z - queried.z) > SETTLEMENT_REQUERY_MOVE_M) {
      queriedAt.current = null; setQueryRevision((v) => v + 1);
    }
    // Arrivals are judged once the build that may need them is live.
    if (arrivals.current.length && running.current === null) {
      for (const area of arrivals.current) {
        if (groundArrivalResolves(area, missing.current)) { retryDue.current = true; break; }
      }
      arrivals.current.length = 0;
    }
    if (retryDue.current && running.current === null) {
      retryDue.current = false;
      setRevision((v) => v + 1);
    }
  });

  // The host's readable line, and the console (decision 0052 addendum
  // 2026-09-28: a failure shown only as a shape was unreadable three times).
  useEffect(() => {
    const recoverable = [bundleError, kitError, effectErrors.flame, effectErrors.smoke].filter(Boolean);
    const report = fatalError ? { fatal: true, message: fatalError.message }
      : recoverable.length ? { fatal: false, message: recoverable.join("; ") } : null;
    if (report) console.error(`[settlement] ${report.fatal ? "LAYER FAILED" : "not fatal"}: ${report.message}`);
    onErrorRef.current?.(report);
  }, [fatalError, effectErrors, kitError, bundleError]);
  // The host's line goes with the layer: hiding or unmounting it clears it.
  useEffect(() => () => onErrorRef.current?.(null), []);

  useEffect(() => {
    if (!fatalError) return;
    onSolids?.([]);
    publishSettlementProof({
      status: "failed",
      settlements: bundle?.settlements.length ?? 0,
      placements: bundle?.placements.length ?? 0,
      renderedPlacements: 0,
      draws: 0,
      triangles: 0,
      grounding: [],
      finalTransformEvidence: EMPTY_FINAL_TRANSFORM_EVIDENCE,
      collision: collisionFailure.current ?? {
        ...emptyCollisionProof(), status: "failed",
        partBudget: bundle?.lod.colliderPartBudget ?? 0,
      },
      error: fatalError.message,
      frames,
    });
  }, [bundle, fatalError, onSolids, frames]);

  useEffect(() => {
    // Every throw inside this build is the settlement layer's own failure and
    // must surface as the layer's own fatal error (reported, nothing drawn). Uncaught, it unmounts the whole
    // React subtree the layer sits in — which is how one two-tier-LOD asset
    // took the studio's entire HUD down with it (2026-09-09).
    function* build(): Generator<void> {
      const group = root.current;
      if (!group || !bundle || fatalError) return;
      // Built DETACHED: the live group keeps drawing the last finished build
      // until the final step swaps this one in.
      const next = new THREE.Group();
      const focus = focusRef.current;
      // A cancelled build (a new revision, or unmount) must not strand the
      // meshes it had already made: `finally` runs on the generator's
      // `return()`, and after a successful swap `next` is empty.
      try {
      const residentPlacementIds = residentPlacementIdsAt(bundle.settlements, focus);
      builtAt.current = buildStartMark(focus, liveCoveredRadiusM.current);
      // G-a: the batches depend on the inputs only (F40); a move or a retry
      // with the same inputs runs the reach pass alone, over the live batches.
      const fullInputs: FullPassInputs = { bundle, kits, manifests, revision,
        drawScale: quality?.architectureDrawScale ?? 1, groundAt };
      const reachKey = placementsInReachKey(bundle, focus, fullInputs.drawScale);
      const reachOnly = settlementPassKind(lastFull.current, fullInputs, liveReachKey.current, reachKey) !== "full"
        && group.children.length > 0;
      if (reachOnly) frames.reachPasses += 1; else frames.fullPasses += 1;
      const buckets = new Map<string, DrawBucket>();
      const solidCandidates: {
        value: SettlementSolid; placementId: string; distanceM: number; parts: number;
      }[] = [];
      const placementGrounding: SettlementPlacementGroundAudit[] = [];
      const runJoints: RunJointSample[] = [];
      const runOfPlacement = new Map<string, string>();
      // Longest side of each asset's LOD0 geometry in its own metres, measured
      // once per build from the loaded parts (0102 decision 6: the LOD gate is
      // size-aware; the manifest meta carries no size).
      const boxOf = new Map<string, THREE.Box3>();
      const assetBox = (key: string, parts: readonly ArchitecturePart[]): THREE.Box3 => {
        const cached = boxOf.get(key);
        if (cached) return cached;
        const box = new THREE.Box3();
        for (const part of parts) {
          if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
          box.union(part.geometry.boundingBox!.clone().applyMatrix4(part.localMatrix));
        }
        boxOf.set(key, box);
        return box;
      };
      const assetLongestSideM = (key: string, parts: readonly ArchitecturePart[]): number => {
        const box = assetBox(key, parts);
        const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
        return Math.max(size.x, size.y, size.z);
      };
      const fixturesHere: LightFixture[] = [];
      const isFixture = (p: SettlementPlacement): boolean =>
        isLightFixturePlacement(p, kitAssetMetaOf(manifests, p));
      let placementCount = 0;
      const missingHere: [number, number][] = [];
      const missingIds: string[] = [];
      const unresolved = (p: SettlementPlacement) => {
        missingHere.push([p.positionM[0], p.positionM[2]]);
        missingIds.push(p.id);
      };
      let sinceYield = 0;
      let triangles = 0; let farInstances = 0; let nearInstances = 0;
      const solidsKept: SolidCache = new Map();

      const resolvePlaced = createPlacementResolver(bundle.placements,
        (p) => kitAssetMetaOf(manifests, p),
        groundAt);
      const smokeHere: SmokeAnchor[] = [];
      // Hosts of a mounted fire (a brazier's fxfirewithembers01): their own
      // fixture draws no fallback flame; the child's cards are the fire.
      const hostsOfFire = new Set<string>();
      for (const p of bundle.placements) {
        if (p.parentPlacementId && drawsOwnFire(kitAssetMetaOf(manifests, p))) {
          hostsOfFire.add(p.parentPlacementId);
        }
      }

      for (const placement of bundle.placements) {
        if (++sinceYield >= 64) { sinceYield = 0; yield; }
        const distance = Math.hypot(placement.positionM[0] - focus.x, placement.positionM[2] - focus.z);
        const cap = placementDrawCapM(placement.kind);
        const drawScaleHere = quality?.architectureDrawScale ?? 1;
        const inDrawRange = distance <= cap * drawScaleHere;
        const collisionResident = residentPlacementIds.has(placement.id);
        // Every placement of the bundle is batched at every level it can draw
        // (F40: the batch set never depends on the camera); fixtures, smoke
        // and solids stay camera-ranged.
        if (isSmokeColumnPlacement(placement)) {
          // An effect draws no kit mesh and has no collider: its pose is the
          // mounted child's final transform (the chimney top).
          if (distance > SMOKE_MAX_DISTANCE_M + REBUILD_MOVE_M) continue;
          const at = resolvePlaced(placement);
          if (!at) { unresolved(placement); continue; }
          const socketAt = new THREE.Vector3().setFromMatrixPosition(at.matrix);
          smokeHere.push({ id: placement.id, position: socketAt });
          // A fire socket is a fixture unless it sits on one (the brazier's
          // own fixture already lights it).
          const host = placement.parentPlacementId
            ? placementById.get(placement.parentPlacementId) : undefined;
          if (isFireSocket(placement) && !(host && isFixture(host))) {
            fixturesHere.push(fixtureFromFireSocket(placement.id, socketAt));
          }
          continue;
        }
        const asset = kits.get(placement.kit)?.get(placement.assetId);
        if (!asset) continue;
        const here = resolvePlaced(placement);
        if (!here) { unresolved(placement); continue; }
        const { matrix: transform, anchored } = here;
        if (anchored) placementGrounding.push(placementGroundAudit(placement, anchored));
        if (placement.run) {
          runJoints.push({ placementId: placement.id, run: placement.run, y: transform.elements[13] });
          runOfPlacement.set(placement.id, placement.run.id);
        }
        const groundLineM = anchored ? anchored.groundLineM : transform.elements[13];
        const meta = kitAssetMetaOf(manifests, placement);
        const hostPlacement = placement.parentPlacementId
          ? placementById.get(placement.parentPlacementId) : undefined;
        const hostMeta = hostPlacement ? kitAssetMetaOf(manifests, hostPlacement) : undefined;
        const fixture = inDrawRange && isLightFixturePlacement(placement, meta);
        const spriteHolder = inDrawRange && !fixture && isSpriteHolderPlacement(placement, meta);
        // An additive (flame or glow card) material burns on every instance
        // of its asset: fixed per material (an asset's materials are its
        // own), so a material never flips glow kind (and recompiles) with what
        // a build happens to hold.
        const ownFlames = new Set(meta?.additiveMaterials ?? []);
        if (fixture || spriteHolder) {
          const box = assetBox(`${placement.kit}|${placement.assetId}`, asset.levels[0]);
          fixturesHere.push(fixtureFromPiece(placement.id, meta, transform, box, fixture,
            { hostMeta, hasMountedFire: hostsOfFire.has(placement.id) }));
        }
        {
          const levelTriangles = asset.levels.map((parts) => parts.reduce((n, p) => n + p.triangles, 0));
          const piece = {
            longestSideM: assetLongestSideM(`${placement.kit}|${placement.assetId}`, asset.levels[0])
              * placement.scale,
            kind: placement.kind,
          };
          validateLodTriangles(levelTriangles, bundle.lod, piece);
          // One rung per kit level, hard steps, no card (0075): the ladder is
          // the same helper the vegetation cell build uses.
          // edges rounded so pieces of near-equal size share a batch class
          const ladder = quantizedLadder(settlementLadder(footprintDiagonalM(placement),
            asset.levels.length, bundle.lod, cap, drawScaleHere, piece));
          const capM = cap * drawScaleHere;
          const ladderClass = ladderClassKey(ladder, capM);
          const chunk = settlementChunkKey(placement.positionM[0], placement.positionM[2]);
          const centre = settlementChunkCentre(chunk);
          // what draws now, for the stats only (the batches never read it)
          const chunkDistance = Math.hypot(centre.x - focus.x, centre.z - focus.z);
          const levelNow = chunkDistance <= capM ? ladderLevelAt(ladder, chunkDistance) : -1;
          const farNow = distance >= bundle.lod.farMergeDistanceM * drawScaleHere;
          const levels = [...new Set(ladder.map((rung) => rung.level))];
          for (const level of levels) {
            asset.levels[level].forEach((part, partIndex) => {
              // a flame card is drawn by the fire module instead: the piece's
              // fixture burns its bed (lighting.ts, flameCardBedAnchorLocal)
              if (isFlameCardMaterial(meta, part.material.name)) return;
              // a reach pass counts what draws now and builds no bucket (G-a)
              if (reachOnly) {
                if (level === levelNow) { triangles += part.triangles; if (farNow) farInstances += 1; else nearInstances += 1; }
                return;
              }
              // a flame part burns by day or not by what it is mounted on, so
              // the same fire asset in a brazier and on its own are two buckets
              const flamePart = ownFlames.has(part.material.name);
              const litByDay = flamePart && burnsByDay(meta, hostMeta);
              const key = `${placement.kit}|${placement.assetId}|${level}|${partIndex}${litByDay ? "|day" : ""}|${chunk}|${ladderClass}`;
              const bucket = buckets.get(key) ?? {
                part, transforms: [], groundLinesM: [], farTransforms: [], farGroundLinesM: [], chunk,
                ladderClass, view: { x: centre.x, z: centre.z, level, ladder, capM },
              };
              if (flamePart) {
                bucket.flame = true;
                bucket.alwaysLit = litByDay;
              }
              if (isLanternShellMaterial(part.material, meta)) bucket.shell = true;
              bucket.transforms.push(transform.clone().multiply(part.localMatrix));
              bucket.groundLinesM.push(groundLineM);
              buckets.set(key, bucket);
              if (level === levelNow) {
                triangles += part.triangles;
                if (farNow) farInstances += 1; else nearInstances += 1;
              }
            });
          }
          if (inDrawRange) placementCount += 1;
        }
        if (inDrawRange || collisionResident) {
          const solid = yield* solidSteps(placement, transform, anchored?.buryM ?? 0,
            asset.levels[0], solidCache.current, solidsKept);
          if (solid) solidCandidates.push({ value: solid, placementId: placement.id,
            distanceM: distance, parts: solid.parts.length });
        }
      }

      solidCache.current = solidsKept;
      // a bound run collides as one rigid chain: one joined part (0101 rule 9)
      const collision = selectCollisionResidency(
        mergeRunColliders(solidCandidates, (id) => runOfPlacement.get(id), runColliderCache.current),
        bundle.settlements, focus,
        bundle.lod.colliderRadiusM, bundle.lod.colliderPartBudget);
      if (collision.budgetExceeded) {
        const over = collision.budgetExceeded;
        collisionFailure.current = {
          status: "failed",
          activeSettlementIds: over.activeSettlementIds,
          residentPlacementIds: over.residentPlacementIds,
          omittedPlacementIds: over.residentPlacementIds,
          parts: 0,
          requiredResidentParts: over.requiredResidentParts,
          partBudget: over.partBudget,
          coveredRadiusM: 0,
        };
        onSolids?.([]);
        setFatalError(new Error(
          `settlement collision budget exceeded inside ${over.activeSettlementIds.join(", ")}: `
          + `${over.requiredResidentParts} parts require a hard budget of ${over.partBudget}; `
          + `refusing to omit ${over.residentPlacementIds.join(", ")}`,
        ));
        return;
      }
      // A retry that resolves exactly what is live keeps the live group: the
      // signature is taken before any geometry is cloned or merged, so such a
      // retry costs no clone, merge or upload (check-in 2 item 2).
      // The batch set is camera-independent (F40), so walking reuses the live
      // group: no merge, no new mesh, no compile; only visibility changes.
      const signature = reachOnly ? liveSignature.current : buildSignature(buckets);
      const reuseLive = reachOnly || (signature === liveSignature.current && group.children.length > 0);
      let draws = 0; let farMeshes = 0; let shadowPairedDraws = 0;
      const groundBoundInstances = nearInstances + farInstances;
      const shadowPairFailures: string[] = [];
      // The run-joint gate (check-in 3 §2): a drawn run must step by its
      // mined rise at every joint. Reported in the evidence the probes read
      // and on the console; never thrown, so one bad run cannot blank a place.
      const runJointFailures = runJointErrors(runJoints);
      if (runJointFailures.length) console.error(`settlement run joints: ${runJointFailures.join("; ")}`);
      // One draw per material per cell: every bucket of a cell drawing with
      // one material instance (one per identity, materialIdentity.ts) and one
      // vertex layout is baked into one geometry. A main thread bound by
      // per-draw CPU drew an instanced mesh per (asset, part, chunk): 267 at
      // Greenspring. The cell is the 48 m chunk (its bounds pick its lamps),
      // one batch per kit level and ladder class (settlementBatchCell).
      const batches = new Map<string, DrawBatch>();
      for (const [bucketKey, bucket] of buckets) {
        yield;
        validateMaterialTextureCap(bucket.part.material, bundle.lod.atlasMaxSize);
        // A glow material is one the kit build gave an emissive map (the NIF's
        // Glow_Map slot, build_kit rebuild_material), never a name match.
        const glowMaterial = bucket.flame ? (bucket.alwaysLit ? "flame" as const : "lamp-flame" as const)
          : bucket.shell ? "lamp-shell" as const
          : isSettlementGlowMaterial(bucket.part.material);
        // flame cards and lantern shells keep their own material; every other
        // part draws with its identity's one instance
        const base = bucket.flame || bucket.shell ? bucket.part.material : identities.of(bucket.part.material);
        const material = materialVariant(base, String(glowMaterial));
        bucket.material = material;
        materialPatch?.(material);
        // decal, additive card, still water and the surface features; the
        // shadow pass reuses the colour material's own position and mask
        // (decision 0107), so every draw's caster matches its colour by
        // construction: there is no depth twin to pair or check.
        const drawFlags = prepareSettlementMaterial(material, uniforms, glowMaterial, bucket.flame === true);
        const { transforms, groundLinesM } = bucket;
        const cell = settlementBatchCell(bucket.chunk, bucket.view.level, bucket.ladderClass);
        addToBatch(batches, drawBatchKey(material, bucket.part.geometry, cell, drawFlags), {
          material, drawFlags, far: bucket.view.level > 0, view: bucket.view,
          entry: { geometry: bucket.part.geometry, transforms, groundLinesM },
          signature: `${bucketKey}:${farSignatureOf(transforms, groundLinesM)}`,
        });
      }
      // the merges this build draws (reused or new), keyed by batch
      const farKept = new Map<string, { signature: string; geometry: THREE.BufferGeometry }>();
      for (const [batchKey, batch] of batches) {
        yield;
        if (!batch.view || batchVisibleAt(batch.view, focus)) {
          draws += 1;
          shadowPairedDraws += 1;
          if (batch.far) farMeshes += 1;
        }
        if (reuseLive) continue;
        const batchSignature = batch.signatures.sort().join(";");
        const cached = farCache.current.get(batchKey);
        const geometry = cached?.signature === batchSignature ? cached.geometry
          : mergeTransformedParts(batch.entries);
        if (!geometry) continue;
        farKept.set(batchKey, { signature: batchSignature, geometry });
        const mesh = new THREE.Mesh(geometry, batch.material);
        // the cell's own bounds: culled with its square, lit by its lamps
        setCastShadow(mesh, batch.drawFlags.castShadow); mesh.receiveShadow = true;
        mesh.renderOrder = batch.drawFlags.renderOrder;
        mesh.userData.esSettlementBatch = true;
        if (batch.view) mesh.userData.esSettlementView = batch.view;
        // never moves and reads only shared or constant uniforms: skips three's
        // per-frame node refresh (render/staticRefresh.ts); a flame card's
        // strength is the shared lamp clock times its constant gain
        mesh.userData.esStatic = true;
        next.add(mesh);
      }
      if (reachOnly) {
        // the live batches, counted as the batch loop counts them
        for (const child of group.children) {
          const mesh = child as THREE.Mesh;
          const view = mesh.userData.esSettlementView as SettlementBatchView | undefined;
          if (view && !batchVisibleAt(view, focus)) continue;
          draws += 1;
          if (mesh.customDepthMaterial) shadowPairedDraws += 1;
          if ((view?.level ?? 0) > 0) farMeshes += 1;
        }
      }
      // No code-placed dressing at a building's foot (check-in 2 ruling 1):
      // the wall-foot skirt is cut; the seam is the height-blend shader
      // (16h part 2 item 25).
      const grounding = settlementGroundAudits(bundle.settlements, placementGrounding);
      smokeAnchors.current = smokeHere;
      // Final step: the finished build replaces the live one atomically, in
      // one synchronous step, so no frame draws an empty layer.
      if (!reuseLive) {
        // Every material is patched (CSM, the settlement surface, fixture
        // lights) and every program linked BEFORE the build is on screen: a
        // material first drawn unpatched relinked a frame later, which was the
        // startup "buildings flash darker" (16k walk 5). The linker patches
        // (the scene's lit preparer) before it compiles.
        // Linked against the target the scene pass draws into (the water
        // pipeline's linear target), so the first frame finds them linked.
        const linkStart = performance.now();
        while (!linker.observed && performance.now() - linkStart < SETTLEMENT_LINK_WAIT_MS) yield;
        let linked = false;
        // Every prebuilt batch is still visible here, so every level's program
        // links now (compile walks visible objects only), never mid-walk.
        linker.compileAsync(next, sceneCamera, scene).then(() => { linked = true; }, () => { linked = true; });
        while (!linked && performance.now() - linkStart < SETTLEMENT_LINK_WAIT_MS) yield;
        // the live far merges not kept are freed with the live group
        const keep = new Set([...farKept.values()].map((entry) => entry.geometry));
        farCache.current = farKept;
        disposeChildren(group, keep);
        // Every piece is baked into its instance matrices or merged geometry
        // at identity: no per-frame local-matrix recompose (audit row 16).
        for (const child of next.children) { child.matrixAutoUpdate = false; child.updateMatrix(); }
        applyBatchVisibility(next, focusRef.current);
        visibleAt.current = { ...focusRef.current };
        swapInBuild(group, next);
        liveSignature.current = signature;
        liveDraws.current = draws;
        if (frames.swaps === 0) performance.mark("es:load:settlement-first-build");
        frames.swaps += 1;
      } else if (!reachOnly) {
        frames.skippedSwaps += 1;
      }
      // The new build is live: its covered radius and fixtures replace the old.
      liveCoveredRadiusM.current = collision.coveredRadiusM;
      if (builtAt.current) builtAt.current.coveredRadiusM = collision.coveredRadiusM;
      lastFull.current = fullInputs;
      liveReachKey.current = reachKey;
      // The warm gate waits for the spawn ring to be on screen (0120 rule 5).
      if (ringPendingRef && ringKeys.current) {
        ringPendingRef.current = ringKeys.current.filter((key) => {
          const kitId = requestKit(key);
          return !kits.get(kitId)?.has(key.slice(kitId.length + 1));
        }).length;
      }
      lightFixtures.setFixtures(fixturesHere);
      // Unseated placements wait for their ground (the arrival listener).
      const missingKey = missingIds.join(",");
      if (missingIds.length && missingKey !== missingLogged.current) {
        console.info(`[settlement] ${missingIds.length} placement(s) wait for ground: `
          + missingIds.slice(0, 8).map((id, i) => `${id}@${missingHere[i][0].toFixed(0)},${missingHere[i][1].toFixed(0)}`).join(" "));
      }
      missingLogged.current = missingKey;
      missing.current = missingHere;
      onSolids?.(collision.chosen);
      const collisionAudit = {
        status: collision.activeSettlementIds.length ? "resident" as const : "ring" as const,
        activeSettlementIds: collision.activeSettlementIds,
        residentPlacementIds: collision.residentPlacementIds,
        omittedPlacementIds: collision.omittedPlacementIds,
        parts: collision.parts,
        requiredResidentParts: collision.requiredResidentParts,
        partBudget: bundle.lod.colliderPartBudget,
        coveredRadiusM: collision.coveredRadiusM,
      };
      const finalTransformEvidence = {
        finalAnchoredPlacements: placementCount,
        nearInstances,
        farMergedInstances: farInstances,
        groundBoundInstances,
        shadowPairedDraws,
        shadowPairFailures,
        runJointFailures,
      };
      onStats?.({ placements: placementCount, draws, triangles,
        colliderParts: collision.parts, colliderCoveredRadiusM: collision.coveredRadiusM,
        farMergedMeshes: farMeshes, farMergedInstances: farInstances, grounding,
        finalTransformEvidence, collision: collisionAudit });
      const drawScale = quality?.architectureDrawScale ?? 1;
      const allVisibleKitsReady = bundle.placements.every((placement) => {
        if (isSmokeColumnPlacement(placement)) return true;
        const distance = Math.hypot(placement.positionM[0] - focus.x,
          placement.positionM[2] - focus.z);
        return (!residentPlacementIds.has(placement.id) && distance > placementDrawCapM(placement.kind) * drawScale)
          || !!kits.get(placement.kit)?.has(placement.assetId);
      });
      publishSettlementProof({
        status: allVisibleKitsReady ? "loaded" : "loading",
        settlements: bundle.settlements.length,
        placements: bundle.placements.length,
        renderedPlacements: placementCount,
        draws,
        triangles,
        grounding,
        finalTransformEvidence,
        collision: collisionAudit,
        frames,
      });
      } finally {
        // A successful swap leaves `next` empty; a cancelled build does not
        // (its far merges not in the cache are its own).
        disposeChildren(next, new Set([...farCache.current.values()].map((entry) => entry.geometry)));
      }
    }

    running.current?.cancel();
    running.current = queue.add(build(), {
      priority: 40,
      label: "settlement",
      onDone: () => { running.current = null; },
      // Every throw from ANY step is the settlement layer's own failure, the
      // same as the synchronous try/catch this replaced.
      onError: (error) => {
        running.current = null;
        onSolids?.([]);
        setFatalError(error instanceof Error ? error : new Error(String(error)));
      },
    });
    // Cancelling is ALL this cleanup does. It used to dispose the live group
    // too, and `revision` is a dependency: every 40 m of walking and every
    // 2 s retry while terrain streamed in emptied the layer until the sliced
    // rebuild swapped in, which is the check-in 2 "buildings flash out" and
    // the sconce wall's base flicker (/tmp research topic 2; ledger row
    // "Check-in 2 fixes: runtime"). The live group is disposed only when
    // the world itself goes (the effect below).
    return () => {
      running.current?.cancel();
      running.current = null;
    };
  }, [queue, bundle, kits, manifests, revision, reachRevision, groundAt, quality?.architectureDrawScale,
      focusRef, materialPatch, onSolids, onStats, uniforms, fatalError, frames, lightFixtures,
      placementById, materialVariant, identities, gl, scene, sceneCamera, linker]);

  // The live group goes with the world: on unmount, a new
  // baseUrl, or a fatal error emptying the layer. A new set of bundles
  // in range (S8) is NOT a reason: the next build swaps in over the live
  // group, so the buildings on screen never blink while the player walks.
  useEffect(() => {
    // Captured now: when a fatal error empties the layer, React has already
    // detached the ref by the time this cleanup runs.
    const group = root.current;
    const far = farCache.current;
    return () => {
      if (group) disposeChildren(group);
      far.clear();
      liveSignature.current = "";
      liveDraws.current = 0;
    };
  }, [baseUrl, fatalError]);

  // Fail closed (owner ruling behind 2a1e8311): a refused bundle draws
  // nothing of the layer. The failure is reported through `onError` (the
  // studio HUD's red line) and the console, never as a shape in the world.
  if (fatalError) return null;
  return (
    <>
      <group key="settlement-layer" ref={root} name="settlement-layer" />
      {smoke && <primitive key="settlement-smoke" object={smoke.mesh} />}
      <primitive key="settlement-light-fixtures" object={lightFixtures.group} />
      <GroundPaintLayer key="settlement-ground-paint" baseUrl={baseUrl}
        settlements={bundle?.settlements} groundAt={groundAt} groundArrivals={groundArrivals} />
    </>
  );
}
