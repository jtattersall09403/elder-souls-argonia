/**
 * Draws the places' painted ways (`groundPaint.ts`, 16k walk 4; one surface
 * per place since walk 6): one mesh per place, built once the ground under it
 * is decoded, blending the ground materials' own albedos: the layers of the
 * set's albedo array the terrain samples (`terrain/groundArray`, rows from
 * `textures/ground/<set>/materials.json`; never a new texture). Mounted by
 * `SettlementLayer`.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useGroundArray } from "../terrain/groundArray";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GroundArea, GroundArrivals, TerrainHeight } from "./types";
import { PAINT_LIFT_M, groundPaintOfBundle, paintTextures, type GroundPaintDoc, type GroundPaintEntry } from "./groundPaint";
import { paintGeometry, paintMaterial, type GroundMaterialRow } from "./groundPaintMaterial";
import { fetchJsonWithRetry } from "./fetchRetry";

async function groundMaterials(baseUrl: string): Promise<{ set: string; rows: GroundMaterialRow[] }> {
  const index = await fetchJsonWithRetry(`${baseUrl}textures/ground/index.json`) as { default: string };
  const set = new URLSearchParams(globalThis.location?.search ?? "").get("mats") ?? index.default;
  const doc = await fetchJsonWithRetry(`${baseUrl}textures/ground/${set}/materials.json`) as
    { materials: GroundMaterialRow[] };
  return { set, rows: doc.materials };
}

/** One mesh's worth of paint: a single place's whole paint surface. */
export interface PaintGroup {
  readonly key: string;
  readonly placeId: string;
  /** The place's textures, sorted: the weight channel order. */
  readonly textures: readonly string[];
  readonly entries: readonly GroundPaintEntry[];
}

/**
 * One group per place (one surface, never one per texture: two surfaces
 * overlapping at a junction blink under the depth test). Places sit
 * kilometres apart and their ground decodes at different times, so one
 * place's undecoded terrain must never hold back another place's paint,
 * and one place's refused paint never drops another's.
 */
export function paintGroups(
  settlements: readonly { readonly id: string; readonly groundPaint?: GroundPaintDoc }[],
): Map<string, PaintGroup> {
  const out = new Map<string, PaintGroup>();
  for (const s of settlements) {
    let entries: GroundPaintEntry[];
    try {
      entries = groundPaintOfBundle([s]);
    } catch (error: unknown) {
      // one refused place drops only its own paint (review walk 6)
      console.warn("[ground-paint] refused", error);
      continue;
    }
    if (!entries.length) continue;
    const textures = paintTextures(entries);
    out.set(s.id, { key: s.id, placeId: s.id, textures, entries });
  }
  return out;
}

/**
 * Builds every group whose ground is decoded; the rest stay waiting until a
 * ground arrival touches them. A group with a texture that has no ground material is dropped
 * (`missing`), never retried.
 */
export function buildPaintGroups(
  groups: Iterable<PaintGroup>, groundAt: TerrainHeight, hasMaterial: (texture: string) => boolean,
): { built: { group: PaintGroup; geometry: THREE.BufferGeometry }[]; waiting: PaintGroup[]; missing: PaintGroup[] } {
  const built: { group: PaintGroup; geometry: THREE.BufferGeometry }[] = [];
  const waiting: PaintGroup[] = []; const missing: PaintGroup[] = [];
  for (const group of groups) {
    if (!group.textures.every(hasMaterial)) { missing.push(group); continue; }
    const out = paintGeometry(group.entries, groundAt);
    if (out) built.push({ group, geometry: out.geometry }); else waiting.push(group);
  }
  return { built, waiting, missing };
}

/** A place's paint extent, world metres `[minX, minZ, maxX, maxZ]`. */
export function paintBounds(group: PaintGroup): GroundArea {
  let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
  for (const e of group.entries) {
    for (const [x, z] of e.polygonM) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  return [minX, minZ, maxX, maxZ];
}

/** Whether two areas overlap (edges touching count: a chunk's edge row is shared). */
export function areasTouch(a: GroundArea, b: GroundArea): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/** Most vertices `groundMoved` samples per surface. */
const MOVED_SAMPLES = 32;

/**
 * Whether the ground under a built surface now stands elsewhere (a finer
 * terrain level arrived under it, or the ground is gone): a sparse sample of
 * its vertices against `groundAt`. Cheap enough to run on every arrival
 * that touches the place; only a moved surface is rebuilt.
 */
export function groundMoved(geometry: THREE.BufferGeometry, groundAt: TerrainHeight, toleranceM = 0.05): boolean {
  const p = geometry.getAttribute("position");
  if (!p || p.count === 0) return false;
  const step = Math.max(1, Math.floor(p.count / MOVED_SAMPLES));
  for (let i = 0; i < p.count; i += step) {
    const y = groundAt(p.getX(i), p.getZ(i));
    if (y === null) return false;   // ground unloaded: keep the surface drawn
    if (Math.abs(y + PAINT_LIFT_M - p.getY(i)) > toleranceM) return true;
  }
  return false;
}

/** Whether `groundAt` answers at an area's four corners and middle. */
export function groundReady(b: GroundArea, groundAt: TerrainHeight): boolean {
  const mx = (b[0] + b[2]) / 2; const mz = (b[1] + b[3]) / 2;
  return [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], [mx, mz]]
    .every(([x, z]) => groundAt(x, z) !== null);
}

/**
 * Builds each place's paint when its ground is there: once when the bundle
 * changes, then again only for the places a ground arrival touches (a place
 * still waiting, or one whose ground moved under it). A place whose ground
 * has not arrived is simply not drawn yet: out of range is the normal state,
 * never a warning, and nothing polls.
 */
export function GroundPaintLayer({ baseUrl, settlements, groundAt, groundArrivals }: {
  baseUrl: string;
  settlements: readonly { readonly id: string; readonly groundPaint?: GroundPaintDoc }[] | undefined;
  groundAt: TerrainHeight;
  groundArrivals?: GroundArrivals;
}) {
  const group = useMemo(() => new THREE.Group(), []);
  const [materials, setMaterials] = useState<{ set: string; rows: GroundMaterialRow[] } | null>(null);
  const [array, setArray] = useState<THREE.Texture | null>(null);
  /** Every place's paint of the current bundle, and its extent. */
  const groups = useRef(new Map<string, { group: PaintGroup; bounds: GroundArea }>());
  /** The places to (re)build on the next frame. */
  const dirty = useRef(new Set<string>());
  /** Places whose ground was missing at their last build. */
  const waiting = useRef(new Set<string>());
  useEffect(() => {
    let live = true;
    groundMaterials(baseUrl).then((m) => { if (live) setMaterials(m); })
      .catch((error: unknown) => console.warn("[ground-paint] no ground materials", error));
    return () => { live = false; };
  }, [baseUrl]);
  useEffect(() => {
    const next = paintGroups(settlements ?? []);
    // The live meshes stay drawn until their replacements are added
    // (review 2026-09-30: a requery blanked all road paint for a frame).
    retainPaint(group, new Set(next.keys()));
    groups.current = new Map([...next].map(([k, g]) => [k, { group: g, bounds: paintBounds(g) }]));
    dirty.current = new Set(next.keys());
    waiting.current = new Set();
  }, [settlements, groundAt, group]);
  useEffect(() => groundArrivals?.((area) => {
    for (const [key, { bounds }] of groups.current) {
      if (!areasTouch(area, bounds)) continue;
      if (waiting.current.has(key)) { dirty.current.add(key); continue; }
      const mesh = group.children.find((c) => c.userData.paintKey === key) as THREE.Mesh | undefined;
      if (mesh && groundMoved(mesh.geometry, groundAt)) dirty.current.add(key);
    }
  }), [groundArrivals, groundAt, group]);
  useFrame(() => {
    if (!materials || !array || dirty.current.size === 0) return;
    // a place whose corners or middle have no ground yet waits without paying
    // for a surface build (arrivals of coarse levels touch it many times)
    const want: PaintGroup[] = [];
    for (const k of dirty.current) {
      const g = groups.current.get(k);
      if (!g) continue;
      if (groundReady(g.bounds, groundAt)) want.push(g.group); else waiting.current.add(k);
    }
    dirty.current.clear();
    const start = performance.now();
    const { built, waiting: unbuilt, missing } = buildPaintGroups(
      want, groundAt, (t) => materials.rows.some((r) => r.name === t));
    for (const g of missing) {
      console.warn(`[ground-paint] no ground material for ${g.textures.join(", ")} (${g.placeId})`);
      replacePaint(group, g.key, null);
    }
    for (const g of unbuilt) waiting.current.add(g.key);
    for (const { group: g, geometry } of built) {
      waiting.current.delete(g.key);
      const rows = g.textures.map((t) => materials.rows.find((r) => r.name === t)!);
      const matKey = `${materials.set}|${g.textures.join(",")}`;
      // The replaced mesh's material is reused (its program is compiled).
      const live = group.children.find((c) => c.userData.paintKey === g.key && c.userData.paintMat === matKey);
      const material = (live as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined
        ?? paintMaterial(array, rows);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.paintMat = matKey;
      mesh.name = `ground-paint:${g.placeId}`;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      replacePaint(group, g.key, mesh);
    }
    if (built.length) {
      console.info(`[ground-paint] ${built.length} mesh(es) in ${(performance.now() - start).toFixed(1)} ms`);
    }
  });
  useEffect(() => () => disposeGroup(group), [group]);
  return (
    <>
      <primitive object={group} />
      {materials && (
        <Suspense fallback={null}>
          <GroundArrayFeed baseUrl={baseUrl} set={materials.set} onArray={setArray} />
        </Suspense>
      )}
    </>
  );
}

/** Hands the set's albedo array (the terrain's, from the loader cache) to the
 * layer; its own Suspense keeps the suspension off the settlement layer. */
function GroundArrayFeed({ baseUrl, set, onArray }: { baseUrl: string; set: string; onArray: (t: THREE.Texture) => void }) {
  const array = useGroundArray(baseUrl, set);
  useEffect(() => { onArray(array); }, [array, onArray]);
  return null;
}

/**
 * A new paint set arrived: every live mesh whose key the set drops goes now;
 * the newest mesh of every kept key stays drawn until `replacePaint` swaps its
 * replacement in, so paint never blanks between two builds.
 */
export function retainPaint(group: THREE.Group, keys: ReadonlySet<string>): void {
  const kept = new Set<string>();
  for (const child of [...group.children].reverse()) {
    const key = child.userData.paintKey as string | undefined;
    if (key !== undefined && keys.has(key) && !kept.has(key)) { kept.add(key); continue; }
    disposeMesh(group, child as THREE.Mesh);
  }
}

/** Add `mesh` as the paint of `key` (or none, for `null`), then free the one it replaces. */
export function replacePaint(group: THREE.Group, key: string, mesh: THREE.Mesh | null): void {
  const old = group.children.filter((child) => child.userData.paintKey === key);
  if (mesh) { mesh.userData.paintKey = key; group.add(mesh); }
  for (const child of old) disposeMesh(group, child as THREE.Mesh, mesh?.material);
}

/** Free a paint mesh; its material too unless the replacement kept it. */
function disposeMesh(group: THREE.Group, mesh: THREE.Mesh, keep?: THREE.Material | THREE.Material[]): void {
  mesh.geometry.dispose();
  const m = mesh.material as THREE.MeshStandardMaterial;
  // the albedo array is the terrain's (loader cache): only the material goes
  if (m !== keep) m.dispose();
  group.remove(mesh);
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) disposeMesh(group, child as THREE.Mesh);
}
