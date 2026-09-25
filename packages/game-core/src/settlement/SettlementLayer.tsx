import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { createKitLoader } from "../assets/kitLoader";
import { useFrameWork } from "../scheduling/frameWorkContext";
import type { FrameJobHandle } from "../scheduling/frameWork";
import { useKitDecoders } from "../assets/useKitDecoders";
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

interface DrawBucket {
  part: ArchitecturePart;
  transforms: THREE.Matrix4[];
  groundLinesM: number[];
  farTransforms: THREE.Matrix4[];
  farGroundLinesM: number[];
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

export async function loadSettlementBundle(baseUrl: string): Promise<SettlementBundle> {
  const response = await fetch(`${baseUrl}province/settlements.json`);
  if (!response.ok) throw new Error(`settlement bundle HTTP ${response.status}`);
  const bundle = await response.json() as SettlementBundle;
  // 16h item 5: schema 2 carried anchorClass, parentPlacementId,
  // mountOffsetM and the water fields; schema 3 adds the run record every
  // modular-run piece is seated on (check-in 3 §2) and the treatment kind
  // and aprons (§5). An older bundle is refused rather than drawn with its
  // runs stepped at every joint.
  if (bundle.schemaVersion !== 3) throw new Error(`unsupported settlement schema ${bundle.schemaVersion}`);
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
  rebuildRef,
}: SettlementLayerProps) {
  const root = useRef<THREE.Group>(null);
  const [bundle, setBundle] = useState<SettlementBundle | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [gltfs, setGltfs] = useState<Map<string, GLTF>>(() => new Map());
  // Per-asset kit truth (designed sink, waterline, anchor class): the runtime
  // reads the SAME published manifest the compile measured (16h item 1).
  const [manifests, setManifests] = useState<Map<string, Map<string, SettlementKitAssetMeta>>>(
    () => new Map());
  const pendingKits = useRef(new Set<string>());
  const pendingManifests = useRef(new Set<string>());
  const decoders = useKitDecoders(baseUrl);
  const [revision, setRevision] = useState(0);
  const builtAt = useRef<{ x: number; z: number; coveredRadiusM: number } | null>(null);
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
    loadSettlementBundle(baseUrl).then((data) => {
      if (!cancelled) setBundle(data);
    }).catch((error: unknown) => {
      if (!cancelled) setFatalError(error instanceof Error ? error : new Error(String(error)));
    });
    return () => { cancelled = true; };
  }, [baseUrl]);

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
      loader.loadAsync(`${baseUrl}${kit.glb}`).then((gltf) => {
        setGltfs((current) => new Map(current).set(id, gltf));
      }).catch((error: unknown) => setFatalError(new Error(
        `settlement kit ${id} failed: ${error instanceof Error ? error.message : String(error)}`)))
        .finally(() => pendingKits.current.delete(id));
    }
  }, [bundle, revision, baseUrl, focusRef, quality?.architectureDrawScale, gltfs, manifests,
      decoders]);

  const kits = useMemo(() => {
    return new Map([...gltfs].map(([id, gltf]) => [id, buildArchitectureKit(gltf)]));
  }, [gltfs]);

  useFrame(() => {
    if (fatalError) return;
    const env = environment?.();
    if (env) updateSettlementEnvironment(uniforms, env.rainIntensity, env.epochMinutes);
    const liveChildren = root.current?.children.length ?? 0;
    frames.frames += 1;
    frames.liveChildren = liveChildren;
    if (liveChildren === 0 && liveDraws.current > 0) frames.blankFrames += 1;
    const at = builtAt.current; const focus = focusRef.current;
    const rebuildMoveM = at ? Math.min(REBUILD_MOVE_M, Math.max(1, at.coveredRadiusM * 0.5)) : REBUILD_MOVE_M;
    if (at && Math.hypot(focus.x - at.x, focus.z - at.z) > rebuildMoveM) {
      builtAt.current = null; setRevision((v) => v + 1);
    }
    if (incomplete.current && performance.now() - retryAt.current > 2000) {
      retryAt.current = performance.now();
      setRevision((v) => v + 1);
    }
  });

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
    // must surface as its own fatal sentinel. Uncaught, it unmounts the whole
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
      builtAt.current = { ...focus, coveredRadiusM: 0 };
      const buckets = new Map<string, DrawBucket>();
      const solidCandidates: {
        value: SettlementSolid; placementId: string; distanceM: number; parts: number;
      }[] = [];
      const placementGrounding: SettlementPlacementGroundAudit[] = [];
      const runJoints: RunJointSample[] = [];
      let placementCount = 0;
      incomplete.current = false;
      let sinceYield = 0;

      const resolvePlaced = createPlacementResolver(bundle.placements,
        (p) => kitAssetMetaOf(manifests, p), groundAt);

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
        const asset = kits.get(placement.kit)?.get(placement.assetId);
        if (!asset) continue;
        const here = resolvePlaced(placement);
        if (!here) { incomplete.current = true; continue; }
        const { matrix: transform, anchored } = here;
        if (anchored) placementGrounding.push(placementGroundAudit(placement, anchored));
        if (placement.run) {
          runJoints.push({ placementId: placement.id, run: placement.run, y: transform.elements[13] });
        }
        const groundLineM = anchored ? anchored.groundLineM : transform.elements[13];
        if (inDrawRange) {
          const triangles = asset.levels.map((parts) => parts.reduce((n, p) => n + p.triangles, 0));
          validateLodTriangles(triangles, bundle.lod);
          // One rung per kit level, hard steps, no card (0075): the ladder is
          // the same helper the vegetation cell build uses.
          const ladder = settlementLadder(footprintDiagonalM(placement), asset.levels.length,
            bundle.lod, cap, drawScaleHere);
          const level = ladderLevelAt(ladder, distance);
          const farMerged = distance >= bundle.lod.farMergeDistanceM * drawScaleHere;
          asset.levels[level].forEach((part, partIndex) => {
            const key = `${placement.kit}|${placement.assetId}|${level}|${partIndex}`;
            const bucket = buckets.get(key) ?? {
              part, transforms: [], groundLinesM: [], farTransforms: [], farGroundLinesM: [],
            };
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

      const collision = selectCollisionResidency(solidCandidates, bundle.settlements, focus,
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
      builtAt.current.coveredRadiusM = collision.coveredRadiusM;
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
        const glowMaterial = isSettlementGlowMaterial(material);
        materialPatch?.(material);
        applySettlementDecal(material);
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
      // Final step: the finished build replaces the live one atomically, in
      // one synchronous step, so no frame draws an empty layer.
      if (!reuseLive) {
        disposeChildren(group);
        // Snapshot: `add` detaches each child from `next` as it goes.
        group.add(...[...next.children]);
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
      focusRef, materialPatch, onSolids, onStats, uniforms, fatalError, frames]);

  // The live group and the depth twins go with the world: on unmount, a new
  // baseUrl or bundle, or the fatal sentinel replacing the layer.
  useEffect(() => {
    // Captured now: when the sentinel replaces the layer, React has already
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
  }, [baseUrl, bundle, fatalError]);

  // A conspicuous runtime sentinel makes missing settlement data visible in
  // both production and development even when the host has no ErrorBoundary.
  // It contains no substitute world geometry: publication has failed closed.
  if (fatalError) return (
    <group key="settlement-layer-failed" name="settlement-layer-failed"
      position={[focusRef.current.x, 30, focusRef.current.z]}
      userData={{ error: fatalError.message }}>
      <mesh>
        <octahedronGeometry args={[18, 0]} />
        <meshBasicMaterial color={0xff00ff} wireframe />
      </mesh>
    </group>
  );
  return <group key="settlement-layer" ref={root} name="settlement-layer" />;
}
