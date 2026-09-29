/**
 * Draws a place's painted ways (`groundPaint.ts`, 16k walk 4): one mesh per
 * road paint material, built once the ground under every strip is decoded,
 * with the ground material's own albedo and normal textures
 * (`textures/ground/<set>/materials.json`, the files the terrain's road paint
 * samples; never a new texture). Mounted by `SettlementLayer`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TerrainHeight } from "./types";
import { groundPaintOfBundle, paintStrip, type GroundPaintDoc, type GroundPaintEntry } from "./groundPaint";

interface GroundMaterialRow { readonly name: string; readonly file: string; readonly normalFile?: string; readonly tileM: number }

/** Retry cadence while the ground under a strip is not decoded yet, seconds. */
const RETRY_S = 1;

async function groundMaterials(baseUrl: string): Promise<{ set: string; rows: GroundMaterialRow[] }> {
  const index = await (await fetch(`${baseUrl}textures/ground/index.json`)).json() as { default: string };
  const set = new URLSearchParams(globalThis.location?.search ?? "").get("mats") ?? index.default;
  const doc = await (await fetch(`${baseUrl}textures/ground/${set}/materials.json`)).json() as
    { materials: GroundMaterialRow[] };
  return { set, rows: doc.materials };
}

function paintMaterial(baseUrl: string, set: string, row: GroundMaterialRow): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(`${baseUrl}textures/ground/${set}/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: load(row.file, true),
    ...(row.normalFile ? { normalMap: load(row.normalFile, false) } : {}),
    roughness: 1, metalness: 0, vertexColors: true, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
}

/** One geometry per texture: every strip of that material, UVs in world metres / tileM. */
export function paintGeometry(entries: readonly GroundPaintEntry[], groundAt: TerrainHeight, tileM: number):
  THREE.BufferGeometry | null {
  const strips = [];
  for (const e of entries) {
    const s = paintStrip(e, groundAt);
    if (!s) return null;
    strips.push(s);
  }
  const n = strips.reduce((a, s) => a + s.vertexCount, 0);
  const positions = new Float32Array(n * 3); const colors = new Float32Array(n * 4);
  const uvs = new Float32Array(n * 2); const indices: number[] = [];
  let base = 0;
  for (const s of strips) {
    positions.set(s.positions, base * 3); colors.set(s.colors, base * 4);
    for (let v = 0; v < s.vertexCount; v++) {
      uvs[(base + v) * 2] = s.positions[v * 3] / tileM;
      uvs[(base + v) * 2 + 1] = s.positions[v * 3 + 2] / tileM;
    }
    for (const i of s.indices) indices.push(i + base);
    base += s.vertexCount;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function GroundPaintLayer({ baseUrl, settlements, groundAt }: {
  baseUrl: string;
  settlements: readonly { readonly id: string; readonly groundPaint?: GroundPaintDoc }[] | undefined;
  groundAt: TerrainHeight;
}) {
  const group = useMemo(() => new THREE.Group(), []);
  const [materials, setMaterials] = useState<{ set: string; rows: GroundMaterialRow[] } | null>(null);
  const pending = useRef<Map<string, GroundPaintEntry[]> | null>(null);
  const nextTry = useRef(0);
  useEffect(() => {
    let live = true;
    groundMaterials(baseUrl).then((m) => { if (live) setMaterials(m); })
      .catch((error: unknown) => console.warn("[ground-paint] no ground materials", error));
    return () => { live = false; };
  }, [baseUrl]);
  useEffect(() => {
    const byTexture = new Map<string, GroundPaintEntry[]>();
    try {
      for (const e of groundPaintOfBundle(settlements ?? [])) {
        const list = byTexture.get(e.texture);
        if (list) list.push(e); else byTexture.set(e.texture, [e]);
      }
    } catch (error: unknown) {
      console.warn("[ground-paint] refused", error);
    }
    pending.current = byTexture;
    nextTry.current = 0;
  }, [settlements, groundAt]);
  useFrame(({ clock }) => {
    const want = pending.current;
    if (!want || !materials || clock.elapsedTime < nextTry.current) return;
    const start = performance.now();
    const meshes: THREE.Mesh[] = [];
    for (const [texture, entries] of want) {
      const row = materials.rows.find((r) => r.name === texture);
      if (!row) { console.warn(`[ground-paint] no ground material ${texture}`); continue; }
      const geometry = paintGeometry(entries, groundAt, row.tileM);
      if (!geometry) {
        meshes.forEach((m) => m.geometry.dispose());
        nextTry.current = clock.elapsedTime + RETRY_S;
        return;
      }
      const mesh = new THREE.Mesh(geometry, paintMaterial(baseUrl, materials.set, row));
      mesh.name = `ground-paint:${texture}`;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      meshes.push(mesh);
    }
    disposeGroup(group);
    meshes.forEach((m) => group.add(m));
    pending.current = null;
    console.info(`[ground-paint] ${meshes.length} mesh(es) in ${(performance.now() - start).toFixed(1)} ms`);
  });
  useEffect(() => () => disposeGroup(group), [group]);
  return <primitive object={group} />;
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
    const m = mesh.material as THREE.MeshStandardMaterial;
    m.map?.dispose(); m.normalMap?.dispose(); m.dispose();
    group.remove(mesh);
  }
}
