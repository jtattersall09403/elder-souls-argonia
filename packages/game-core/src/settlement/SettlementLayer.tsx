import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import {
  anchorPlacement,
  finalPlacementTransform,
  footprintDiagonalM,
  placementGroundAudit,
  settlementGroundAudits,
} from "./anchoring";
import { buildArchitectureKit, type ArchitecturePart } from "./kit";
import {
  architectureLod,
  mergeTransformedGeometry,
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
  type SettlementLayerProps,
  type SettlementPlacement,
  type SettlementPlacementGroundAudit,
  type SettlementProofState,
  type SettlementSolid,
} from "./types";

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
  if (bundle.schemaVersion !== 1) throw new Error(`unsupported settlement schema ${bundle.schemaVersion}`);
  if (bundle.collisionFrame !== SETTLEMENT_COLLISION_FRAME) {
    throw new Error(`unsupported settlement collision frame ${bundle.collisionFrame}`);
  }
  return bundle;
}

function treatmentMesh(
  footprint: [number, number][],
  widthM: number,
  groundAt: SettlementLayerProps["groundAt"],
): THREE.Mesh | null {
  if (footprint.length < 3) return null;
  const cx = footprint.reduce((s, p) => s + p[0], 0) / footprint.length;
  const cz = footprint.reduce((s, p) => s + p[1], 0) / footprint.length;
  const outer = footprint.map(([x, z]) => {
    const d = Math.hypot(x - cx, z - cz) || 1;
    return [x + ((x - cx) / d) * widthM, z + ((z - cz) / d) * widthM] as const;
  });
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]; const b = outer[i];
    const ya = groundAt(a[0], a[1]); const yb = groundAt(b[0], b[1]);
    if (ya === null || yb === null) return null;
    positions.push(a[0], ya + 0.035, a[1], b[0], yb + 0.035, b[1]);
  }
  for (let i = 0; i < footprint.length; i++) {
    const a = i * 2; const b = ((i + 1) % footprint.length) * 2;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x342c20, roughness: 1,
    transparent: true, opacity: 0.62, depthWrite: false });
  material.userData.esAerial = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true; mesh.castShadow = false;
  return mesh;
}

function solidFrom(
  placement: SettlementPlacement,
  y: number,
  buryM: number,
  parts: ArchitecturePart[],
): SettlementSolid | null {
  if (placement.collision.kind === "none") return null;
  if (placement.collision.frame !== SETTLEMENT_COLLISION_FRAME) {
    throw new Error(`${placement.id}: untagged/old collision frame refused`);
  }
  const measuredParts = placement.collision.parts?.flatMap((part) => {
    const minY = Math.min(part.offsetM[1] + part.halfExtentsM[1] - 0.05,
      part.offsetM[1] - part.halfExtentsM[1] + buryM);
    const maxY = part.offsetM[1] + part.halfExtentsM[1];
    if (maxY <= minY) return [];
    return [{
      halfExtentsM: [part.halfExtentsM[0], (maxY - minY) / 2, part.halfExtentsM[2]] as
        [number, number, number],
      offsetM: [part.offsetM[0], (maxY + minY) / 2, part.offsetM[2]] as
        [number, number, number],
    }];
  });
  const collisionParts = measuredParts?.length ? measuredParts : parts.flatMap((part) => {
    part.geometry.computeBoundingBox();
    if (!part.geometry.boundingBox) return [];
    const box = part.geometry.boundingBox.clone().applyMatrix4(part.localMatrix);
    // Do not create a standable ledge for the buried slice.
    box.min.y = Math.min(box.max.y - 0.05, box.min.y + buryM);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return [];
    return [{ halfExtentsM: [size.x / 2, size.y / 2, size.z / 2] as [number, number, number],
      offsetM: [centre.x, centre.y, centre.z] as [number, number, number] }];
  });
  if (!collisionParts.length) return null;
  return { id: placement.id, frame: SETTLEMENT_COLLISION_FRAME,
    position: [placement.positionM[0], y, placement.positionM[2]],
    yaw: THREE.MathUtils.degToRad(placement.yawDeg), scale: placement.scale,
    parts: collisionParts };
}

export function SettlementLayer({
  baseUrl, focusRef, groundAt, quality, environment, onSolids, onStats, materialPatch,
}: SettlementLayerProps) {
  const root = useRef<THREE.Group>(null);
  const [bundle, setBundle] = useState<SettlementBundle | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [gltfs, setGltfs] = useState<Map<string, GLTF>>(() => new Map());
  const pendingKits = useRef(new Set<string>());
  const [revision, setRevision] = useState(0);
  const builtAt = useRef<{ x: number; z: number; coveredRadiusM: number } | null>(null);
  const incomplete = useRef(false);
  const retryAt = useRef(0);
  const collisionFailure = useRef<SettlementProofState["collision"] | null>(null);
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
    const loader = new GLTFLoader();
    for (const id of wanted) {
      if (gltfs.has(id) || pendingKits.current.has(id)) continue;
      const kit = bundle.kits[id];
      if (!kit) {
        setFatalError(new Error(`settlement bundle references missing kit ${id}`));
        continue;
      }
      pendingKits.current.add(id);
      loader.loadAsync(`${baseUrl}${kit.glb}`).then((gltf) => {
        setGltfs((current) => new Map(current).set(id, gltf));
      }).catch((error: unknown) => setFatalError(new Error(
        `settlement kit ${id} failed: ${error instanceof Error ? error.message : String(error)}`)))
        .finally(() => pendingKits.current.delete(id));
    }
  }, [bundle, revision, baseUrl, focusRef, quality?.architectureDrawScale, gltfs]);

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
    const group = root.current;
    if (!group || !bundle || fatalError) return;
    group.clear();
    const focus = focusRef.current;
    const residentPlacementIds = residentPlacementIdsAt(bundle.settlements, focus);
    builtAt.current = { ...focus, coveredRadiusM: 0 };
    const buckets = new Map<string, DrawBucket>();
    const solidCandidates: {
      value: SettlementSolid; placementId: string; distanceM: number; parts: number;
    }[] = [];
    const placementGrounding: SettlementPlacementGroundAudit[] = [];
    let placementCount = 0;
    incomplete.current = false;
    for (const placement of bundle.placements) {
      // Audit every physical place reference, not just what this quality tier
      // happens to draw. settlement.placementIds includes dressing, so the
      // expected and measured populations remain exactly comparable.
      const settlementAnchored = placement.kind === "route-structure"
        ? null : anchorPlacement(placement, groundAt);
      if (settlementAnchored) {
        placementGrounding.push(placementGroundAudit(placement, settlementAnchored));
      }
      const distance = Math.hypot(placement.positionM[0] - focus.x, placement.positionM[2] - focus.z);
      const cap = placement.kind === "dressing" ? 350
        : placement.kind === "route-structure" ? 2500 : MAX_RENDER_DISTANCE_M;
      const inDrawRange = distance <= cap * (quality?.architectureDrawScale ?? 1);
      const collisionResident = residentPlacementIds.has(placement.id);
      if (!inDrawRange && !collisionResident) continue;
      const anchored = settlementAnchored ?? anchorPlacement(placement, groundAt);
      if (!anchored.complete) { incomplete.current = true; continue; }
      const asset = kits.get(placement.kit)?.get(placement.assetId);
      if (!asset) continue;
      if (inDrawRange) {
        const triangles = asset.levels.map((parts) => parts.reduce((n, p) => n + p.triangles, 0));
        validateLodTriangles(triangles, bundle.lod);
        const choice = architectureLod(distance, footprintDiagonalM(placement), asset.levels.length,
          bundle.lod, quality?.architectureDrawScale ?? 1);
        // Compute this only after the streamed terrain (including any compiled
        // pad grade) is final. Both near instances and far merges consume this
        // exact matrix; LOD choice cannot re-anchor a building.
        const transform = finalPlacementTransform(placement, anchored);
        asset.levels[choice.level].forEach((part, partIndex) => {
          const key = `${placement.kit}|${placement.assetId}|${choice.level}|${partIndex}`;
          const bucket = buckets.get(key) ?? {
            part, transforms: [], groundLinesM: [], farTransforms: [], farGroundLinesM: [],
          };
          const partTransform = transform.clone().multiply(part.localMatrix);
          if (choice.farMerged) {
            bucket.farTransforms.push(partTransform);
            bucket.farGroundLinesM.push(anchored.groundLineM);
          } else {
            bucket.transforms.push(partTransform);
            bucket.groundLinesM.push(anchored.groundLineM);
          }
          buckets.set(key, bucket);
        });
        placementCount += 1;
      }
      const solid = solidFrom(placement, anchored.y, anchored.buryM, asset.levels[0]);
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
        group.add(mesh);
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
        group.add(mesh);
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
    for (const treatment of bundle.groundTreatments) {
      const cx = treatment.footprintM.reduce((n, p) => n + p[0], 0) / treatment.footprintM.length;
      const cz = treatment.footprintM.reduce((n, p) => n + p[1], 0) / treatment.footprintM.length;
      if (Math.hypot(cx - focus.x, cz - focus.z) > 300) continue;
      const skirt = treatmentMesh(treatment.footprintM, treatment.baseSkirtWidthM, groundAt);
      if (skirt) group.add(skirt);
    }
    const grounding = settlementGroundAudits(bundle.settlements, placementGrounding);
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
    return () => {
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
    };
  }, [bundle, kits, revision, groundAt, quality?.architectureDrawScale,
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
