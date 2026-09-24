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
  applySettlementSurfaceWithShadow,
  SETTLEMENT_GROUND_ATTRIBUTE,
  settlementShadowPairErrors,
  updateSettlementEnvironment,
  type SettlementMaterialUniforms,
} from "./materials";
import {
  SETTLEMENT_COLLISION_FRAME,
  type SettlementBundle,
  type SettlementCollisionShape,
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
});

/** Dispose and detach everything the layer put in `group`. Used both when a
 * finished build swaps its detached group in and on unmount. */
function disposeChildren(group: THREE.Group): void {
  const depthMaterials = new Set<THREE.Material>();
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.Mesh && child.customDepthMaterial) {
      depthMaterials.add(child.customDepthMaterial);
    }
    if (child instanceof THREE.InstancedMesh) {
      child.dispose();
      if (child.userData.esSettlementOwnedGeometry) child.geometry.dispose();
    }
    else if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (!child.userData.esSettlementFarMerge) {
        (child.material as THREE.Material).dispose();
      }
    }
  }
  depthMaterials.forEach((material) => material.dispose());
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
  // 16h item 5: schema 2 is the bundle that carries anchorClass,
  // parentPlacementId, mountOffsetM and the water fields. A schema-1 bundle
  // has no anchor classes at all, so it is refused rather than drawn as if
  // every piece were a ground piece.
  if (bundle.schemaVersion !== 2) throw new Error(`unsupported settlement schema ${bundle.schemaVersion}`);
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

/** Longest skirt edge between ground samples (m): the terrain's own sample
 *  spacing class, so the band follows the ground instead of bridging it. */
const SKIRT_MAX_EDGE_M = 1.83;
/** A sharp corner's mitre is capped at this multiple of the band width. */
const SKIRT_MITRE_CAP = 2.5;

/**
 * The wall-foot skirt (16h K6, research/rendering/building-placement-
 * rendering-treatments.md §2.2): a band `widthM` wide offset straight out
 * from every footprint wall, with mitred corners, subdivided so no edge is
 * longer than SKIRT_MAX_EDGE_M and each vertex sits on the sampled ground.
 * Vertex alpha runs 1 at the wall to 0 at the outer edge, so the band fades
 * into the terrain; polygon offset, not a lift, keeps it off the ground's
 * depth. Returns null when the ground is not loaded under any vertex.
 */
function treatmentMesh(
  footprint: [number, number][],
  widthM: number,
  groundAt: SettlementLayerProps["groundAt"],
): THREE.Mesh | null {
  const n = footprint.length;
  if (n < 3) return null;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = footprint[i]; const [bx, bz] = footprint[(i + 1) % n];
    area += ax * bz - bx * az;
  }
  // (dz, -dx) is the outward normal of a positive-area (x east, z south) ring
  const side = area >= 0 ? 1 : -1;
  const normals = footprint.map(([ax, az], i) => {
    const [bx, bz] = footprint[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    return [side * (bz - az) / len, side * -(bx - ax) / len] as const;
  });
  // Mitred outer corner at vertex i, from the offsets of edges i-1 and i.
  const outer = footprint.map(([x, z], i) => {
    const a = normals[(i + n - 1) % n]; const b = normals[i];
    const mx = a[0] + b[0]; const mz = a[1] + b[1];
    const dot = mx * b[0] + mz * b[1];          // 1 + cos(turn), >= 0
    const ml = Math.hypot(mx, mz);
    if (dot < 1e-6 || ml < 1e-6) return [x + b[0] * widthM, z + b[1] * widthM] as const;
    const k = Math.min(widthM / dot, (widthM * SKIRT_MITRE_CAP) / ml);
    return [x + mx * k, z + mz * k] as const;
  });
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = footprint[i]; const b = footprint[(i + 1) % n];
    const oa = outer[i]; const ob = outer[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SKIRT_MAX_EDGE_M));
    const base = positions.length / 3;
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const ix = a[0] + (b[0] - a[0]) * f; const iz = a[1] + (b[1] - a[1]) * f;
      const ox = oa[0] + (ob[0] - oa[0]) * f; const oz = oa[1] + (ob[1] - oa[1]) * f;
      const yi = groundAt(ix, iz); const yo = groundAt(ox, oz);
      if (yi === null || yo === null) return null;
      positions.push(ix, yi, iz, ox, yo, oz);
      colours.push(1, 1, 1, 1, 1, 1, 1, 0);
    }
    for (let k = 0; k < steps; k++) {
      const w0 = base + k * 2; const w1 = w0 + 2;
      indices.push(w0, w0 + 1, w1, w0 + 1, w1 + 1, w1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 4));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x342c20, roughness: 1,
    vertexColors: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  material.userData.esAerial = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true; mesh.castShadow = false;
  return mesh;
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
      collision: emptyCollisionProof() });
  }, [baseUrl]);

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
    if (env) updateSettlementEnvironment(uniforms, env.rainIntensity, env.minuteOfDay);
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
    });
  }, [bundle, fatalError, onSolids]);

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
      let triangles = 0; let draws = 0; let farInstances = 0; let farMeshes = 0;
      let nearInstances = 0; let groundBoundInstances = 0; let shadowPairedDraws = 0;
      const shadowPairFailures: string[] = [];
      for (const bucket of buckets.values()) {
        yield;
        const material = bucket.part.material;
        validateMaterialTextureCap(material, bundle.lod.atlasMaxSize);
        const windowMaterial = /window|glow/i.test(material.name);
        materialPatch?.(material);
        const depthMaterial = applySettlementSurfaceWithShadow(material, uniforms, windowMaterial);
        const pairErrors = settlementShadowPairErrors(material, depthMaterial);
        if (pairErrors.length) {
          shadowPairFailures.push(...pairErrors.map((error) =>
            `${material.name || "<unnamed>"}: ${error}`));
          throw new Error(`settlement colour/depth material pair failed: ${pairErrors.join("; ")}`);
        }
        if (bucket.transforms.length) {
          const geometry = bucket.part.geometry.clone();
          geometry.setAttribute(SETTLEMENT_GROUND_ATTRIBUTE, new THREE.InstancedBufferAttribute(
            new Float32Array(bucket.groundLinesM), 1,
          ));
          const mesh = new THREE.InstancedMesh(geometry, material, bucket.transforms.length);
          bucket.transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
          mesh.instanceMatrix.needsUpdate = true;
          mesh.castShadow = true; mesh.receiveShadow = true;
          if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
          mesh.userData.esSettlementLodAuthority = true;
          mesh.userData.esSettlementOwnedGeometry = true;
          next.add(mesh);
          draws += 1;
          nearInstances += bucket.transforms.length;
          groundBoundInstances += bucket.transforms.length;
          if (depthMaterial) shadowPairedDraws += 1;
        }
        const farGeometry = mergeTransformedGeometry(
          bucket.part.geometry, bucket.farTransforms, bucket.farGroundLinesM,
        );
        if (farGeometry) {
          const mesh = new THREE.Mesh(farGeometry, material);
          mesh.castShadow = true; mesh.receiveShadow = true;
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
      // Fine wall-foot skirt/contact AO: near-only, never part of far LOD.
      yield;
      for (const treatment of bundle.groundTreatments) {
        const cx = treatment.footprintM.reduce((n, p) => n + p[0], 0) / treatment.footprintM.length;
        const cz = treatment.footprintM.reduce((n, p) => n + p[1], 0) / treatment.footprintM.length;
        if (Math.hypot(cx - focus.x, cz - focus.z) > 300) continue;
        const skirt = treatmentMesh(treatment.footprintM, treatment.baseSkirtWidthM, groundAt);
        if (skirt) next.add(skirt);
      }
      const grounding = settlementGroundAudits(bundle.settlements, placementGrounding);
      // Final step: the finished build replaces the live one atomically.
      disposeChildren(group);
      // Snapshot: `add` detaches each child from `next` as it goes.
      group.add(...[...next.children]);
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
    return () => {
      running.current?.cancel();
      running.current = null;
      if (root.current) disposeChildren(root.current);
    };
  }, [queue, bundle, kits, manifests, revision, groundAt, quality?.architectureDrawScale,
      focusRef, materialPatch, onSolids, onStats, uniforms, fatalError]);

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
