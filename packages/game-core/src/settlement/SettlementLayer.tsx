import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { anchorPlacement, footprintDiagonalM } from "./anchoring";
import { buildArchitectureKit, type ArchitecturePart } from "./kit";
import { architectureLod, validateLodTriangles } from "./lod";
import {
  applySettlementSurface,
  updateSettlementEnvironment,
  type SettlementMaterialUniforms,
} from "./materials";
import {
  SETTLEMENT_COLLISION_FRAME,
  type SettlementBundle,
  type SettlementLayerProps,
  type SettlementPlacement,
  type SettlementSolid,
} from "./types";

interface DrawBucket {
  part: ArchitecturePart;
  transforms: THREE.Matrix4[];
  far: number;
}

const REBUILD_MOVE_M = 40;
const MAX_RENDER_DISTANCE_M = 5000;

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
  parts: ArchitecturePart[],
): SettlementSolid | null {
  if (placement.collision.kind === "none") return null;
  if (placement.collision.frame !== SETTLEMENT_COLLISION_FRAME) {
    throw new Error(`${placement.id}: untagged/old collision frame refused`);
  }
  const collisionParts = parts.flatMap((part) => {
    part.geometry.computeBoundingBox();
    if (!part.geometry.boundingBox) return [];
    const box = part.geometry.boundingBox.clone().applyMatrix4(part.localMatrix);
    // Do not create a standable ledge for the buried slice.
    box.min.y = Math.min(box.max.y - 0.05, box.min.y + placement.anchor.buryM);
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
  const [gltfs, setGltfs] = useState<Map<string, GLTF>>(() => new Map());
  const pendingKits = useRef(new Set<string>());
  const [revision, setRevision] = useState(0);
  const builtAt = useRef<{ x: number; z: number } | null>(null);
  const incomplete = useRef(false);
  const retryAt = useRef(0);
  const uniforms = useMemo<SettlementMaterialUniforms>(() => ({
    esSettlementRain: { value: 0 }, esSettlementNight: { value: 0 },
  }), []);

  useEffect(() => {
    let cancelled = false;
    loadSettlementBundle(baseUrl).then((data) => {
      if (!cancelled) setBundle(data);
    }).catch((error) => console.error("SettlementLayer", error));
    return () => { cancelled = true; };
  }, [baseUrl]);

  // Stream kit GLBs by the references in visual range. The complete exemplar
  // shelf is hundreds of MB; loading it province-wide would undo instancing's
  // benefit before the first frame. A route kit or culture shelf arrives only
  // when its placed references can actually be drawn.
  useEffect(() => {
    if (!bundle) return;
    const focus = focusRef.current;
    const drawScale = quality?.architectureDrawScale ?? 1;
    const wanted = new Set(bundle.placements.filter((p) => {
      const cap = p.kind === "dressing" ? 350 : p.kind === "route-structure" ? 2500 : MAX_RENDER_DISTANCE_M;
      return Math.hypot(p.positionM[0] - focus.x, p.positionM[2] - focus.z) <= cap * drawScale;
    }).map((p) => p.kit));
    const loader = new GLTFLoader();
    for (const id of wanted) {
      if (gltfs.has(id) || pendingKits.current.has(id)) continue;
      const kit = bundle.kits[id];
      if (!kit) continue;
      pendingKits.current.add(id);
      loader.loadAsync(`${baseUrl}${kit.glb}`).then((gltf) => {
        setGltfs((current) => new Map(current).set(id, gltf));
      }).catch((error) => console.error(`SettlementLayer kit ${id}`, error))
        .finally(() => pendingKits.current.delete(id));
    }
  }, [bundle, revision, baseUrl, focusRef, quality?.architectureDrawScale, gltfs]);

  const kits = useMemo(() => {
    return new Map([...gltfs].map(([id, gltf]) => [id, buildArchitectureKit(gltf)]));
  }, [gltfs]);

  useFrame(() => {
    const env = environment?.();
    if (env) updateSettlementEnvironment(uniforms, env.rainIntensity, env.minuteOfDay);
    const at = builtAt.current; const focus = focusRef.current;
    if (at && Math.hypot(focus.x - at.x, focus.z - at.z) > REBUILD_MOVE_M) {
      builtAt.current = null; setRevision((v) => v + 1);
    }
    if (incomplete.current && performance.now() - retryAt.current > 2000) {
      retryAt.current = performance.now();
      setRevision((v) => v + 1);
    }
  });

  useEffect(() => {
    const group = root.current;
    if (!group || !bundle) return;
    group.clear();
    const focus = focusRef.current;
    builtAt.current = { ...focus };
    const buckets = new Map<string, DrawBucket>();
    const solids: SettlementSolid[] = [];
    let placementCount = 0;
    incomplete.current = false;
    for (const placement of bundle.placements) {
      const distance = Math.hypot(placement.positionM[0] - focus.x, placement.positionM[2] - focus.z);
      const cap = placement.kind === "dressing" ? 350
        : placement.kind === "route-structure" ? 2500 : MAX_RENDER_DISTANCE_M;
      if (distance > cap * (quality?.architectureDrawScale ?? 1)) continue;
      const asset = kits.get(placement.kit)?.get(placement.assetId);
      if (!asset) continue;
      const triangles = asset.levels.map((parts) => parts.reduce((n, p) => n + p.triangles, 0));
      validateLodTriangles(triangles, bundle.lod);
      const choice = architectureLod(distance, footprintDiagonalM(placement), asset.levels.length,
        bundle.lod, quality?.architectureDrawScale ?? 1);
      const anchored = anchorPlacement(placement, groundAt);
      if (!anchored.complete) { incomplete.current = true; continue; }
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(placement.positionM[0], anchored.y, placement.positionM[2]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(placement.yawDeg)),
        new THREE.Vector3(placement.scale, placement.scale, placement.scale),
      );
      asset.levels[choice.level].forEach((part, partIndex) => {
        const key = `${placement.kit}|${placement.assetId}|${choice.level}|${partIndex}`;
        const bucket = buckets.get(key) ?? { part, transforms: [], far: 0 };
        bucket.transforms.push(transform.clone().multiply(part.localMatrix));
        if (choice.farMerged) bucket.far += 1;
        buckets.set(key, bucket);
      });
      const solid = solidFrom(placement, anchored.y, asset.levels[0]);
      if (solid && distance < 180) solids.push(solid);
      placementCount += 1;
    }

    let triangles = 0; let far = 0;
    for (const bucket of buckets.values()) {
      const material = bucket.part.material;
      const windowMaterial = /window|glow/i.test(material.name);
      applySettlementSurface(material, uniforms, windowMaterial);
      materialPatch?.(material);
      const mesh = new THREE.InstancedMesh(bucket.part.geometry, material, bucket.transforms.length);
      bucket.transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.esSettlementLodAuthority = true;
      group.add(mesh);
      triangles += bucket.part.triangles * bucket.transforms.length;
      far += bucket.far;
    }
    // Fine wall-foot skirt/contact AO: near-only, never part of far LOD.
    for (const treatment of bundle.groundTreatments) {
      const cx = treatment.footprintM.reduce((n, p) => n + p[0], 0) / treatment.footprintM.length;
      const cz = treatment.footprintM.reduce((n, p) => n + p[1], 0) / treatment.footprintM.length;
      if (Math.hypot(cx - focus.x, cz - focus.z) > 300) continue;
      const skirt = treatmentMesh(treatment.footprintM, treatment.baseSkirtWidthM, groundAt);
      if (skirt) group.add(skirt);
    }
    onSolids?.(solids);
    onStats?.({ placements: placementCount, draws: buckets.size, triangles,
      colliderParts: solids.reduce((n, s) => n + s.parts.length, 0), farMergedInstances: far });
    return () => {
      for (const child of [...group.children]) {
        group.remove(child);
        if (child instanceof THREE.InstancedMesh) child.dispose();
        else if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    };
  }, [bundle, kits, revision, groundAt, quality?.architectureDrawScale,
      focusRef, materialPatch, onSolids, onStats, uniforms]);

  return <group ref={root} name="settlement-layer" />;
}
