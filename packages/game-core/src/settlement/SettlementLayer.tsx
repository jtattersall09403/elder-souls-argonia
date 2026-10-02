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
  buildArchitectureKit, kitAssetMetaFromManifest, kitAssetMetaOf, type ArchitecturePart,
} from "./kit";
import {
  ladderLevelAt,
  mergeTransformedGeometry,
  settlementLadder,
  validateLodTriangles,
  validateMaterialTextureCap,
} from "./lod";
import {
  residentPlacementIdsAt,
  selectCollisionResidency,
} from "./collisionResidency";
import {
  applySettlementAdditive,
  applySettlementDecal,
  applySettlementStillWater,
  applySettlementSurface,
  applySettlementSurfaceWithShadow,
  isSettlementGlowMaterial,
  SETTLEMENT_GROUND_ATTRIBUTE,
  settlementMeshDrawFlags,
  settlementShadowPairErrors,
  syncSettlementDepthTwin,
  updateSettlementEnvironment,
  type SettlementMaterialUniforms,
} from "./materials";
import { isLanternShellMaterial } from "./fixtureGlow";
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
import { mergeRunColliders } from "./runColliders";
import { fixtureLightFieldOf, isFixtureLitMaterial, litPreparerOf } from "../render/fixtureLights";
import { DrawTargetLinker } from "../render/drawTargetLinker";
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

/**
 * A draw geometry that SHARES the kit part's index and vertex attributes (the
 * same GPU buffers) and adds only its own per-instance ground line: a rebuild
 * uploads the ground lines, never the part's vertices again (a clone per
 * bucket per rebuild did).
 */
export function instancedPartView(source: THREE.BufferGeometry, groundLinesM: readonly number[]): THREE.BufferGeometry {
  const view = new THREE.BufferGeometry();
  view.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) view.setAttribute(name, attribute);
  for (const group of source.groups) view.addGroup(group.start, group.count, group.materialIndex);
  view.setAttribute(SETTLEMENT_GROUND_ATTRIBUTE, new THREE.InstancedBufferAttribute(new Float32Array(groundLinesM), 1));
  view.userData.esSettlementPartView = true;
  return view;
}

/** Free a part view's own buffers only: three's geometry dispose deletes every
 * attribute it holds, and the shared ones belong to the kit part. */
export function disposePartView(view: THREE.BufferGeometry): void {
  const ground = view.getAttribute(SETTLEMENT_GROUND_ATTRIBUTE);
  view.setIndex(null);
  for (const name of Object.keys(view.attributes)) view.deleteAttribute(name);
  if (ground) view.setAttribute(SETTLEMENT_GROUND_ATTRIBUTE, ground);
  view.dispose();
}

/** Dispose and detach everything the layer put in `group`: the per-build
 * instance buffers (part views) and far merges the next build does not keep
 * (`keep`: the far-merge cache's live geometries). Colour materials belong to
 * the kit and shadow-depth twins to the layer's cache (one per colour
 * material, disposed on unmount), so a swap never frees a material the next
 * build still draws with. */
function disposeChildren(group: THREE.Group, keep?: ReadonlySet<THREE.BufferGeometry>): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.InstancedMesh) {
      child.dispose();
      if (child.geometry.userData.esSettlementPartView) disposePartView(child.geometry);
    }
    else if (child instanceof THREE.Mesh && !keep?.has(child.geometry)) child.geometry.dispose();
  }
}

/**
 * What a build draws, as one string: every bucket's key and instance counts
 * and the sum of its translations to the millimetre. A retry that resolves
 * exactly what is already live is not swapped in (check-in 2 item 2).
 */
function buildSignature(buckets: Map<string, DrawBucket>, colliderParts: number): string {
  const rows: string[] = [];
  for (const [key, bucket] of buckets) {
    let sum = 0;
    for (const m of bucket.transforms) sum += m.elements[12] + m.elements[13] + m.elements[14];
    for (const m of bucket.farTransforms) sum += m.elements[12] + m.elements[13] + m.elements[14];
    rows.push(`${key}:${bucket.transforms.length}:${bucket.farTransforms.length}:${Math.round(sum * 1000)}`);
  }
  return `${rows.sort().join(",")}|${colliderParts}`;
}

const REBUILD_MOVE_M = 40;
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
const MAX_RENDER_DISTANCE_M = 5000;
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
  localSurfaces,
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
  const [gltfs, setGltfs] = useState<Map<string, GLTF>>(() => new Map());
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
  // One shadow-depth twin per colour material for the layer's life: a new
  // twin per build meant new programs to link on every rebuild.
  const depthTwins = useRef(new Map<THREE.Material, THREE.MeshDepthMaterial | undefined>());
  // What the live group draws, so a retry that resolves the same set is not
  // swapped in; and how many draws the last swap put on screen.
  const liveSignature = useRef("");
  const liveDraws = useRef(0);
  // Per-frame evidence for the flash probe (check-in 2 item 2): a frame whose
  // live group is empty while the last finished build drew something is a
  // building that vanished. One mutable object, referenced by every proof.
  const frames = useMemo<SettlementFrameEvidence>(() => ({
    frames: 0, blankFrames: 0, swaps: 0, skippedSwaps: 0, liveChildren: 0,
  }), []);
  // The whole build is sliced over frames at priority 40 — last, behind
  // colliders, terrain and vegetation — and assembled into a DETACHED group
  // that replaces the live one in a single final step, so a half-built
  // settlement is never on screen (owner 2026-09-20, walking stutter).
  const running = useRef<FrameJobHandle | null>(null);
  const queue = useFrameWork();
  const uniforms = useMemo<SettlementMaterialUniforms>(() => ({
    esSettlementRain: { value: 0 }, esSettlementNight: { value: 0 },
  }), []);
  // Chimney smoke (smokeColumn.ts): one draw for every anchored column, made
  // once the effect texture named by its kit manifest has loaded.
  const [smoke, setSmoke] = useState<SmokeColumns | null>(null);
  const smokeAnchors = useRef<SmokeAnchor[]>([]);
  // Light fixtures (lighting.ts): injected by the scene, else the layer's own,
  // lighting through the scene's fixture light field (render/fixtureLights).
  const { camera: sceneCamera, scene, gl } = useThree();
  const linker = useMemo(() => new DrawTargetLinker(gl, scene), [gl, scene]);
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
  useEffect(() => {
    if (!bundle) return;
    const focus = focusRef.current;
    const residents = residentPlacementIdsAt(bundle.settlements, focus);
    const drawScale = quality?.architectureDrawScale ?? 1;
    const wanted = new Set(bundle.placements.filter((p) => {
      if (isSmokeColumnPlacement(p)) return false;
      const cap = p.kind === "dressing" ? 350 : p.kind === "route-structure" ? 2500 : MAX_RENDER_DISTANCE_M;
      return residents.has(p.id)
        || Math.hypot(p.positionM[0] - focus.x, p.positionM[2] - focus.z) <= cap * drawScale;
    }).map((p) => p.kit));
    const loader = createKitLoader(decoders);
    for (const id of wanted) {
      const kit = bundle.kits[id];
      if (!kit) {
        setFatalError(new Error(`settlement bundle references missing kit ${id}`));
        continue;
      }
      if (pendingKits.current.has(id)) continue;
      // A kit that will not arrive after its retries (a dropped connection on
      // a phone) is reported, never fatal (a refused manifest still is): the layer asks again after
      // KIT_RETRY_MS (`kitRetry`), and the report clears when it arrives.
      const failed = (what: string) => (error: unknown) => {
        if (!(error instanceof TransientFetchError)) {
          setFatalError(new Error(`settlement kit ${what}${id} failed: `
            + `${error instanceof Error ? error.message : String(error)}`));
          return;
        }
        setKitError(`settlement kit ${what}${id} failed: `
          + `${error instanceof Error ? error.message : String(error)}; retrying`);
        clearTimeout(kitRetryTimer.current);
        kitRetryTimer.current = setTimeout(() => setKitRetry((n) => n + 1), KIT_RETRY_MS);
      };
      if (!manifests.has(id) && !pendingManifests.current.has(id)) {
        pendingManifests.current.add(id);
        loadKitAssetMeta(`${baseUrl}${kit.manifest}`).then((assets) => {
          setManifests((current) => new Map(current).set(id, assets));
        }).catch(failed("manifest "))
          .finally(() => pendingManifests.current.delete(id));
      }
      if (gltfs.has(id)) continue;
      pendingKits.current.add(id);
      kitCache.load(id, `${baseUrl}${kit.glb}`, (url) => loadGltfWithRetry(url, loader)).then((gltf) => {
        setGltfs((current) => new Map(current).set(id, gltf));
      }).catch(failed(""))
        .finally(() => pendingKits.current.delete(id));
    }
    if ([...wanted].every((id) => gltfs.has(id) && manifests.has(id))) setKitError(null);
  }, [bundle, revision, baseUrl, focusRef, quality?.architectureDrawScale, gltfs, manifests,
      decoders, kitCache, kitRetry]);
  useEffect(() => () => clearTimeout(kitRetryTimer.current), []);

  // One index (and one set of material clones) per loaded GLTF for the
  // layer's life: a new kit arriving must not re-clone every other kit's
  // materials (new materials meant new depth twins and relinks per kit load).
  const kitIndex = useRef(new WeakMap<GLTF, ReturnType<typeof buildArchitectureKit>>());
  const kits = useMemo(() => new Map([...gltfs].map(([id, gltf]) => {
    let kit = kitIndex.current.get(gltf);
    if (!kit) { kit = buildArchitectureKit(gltf); kitIndex.current.set(gltf, kit); }
    return [id, kit];
  })), [gltfs]);
  // A part material drawn with a second glow kind (a fire asset in a brazier,
  // burning by day, and the same asset alone) gets one clone per kind for the
  // layer's life, so no material flips kind (and relinks) between builds.
  const glowVariants = useRef(new Map<THREE.Material, Map<string, THREE.Material>>());
  const materialVariant = useCallback((material: THREE.Material, kind: string): THREE.Material => {
    let byKind = glowVariants.current.get(material);
    if (!byKind) { byKind = new Map([[kind, material]]); glowVariants.current.set(material, byKind); }
    let variant = byKind.get(kind);
    if (!variant) { variant = material.clone(); byKind.set(kind, variant); }
    return variant;
  }, []);
  // Far merges kept across builds while their instances are unchanged.
  const farCache = useRef(new Map<string, { signature: string; geometry: THREE.BufferGeometry }>());

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
        lightFixtures.setFlameTexture(texture, id);   // disposes the one it replaces
      }
    }).catch((error: unknown) => {
      if (!cancelled) setEffectError("flame", `settlement flame texture failed: ${describeLoadError(error)}`);
    });
    return () => { cancelled = true; };
  }, [baseUrl, flameManifest, lightFixtures, setEffectError]);

  useFrame(({ camera, clock }) => {
    if (fatalError) return;
    const env = environment?.();
    if (env) updateSettlementEnvironment(uniforms, env.rainIntensity, env.epochMinutes);
    lightFixtures.update(clock.elapsedTime, camera);
    if (smoke) {
      smoke.setAnchors(smokeAnchors.current);
      smoke.update(clock.elapsedTime, camera, env?.windDirXZ && env.windSpeedMS !== undefined
        ? { dirXZ: env.windDirXZ, speedMS: env.windSpeedMS } : SMOKE_CALM_WIND);
    }
    const liveChildren = root.current?.children.length ?? 0;
    frames.frames += 1;
    frames.liveChildren = liveChildren;
    if (liveChildren === 0 && liveDraws.current > 0) frames.blankFrames += 1;
    const at = builtAt.current; const focus = focusRef.current;
    const rebuildMoveM = at ? Math.min(REBUILD_MOVE_M, Math.max(1, at.coveredRadiusM * 0.5)) : REBUILD_MOVE_M;
    if (at && Math.hypot(focus.x - at.x, focus.z - at.z) > rebuildMoveM) {
      builtAt.current = null; setRevision((v) => v + 1);
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
        const cap = placement.kind === "dressing" ? 350
          : placement.kind === "route-structure" ? 2500 : MAX_RENDER_DISTANCE_M;
        const drawScaleHere = quality?.architectureDrawScale ?? 1;
        const inDrawRange = distance <= cap * drawScaleHere;
        const collisionResident = residentPlacementIds.has(placement.id);
        // Audit every physical place reference the layer can reach, route
        // structures included (they were 85 % of the bundle and excluded).
        if (!inDrawRange && !collisionResident) continue;
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
        if (inDrawRange) {
          const box = assetBox(`${placement.kit}|${placement.assetId}`, asset.levels[0]);
          if (fixture || spriteHolder) {
            fixturesHere.push(fixtureFromPiece(placement.id, meta, transform, box, fixture,
              { hostMeta, hasMountedFire: hostsOfFire.has(placement.id) }));
          }
          const triangles = asset.levels.map((parts) => parts.reduce((n, p) => n + p.triangles, 0));
          const piece = {
            longestSideM: assetLongestSideM(`${placement.kit}|${placement.assetId}`, asset.levels[0])
              * placement.scale,
            kind: placement.kind,
          };
          validateLodTriangles(triangles, bundle.lod, piece);
          // One rung per kit level, hard steps, no card (0075): the ladder is
          // the same helper the vegetation cell build uses.
          const ladder = settlementLadder(footprintDiagonalM(placement), asset.levels.length,
            bundle.lod, cap, drawScaleHere, piece);
          const level = ladderLevelAt(ladder, distance);
          const farMerged = distance >= bundle.lod.farMergeDistanceM * drawScaleHere;
          asset.levels[level].forEach((part, partIndex) => {
            // a flame card is drawn by the fire module instead: the piece's
            // fixture burns its bed (lighting.ts, flameCardBedAnchorLocal)
            if (isFlameCardMaterial(meta, part.material.name)) return;
            // a flame part burns by day or not by what it is mounted on, so
            // the same fire asset in a brazier and on its own are two buckets
            const flamePart = ownFlames.has(part.material.name);
            const litByDay = flamePart && burnsByDay(meta, hostMeta);
            const chunk = settlementChunkKey(placement.positionM[0], placement.positionM[2]);
            const key = `${placement.kit}|${placement.assetId}|${level}|${partIndex}${litByDay ? "|day" : ""}|${chunk}`;
            const bucket = buckets.get(key) ?? {
              part, transforms: [], groundLinesM: [], farTransforms: [], farGroundLinesM: [],
            };
            if (flamePart) {
              bucket.flame = true;
              bucket.alwaysLit = litByDay;
            }
            if (isLanternShellMaterial(part.material, meta)) bucket.shell = true;
            const partTransform = transform.clone().multiply(part.localMatrix);
            if (farMerged) {
              bucket.farTransforms.push(partTransform);
              bucket.farGroundLinesM.push(groundLineM);
            } else {
              bucket.transforms.push(partTransform);
              bucket.groundLinesM.push(groundLineM);
            }
            buckets.set(key, bucket);
          });
          placementCount += 1;
        }
        const solid = solidFrom(placement, transform, anchored?.buryM ?? 0, asset.levels[0]);
        if (solid) solidCandidates.push({ value: solid, placementId: placement.id,
          distanceM: distance, parts: solid.parts.length });
      }

      // a bound run collides as one rigid chain: one joined part (0101 rule 9)
      const collision = selectCollisionResidency(
        mergeRunColliders(solidCandidates, (id) => runOfPlacement.get(id)), bundle.settlements, focus,
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
      const signature = buildSignature(buckets, collision.parts);
      const reuseLive = signature === liveSignature.current && group.children.length > 0;
      let triangles = 0; let draws = 0; let farInstances = 0; let farMeshes = 0;
      let nearInstances = 0; let groundBoundInstances = 0; let shadowPairedDraws = 0;
      const shadowPairFailures: string[] = [];
      // The run-joint gate (check-in 3 §2): a drawn run must step by its
      // mined rise at every joint. Reported in the evidence the probes read
      // and on the console; never thrown, so one bad run cannot blank a place.
      const runJointFailures = runJointErrors(runJoints);
      if (runJointFailures.length) console.error(`settlement run joints: ${runJointFailures.join("; ")}`);
      // the far merges this build draws (reused or new), keyed like the buckets
      const farKept = new Map<string, { signature: string; geometry: THREE.BufferGeometry }>();
      for (const [bucketKey, bucket] of buckets) {
        yield;
        validateMaterialTextureCap(bucket.part.material, bundle.lod.atlasMaxSize);
        // A glow material is one the kit build gave an emissive map (the NIF's
        // Glow_Map slot, build_kit rebuild_material), never a name match.
        const glowMaterial = bucket.flame ? (bucket.alwaysLit ? "flame" as const : "lamp-flame" as const)
          : bucket.shell ? "lamp-shell" as const
          : isSettlementGlowMaterial(bucket.part.material);
        const material = materialVariant(bucket.part.material, String(glowMaterial));
        bucket.material = material;
        materialPatch?.(material);
        applySettlementDecal(material);
        if (bucket.flame) applySettlementAdditive(material);
        applySettlementStillWater(material);
        const drawFlags = settlementMeshDrawFlags(material);
        let depthMaterial: THREE.MeshDepthMaterial | undefined;
        if (depthTwins.current.has(material)) {
          applySettlementSurface(material, uniforms, glowMaterial);
          depthMaterial = depthTwins.current.get(material);
          if (depthMaterial) syncSettlementDepthTwin(depthMaterial, material);
        } else {
          depthMaterial = applySettlementSurfaceWithShadow(material, uniforms, glowMaterial);
          depthTwins.current.set(material, depthMaterial);
        }
        const pairErrors = settlementShadowPairErrors(material, depthMaterial);
        if (pairErrors.length) {
          shadowPairFailures.push(...pairErrors.map((error) =>
            `${material.name || "<unnamed>"}: ${error}`));
          throw new Error(`settlement colour/depth material pair failed: ${pairErrors.join("; ")}`);
        }
        if (reuseLive) {
          const drawsHere = (bucket.transforms.length ? 1 : 0) + (bucket.farTransforms.length ? 1 : 0);
          draws += drawsHere;
          if (bucket.farTransforms.length) farMeshes += 1;
          nearInstances += bucket.transforms.length;
          farInstances += bucket.farTransforms.length;
          groundBoundInstances += bucket.transforms.length + bucket.farTransforms.length;
          if (depthMaterial) shadowPairedDraws += drawsHere;
        }
        if (!reuseLive && bucket.transforms.length) {
          const geometry = instancedPartView(bucket.part.geometry, bucket.groundLinesM);
          const mesh = new THREE.InstancedMesh(geometry, material, bucket.transforms.length);
          bucket.transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
          mesh.instanceMatrix.needsUpdate = true;
          // the chunk's own bounds: culled with its square, lit by its lamps
          mesh.computeBoundingSphere();
          mesh.castShadow = drawFlags.castShadow; mesh.receiveShadow = true;
          mesh.renderOrder = drawFlags.renderOrder;
          if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
          mesh.userData.esSettlementLodAuthority = true;
          next.add(mesh);
          draws += 1;
          nearInstances += bucket.transforms.length;
          groundBoundInstances += bucket.transforms.length;
          if (depthMaterial) shadowPairedDraws += 1;
        }
        let farGeometry: THREE.BufferGeometry | null = null;
        if (!reuseLive && bucket.farTransforms.length) {
          const farSignature = farSignatureOf(bucket.farTransforms, bucket.farGroundLinesM);
          const cached = farCache.current.get(bucketKey);
          farGeometry = cached?.signature === farSignature ? cached.geometry
            : mergeTransformedGeometry(bucket.part.geometry, bucket.farTransforms, bucket.farGroundLinesM);
          if (farGeometry) farKept.set(bucketKey, { signature: farSignature, geometry: farGeometry });
        }
        if (farGeometry) {
          const mesh = new THREE.Mesh(farGeometry, material);
          mesh.castShadow = drawFlags.castShadow; mesh.receiveShadow = true;
          mesh.renderOrder = drawFlags.renderOrder;
          if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
          mesh.userData.esSettlementFarMerge = true;
          next.add(mesh);
          draws += 1;
          farMeshes += 1;
          farInstances += bucket.farTransforms.length;
          groundBoundInstances += bucket.farTransforms.length;
          if (depthMaterial) shadowPairedDraws += 1;
        }
        triangles += bucket.part.triangles * bucket.transforms.length;
        triangles += bucket.part.triangles * bucket.farTransforms.length;
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
        // startup "buildings flash darker" (16k walk 5).
        const prepare = litPreparerOf(scene);
        if (prepare) prepare(next);
        else {
          const field = fixtureLightFieldOf(scene);
          next.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh && isFixtureLitMaterial(mesh.material as THREE.Material)
              && field.install(mesh.material as THREE.Material)) field.attach(mesh);
          });
        }
        // Linked against the target the scene pass draws into (the water
        // pipeline's linear target), so the first frame finds them linked.
        const linkStart = performance.now();
        while (!linker.observed && performance.now() - linkStart < SETTLEMENT_LINK_WAIT_MS) yield;
        let linked = false;
        linker.compileAsync(next, sceneCamera, scene).then(() => { linked = true; }, () => { linked = true; });
        while (!linked && performance.now() - linkStart < SETTLEMENT_LINK_WAIT_MS) yield;
        // the live far merges not kept are freed with the live group
        const keep = new Set([...farKept.values()].map((entry) => entry.geometry));
        farCache.current = farKept;
        disposeChildren(group, keep);
        // Every piece is baked into its instance matrices or merged geometry
        // at identity: no per-frame local-matrix recompose (audit row 16).
        for (const child of next.children) { child.matrixAutoUpdate = false; child.updateMatrix(); }
        swapInBuild(group, next);
        // Twins of materials no longer drawn go now, not at unmount.
        const drawn = new Set(group.children.map((child) => (child as THREE.Mesh).material));
        for (const [material, twin] of depthTwins.current) {
          if (drawn.has(material)) continue;
          twin?.dispose();
          depthTwins.current.delete(material);
        }
        liveSignature.current = signature;
        liveDraws.current = draws;
        frames.swaps += 1;
      } else {
        frames.skippedSwaps += 1;
      }
      // The new build is live: its covered radius and fixtures replace the old.
      liveCoveredRadiusM.current = collision.coveredRadiusM;
      if (builtAt.current) builtAt.current.coveredRadiusM = collision.coveredRadiusM;
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
        const cap = placement.kind === "dressing" ? 350
          : placement.kind === "route-structure" ? 2500 : MAX_RENDER_DISTANCE_M;
        const distance = Math.hypot(placement.positionM[0] - focus.x,
          placement.positionM[2] - focus.z);
        return (!residentPlacementIds.has(placement.id) && distance > cap * drawScale)
          || kits.has(placement.kit);
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
  }, [queue, bundle, kits, manifests, revision, groundAt, quality?.architectureDrawScale,
      focusRef, materialPatch, onSolids, onStats, uniforms, fatalError, frames, lightFixtures,
      placementById, materialVariant, gl, scene, sceneCamera, linker]);

  // The live group and the depth twins go with the world: on unmount, a new
  // baseUrl, or a fatal error emptying the layer. A new set of bundles
  // in range (S8) is NOT a reason: the next build swaps in over the live
  // group, so the buildings on screen never blink while the player walks.
  useEffect(() => {
    // Captured now: when a fatal error empties the layer, React has already
    // detached the ref by the time this cleanup runs.
    const group = root.current;
    const twins = depthTwins.current;
    const far = farCache.current;
    return () => {
      if (group) disposeChildren(group);
      far.clear();
      liveSignature.current = "";
      liveDraws.current = 0;
      twins.forEach((material) => material?.dispose());
      twins.clear();
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
