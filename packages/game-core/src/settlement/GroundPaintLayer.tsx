/**
 * Draws the places' painted ways (`groundPaint.ts`, 16k walk 4): one mesh per
 * (place, road paint material), each built once the ground under its strips is decoded,
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

/** One geometry per (place, texture) group: every strip of it, UVs in world metres / tileM. */
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

/** One mesh's worth of paint: a single place's strips of a single texture. */
export interface PaintGroup {
  readonly key: string;
  readonly placeId: string;
  readonly texture: string;
  readonly entries: readonly GroundPaintEntry[];
}

/**
 * Groups the bundle's paint by (place, texture). Places sit kilometres apart and
 * their ground decodes at different times, so one place's undecoded terrain must
 * never hold back another place's paint (the walk-5 silent no-draw).
 */
export function paintGroups(
  settlements: readonly { readonly id: string; readonly groundPaint?: GroundPaintDoc }[],
): Map<string, PaintGroup> {
  const out = new Map<string, PaintGroup>();
  for (const s of settlements) {
    const byTexture = new Map<string, GroundPaintEntry[]>();
    for (const e of groundPaintOfBundle([s])) {
      const list = byTexture.get(e.texture);
      if (list) list.push(e); else byTexture.set(e.texture, [e]);
    }
    for (const [texture, entries] of byTexture) {
      const key = `${s.id}|${texture}`;
      out.set(key, { key, placeId: s.id, texture, entries });
    }
  }
  return out;
}

/**
 * Builds every group whose ground is decoded; the rest stay waiting and are
 * retried. A group with no ground material is dropped (`missing`), never retried.
 */
export function buildPaintGroups(
  groups: Iterable<PaintGroup>, groundAt: TerrainHeight, tileMOf: (texture: string) => number | undefined,
): { built: { group: PaintGroup; geometry: THREE.BufferGeometry }[]; waiting: PaintGroup[]; missing: PaintGroup[] } {
  const built: { group: PaintGroup; geometry: THREE.BufferGeometry }[] = [];
  const waiting: PaintGroup[] = []; const missing: PaintGroup[] = [];
  for (const group of groups) {
    const tileM = tileMOf(group.texture);
    if (tileM === undefined) { missing.push(group); continue; }
    const geometry = paintGeometry(group.entries, groundAt, tileM);
    if (geometry) built.push({ group, geometry }); else waiting.push(group);
  }
  return { built, waiting, missing };
}

/** A group still undecoded after this long is reported (once per WARN_EVERY_S). */
const WARN_AFTER_S = 5;
const WARN_EVERY_S = 30;

export function GroundPaintLayer({ baseUrl, settlements, groundAt }: {
  baseUrl: string;
  settlements: readonly { readonly id: string; readonly groundPaint?: GroundPaintDoc }[] | undefined;
  groundAt: TerrainHeight;
}) {
  const group = useMemo(() => new THREE.Group(), []);
  const [materials, setMaterials] = useState<{ set: string; rows: GroundMaterialRow[] } | null>(null);
  const pending = useRef<Map<string, PaintGroup> | null>(null);
  const nextTry = useRef(0);
  /** Clock time the current pending set was first tried, and when it last warned. */
  const since = useRef<number | null>(null);
  const lastWarn = useRef(-Infinity);
  useEffect(() => {
    let live = true;
    groundMaterials(baseUrl).then((m) => { if (live) setMaterials(m); })
      .catch((error: unknown) => console.warn("[ground-paint] no ground materials", error));
    return () => { live = false; };
  }, [baseUrl]);
  useEffect(() => {
    let groups = new Map<string, PaintGroup>();
    try {
      groups = paintGroups(settlements ?? []);
    } catch (error: unknown) {
      console.warn("[ground-paint] refused", error);
    }
    disposeGroup(group);
    pending.current = groups;
    nextTry.current = 0;
    since.current = null;
    lastWarn.current = -Infinity;
  }, [settlements, groundAt, group]);
  useFrame(({ clock }) => {
    const want = pending.current;
    if (!want || !materials || clock.elapsedTime < nextTry.current) return;
    const now = clock.elapsedTime;
    since.current ??= now;
    const start = performance.now();
    const { built, waiting, missing } = buildPaintGroups(
      want.values(), groundAt, (t) => materials.rows.find((r) => r.name === t)?.tileM);
    for (const g of missing) {
      console.warn(`[ground-paint] no ground material ${g.texture} (${g.placeId})`);
      want.delete(g.key);
    }
    for (const { group: g, geometry } of built) {
      const row = materials.rows.find((r) => r.name === g.texture)!;
      const mesh = new THREE.Mesh(geometry, paintMaterial(baseUrl, materials.set, row));
      mesh.name = `ground-paint:${g.placeId}:${g.texture}`;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      group.add(mesh);
      want.delete(g.key);
    }
    if (built.length) {
      console.info(`[ground-paint] ${built.length} mesh(es) in ${(performance.now() - start).toFixed(1)} ms`);
    }
    if (waiting.length === 0) { pending.current = null; return; }
    nextTry.current = now + RETRY_S;
    if (now - since.current > WARN_AFTER_S && now - lastWarn.current >= WARN_EVERY_S) {
      lastWarn.current = now;
      console.warn(`[ground-paint] ground still undecoded after ${(now - since.current).toFixed(0)} s for `
        + waiting.map((g) => g.key).join(", "));
    }
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
