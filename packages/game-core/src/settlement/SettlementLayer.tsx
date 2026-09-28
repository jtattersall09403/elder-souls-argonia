import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { createKitLoader } from "../assets/kitLoader";
import { useFrameWork } from "../scheduling/frameWorkContext";
import type { FrameJobHandle } from "../scheduling/frameWork";
import { useKitDecoders } from "../assets/useKitDecoders";
import { KitCache } from "./kitCache";
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
import {
  SETTLEMENT_COLLISION_FRAME,
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
  isFireSocket, isLightFixturePlacement, SettlementLightFixtures,
  type LightFixture,
} from "./lighting";
import { mergeRunColliders } from "./runColliders";
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
  transforms: THREE.Matrix4[];
  groundLinesM: number[];
  farTransforms: THREE.Matrix4[];
  farGroundLinesM: number[];
  /** A light fixture's own additive flame card: it glows by night (lighting.ts). */
  flame?: boolean;
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

/** Dispose and detach everything the layer put in `group`: the per-build
 * instance buffers and far-merge geometry. Colour materials belong to the
 * kit and shadow-depth twins to the layer's cache (one per colour material,
 * disposed on unmount), so a swap never frees a material the next build
 * still draws with. */
function disposeChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.InstancedMesh) {
      child.dispose();
      if (child.userData.esSettlementOwnedGeometry) child.geometry.dispose();
    }
    else if (child instanceof THREE.Mesh) child.geometry.dispose();
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
const MAX_RENDER_DISTANCE_M = 5000;
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
  if (bundle.schemaVersion !== 3 && bundle.schemaVersion !== 4) throw new Error(`unsupported settlement schema ${bundle.schemaVersion}`);
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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`kit manifest HTTP ${response.status}`);
  return kitAssetMetaFromManifest(await response.json(), url);
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
  baseUrl, focusRef, groundAt, quality, environment, onSolids, onStats, materialPatch,
  rebuildRef, onDoors, kitCache: sharedKitCache, lightFixtures: sharedLightFixtures, onError,
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
  const incomplete = useRef(false);
  const retryAt = useRef(0);
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
  // Light fixtures (lighting.ts): injected by the scene, else the layer's own.
  const ownLightFixtures = useMemo(
    () => (sharedLightFixtures ? null : new SettlementLightFixtures(uniforms.esSettlementNight)),
    [sharedLightFixtures, uniforms]);
  const lightFixtures = sharedLightFixtures ?? ownLightFixtures!;
  useEffect(() => () => ownLightFixtures?.dispose(), [ownLightFixtures]);
  // Smoke and billboard flames draw on the post-water layer (like rain): the
  // camera must see it in a plain render too, where no water pipeline runs.
  const { camera: sceneCamera } = useThree();
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
      if (data.key === loadedBundle.current?.key) return;
      loadedBundle.current = data;
      setBundle(data);
      // The door interaction hook (0103 decision 4): the door records go to
      // whoever runs the doors; the layer itself draws no door.
      onDoors?.(data.doors ?? []);
    }).catch((error: unknown) => {
      if (cancelled) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      bundleSource.fail(failure);
      setFatalError(failure);
    });
    return () => { cancelled = true; };
    // onDoors is read once per bundle load, like the bundle itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleSource, queryRevision]);

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
      if (!manifests.has(id) && !pendingManifests.current.has(id)) {
        pendingManifests.current.add(id);
        loadKitAssetMeta(`${baseUrl}${kit.manifest}`).then((assets) => {
          setManifests((current) => new Map(current).set(id, assets));
        }).catch((error: unknown) => setFatalError(new Error(
          `settlement kit manifest ${id} failed: `
          + `${error instanceof Error ? error.message : String(error)}`)))
          .finally(() => pendingManifests.current.delete(id));
      }
      if (gltfs.has(id)) continue;
      pendingKits.current.add(id);
      kitCache.load(id, `${baseUrl}${kit.glb}`, (url) => loader.loadAsync(url)).then((gltf) => {
        setGltfs((current) => new Map(current).set(id, gltf));
      }).catch((error: unknown) => setFatalError(new Error(
        `settlement kit ${id} failed: ${error instanceof Error ? error.message : String(error)}`)))
        .finally(() => pendingKits.current.delete(id));
    }
  }, [bundle, revision, baseUrl, focusRef, quality?.architectureDrawScale, gltfs, manifests,
      decoders, kitCache]);

  const kits = useMemo(() => {
    return new Map([...gltfs].map(([id, gltf]) => [id, buildArchitectureKit(gltf)]));
  }, [gltfs]);

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
    fetch(manifestUrl).then((response) => {
      if (!response.ok) throw new Error(`${manifestUrl}: HTTP ${response.status}`);
      return response.json();
    }).then((manifest: unknown) => {
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

  // The billboard flame texture: vanilla's candle flame, published by the
  // works-v1 build (`effectTextures`), loaded once per bundle. A fixture is
  // known only after a build (a LIGH record can make one on any layer), and
  // the file is one small PNG, so every bundle with placements loads it.
  const flameManifest = useMemo(
    () => (bundle?.placements.length ? flameManifestPath(bundle.kits) : null), [bundle]);
  useEffect(() => {
    setEffectError("flame", null);
    if (!flameManifest) return undefined;
    let cancelled = false;
    const manifestUrl = `${baseUrl}${flameManifest}`;
    fetch(manifestUrl).then((response) => {
      if (!response.ok) throw new Error(`${manifestUrl}: HTTP ${response.status}`);
      return response.json();
    }).then((manifest: unknown) => {
      const file = effectTextureFile(manifest, FLAME_TEXTURE_ASSET_ID, manifestUrl);
      return new THREE.TextureLoader().loadAsync(`${manifestUrl.replace(/[^/]*$/, "")}${file}`);
    }).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      if (cancelled) { texture.dispose(); return; }
      lightFixtures.setFlameTexture(texture);   // disposes the one it replaces
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
    if (incomplete.current && performance.now() - retryAt.current > 2000) {
      retryAt.current = performance.now();
      setRevision((v) => v + 1);
    }
  });

  // The host's readable line, and the console (decision 0052 addendum
  // 2026-09-28: a failure shown only as a shape was unreadable three times).
  useEffect(() => {
    const report = fatalError ? { fatal: true, message: fatalError.message }
      : effectErrors.flame || effectErrors.smoke
        ? { fatal: false, message: [effectErrors.flame, effectErrors.smoke].filter(Boolean).join("; ") }
        : null;
    if (report) console.error(`[settlement] ${report.fatal ? "LAYER FAILED" : "effect failed"}: ${report.message}`);
    onErrorRef.current?.(report);
  }, [fatalError, effectErrors]);
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
      incomplete.current = false;
      let sinceYield = 0;

      const resolvePlaced = createPlacementResolver(bundle.placements,
        (p) => kitAssetMetaOf(manifests, p),
        groundAt);
      const smokeHere: SmokeAnchor[] = [];

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
          if (!at) { incomplete.current = true; continue; }
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
        if (!here) { incomplete.current = true; continue; }
        const { matrix: transform, anchored } = here;
        if (anchored) placementGrounding.push(placementGroundAudit(placement, anchored));
        if (placement.run) {
          runJoints.push({ placementId: placement.id, run: placement.run, y: transform.elements[13] });
          runOfPlacement.set(placement.id, placement.run.id);
        }
        const groundLineM = anchored ? anchored.groundLineM : transform.elements[13];
        const meta = kitAssetMetaOf(manifests, placement);
        const fixture = inDrawRange && isLightFixturePlacement(placement, meta);
        // An additive (flame or glow card) material glows by night on every
        // instance of its asset: fixed per material, so a material never
        // flips glow kind (and recompiles) with what a build happens to hold.
        const ownFlames = new Set(meta?.additiveMaterials ?? []);
        if (inDrawRange) {
          const box = assetBox(`${placement.kit}|${placement.assetId}`, asset.levels[0]);
          if (fixture) fixturesHere.push(fixtureFromPiece(placement.id, meta, transform, box));
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
            const key = `${placement.kit}|${placement.assetId}|${level}|${partIndex}`;
            const bucket = buckets.get(key) ?? {
              part, transforms: [], groundLinesM: [], farTransforms: [], farGroundLinesM: [],
            };
            if (ownFlames.has(part.material.name)) bucket.flame = true;
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
      for (const bucket of buckets.values()) {
        yield;
        const material = bucket.part.material;
        validateMaterialTextureCap(material, bundle.lod.atlasMaxSize);
        // A glow material is one the kit build gave an emissive map (the NIF's
        // Glow_Map slot, build_kit rebuild_material), never a name match.
        const glowMaterial = isSettlementGlowMaterial(material) || (bucket.flame ? "flame" as const : false);
        materialPatch?.(material);
        applySettlementDecal(material);
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
          const geometry = bucket.part.geometry.clone();
          geometry.setAttribute(SETTLEMENT_GROUND_ATTRIBUTE, new THREE.InstancedBufferAttribute(
            new Float32Array(bucket.groundLinesM), 1,
          ));
          const mesh = new THREE.InstancedMesh(geometry, material, bucket.transforms.length);
          bucket.transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
          mesh.instanceMatrix.needsUpdate = true;
          mesh.castShadow = drawFlags.castShadow; mesh.receiveShadow = true;
          mesh.renderOrder = drawFlags.renderOrder;
          if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
          mesh.userData.esSettlementLodAuthority = true;
          mesh.userData.esSettlementOwnedGeometry = true;
          next.add(mesh);
          draws += 1;
          nearInstances += bucket.transforms.length;
          groundBoundInstances += bucket.transforms.length;
          if (depthMaterial) shadowPairedDraws += 1;
        }
        const farGeometry = reuseLive ? null : mergeTransformedGeometry(
          bucket.part.geometry, bucket.farTransforms, bucket.farGroundLinesM,
        );
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
        disposeChildren(group);
        swapInBuild(group, next);
        // Twins of materials no longer drawn (a kit re-cloned its materials)
        // go now, not at unmount.
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
        // A successful swap leaves `next` empty; a cancelled build does not.
        disposeChildren(next);
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
      placementById]);

  // The live group and the depth twins go with the world: on unmount, a new
  // baseUrl, or a fatal error emptying the layer. A new set of bundles
  // in range (S8) is NOT a reason: the next build swaps in over the live
  // group, so the buildings on screen never blink while the player walks.
  useEffect(() => {
    // Captured now: when a fatal error empties the layer, React has already
    // detached the ref by the time this cleanup runs.
    const group = root.current;
    const twins = depthTwins.current;
    return () => {
      if (group) disposeChildren(group);
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
    </>
  );
}
