/**
 * Draws the places' painted ways (`groundPaint.ts`, 16k walk 4; one surface
 * per place since walk 6): one mesh per place, built once the ground under it
 * is decoded, blending the ground materials' own albedo textures
 * (`textures/ground/<set>/materials.json`, the files the terrain's road paint
 * samples; never a new texture). Mounted by `SettlementLayer`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { attribute, cameraPosition, float, max, positionWorld, smoothstep, texture, uv, vec4 } from "three/tsl";
import type { TerrainHeight } from "./types";
import type { TslNode } from "../render/nodes/materialNodes";
import {
  PAINT_MAX_TEXTURES, groundPaintOfBundle, paintSurface, type GroundPaintDoc, type GroundPaintEntry,
} from "./groundPaint";

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

/** Where the paint fades out, metres from the camera: over the same band
 * the place kit ladder's far ring (`settlementLadder`: 180 m minimum), so the
 * paint is gone by the ring where buildings drop detail, and never pops. */
export const PAINT_FADE_M: readonly [number, number] = [120, 180];

/**
 * One material per place: the place's textures (at most `PAINT_MAX_TEXTURES`)
 * blended by the per-vertex `paintWeight` channels, alpha = the largest weight,
 * faded out over `PAINT_FADE_M`. UVs are world metres; each texture tiles at
 * its own `tileM`.
 */
function paintMaterial(baseUrl: string, set: string, rows: readonly GroundMaterialRow[]): MeshStandardNodeMaterial {
  const loader = new THREE.TextureLoader();
  const maps = rows.map((row) => {
    const t = loader.load(`${baseUrl}textures/ground/${set}/${row.file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const tileOf = (c: number) => rows[Math.min(c, rows.length - 1)].tileM;
  const tile = new THREE.Vector3(tileOf(0), tileOf(1), tileOf(2));
  const material = new MeshStandardNodeMaterial({
    map: maps[0], roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  material.userData.paintMaps = maps;
  const extra = [maps[Math.min(1, maps.length - 1)], maps[Math.min(2, maps.length - 1)]];
  // Blend by the weight channels (UVs in world metres, each texture at its
  // own tileM); alpha = the largest weight, faded out over PAINT_FADE_M.
  const w = attribute("paintWeight", "vec3") as unknown as TslNode;
  const at = uv();
  const c = texture(maps[0], at.div(tile.x)).rgb.mul(w.x)
    .add(texture(extra[0], at.div(tile.y)).rgb.mul(w.y))
    .add(texture(extra[1], at.div(tile.z)).rgb.mul(w.z))
    .div(max(w.x.add(w.y).add(w.z), 1e-4));
  const fade = float(1).sub(smoothstep(PAINT_FADE_M[0], PAINT_FADE_M[1], positionWorld.distance(cameraPosition)));
  material.colorNode = vec4(c, max(w.x, max(w.y, w.z)).mul(fade));
  return material;
}

/** One place's surface as a geometry: UVs in world metres, `paintWeight` per vertex. */
export function paintGeometry(entries: readonly GroundPaintEntry[], groundAt: TerrainHeight):
  { geometry: THREE.BufferGeometry; textures: readonly string[] } | null {
  const s = paintSurface(entries, groundAt);
  if (!s || s.vertexCount === 0) return null; // an empty draw is a WebGPU validation error
  const uvs = new Float32Array(s.vertexCount * 2);
  for (let v = 0; v < s.vertexCount; v++) {
    uvs[v * 2] = s.positions[v * 3];
    uvs[v * 2 + 1] = s.positions[v * 3 + 2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(s.positions, 3));
  g.setAttribute("paintWeight", new THREE.BufferAttribute(s.weights, PAINT_MAX_TEXTURES));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(s.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geometry: g, textures: s.textures };
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
    const textures = [...new Set(entries.map((e) => e.texture))].sort();
    out.set(s.id, { key: s.id, placeId: s.id, textures, entries });
  }
  return out;
}

/**
 * Builds every group whose ground is decoded; the rest stay waiting and are
 * retried. A group with a texture that has no ground material is dropped
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
    const groups = paintGroups(settlements ?? []);
    // The live meshes stay drawn until their replacements are added
    // (review 2026-09-30: a requery blanked all road paint for a frame, and
    // for RETRY_S wherever a place's ground was still undecoded).
    retainPaint(group, new Set(groups.keys()));
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
      want.values(), groundAt, (t) => materials.rows.some((r) => r.name === t));
    for (const g of missing) {
      console.warn(`[ground-paint] no ground material for ${g.textures.join(", ")} (${g.placeId})`);
      replacePaint(group, g.key, null);
      want.delete(g.key);
    }
    for (const { group: g, geometry } of built) {
      const rows = g.textures.map((t) => materials.rows.find((r) => r.name === t)!);
      const matKey = `${materials.set}|${g.textures.join(",")}`;
      // The replaced mesh's material (textures loaded) is reused: a fresh one
      // would draw unloaded textures for the frames its images take.
      const live = group.children.find((c) => c.userData.paintKey === g.key && c.userData.paintMat === matKey);
      const material = (live as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined
        ?? paintMaterial(baseUrl, materials.set, rows);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.paintMat = matKey;
      mesh.name = `ground-paint:${g.placeId}`;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      replacePaint(group, g.key, mesh);
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
  if (m !== keep) {
    for (const t of (m.userData.paintMaps as THREE.Texture[] | undefined) ?? [m.map]) t?.dispose();
    m.dispose();
  }
  group.remove(mesh);
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) disposeMesh(group, child as THREE.Mesh);
}
