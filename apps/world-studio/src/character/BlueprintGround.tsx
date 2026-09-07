import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  groundFitFill, kitFill, WAY_STYLE, type Blueprint, type Poly,
} from "../blueprints/blueprintsData";

/**
 * TEMPORARY (Round B removes this): the settlement blueprint painted on the
 * ground in walk mode, so the owner can stand inside a plan that has no
 * buildings yet. Studio-only debug geometry — district and parcel outlines,
 * ways as ribbons of their real width, landmark/dock pins and door ticks —
 * conformed to the loaded chunk heightfield. Nothing here is game content and
 * nothing touches the terrain material; when Round B places real buildings
 * this whole file goes.
 *
 * Toggle: the "bp ground" checkbox in walk mode, or `?bpground=1`.
 */

/** Metres between conform samples along an edge. */
const STEP_M = 2;
/** Lift above the terrain so lines are not z-fighting the ground. Lines take
 * no polygon offset, so this is the whole margin against the rendered mesh;
 * it is sized for the finest chunk LOD (the only one `groundAt` reads). */
const LIFT_M = 0.35;
/** Only blueprints whose boundary comes within this of the player are drawn.
 * Held inside the finest-LOD residency ring (owner 2026-09-07: outlines were
 * "floating" and "moving" — vertices beyond the ring had no fine height and
 * were drawn at sea level, then jumped as chunks streamed). A vertex with no
 * height is now skipped, never drawn at zero. */
export const NEAR_M = 450;
/** Rebuild while ground is still missing, at most this many times (2 s apart). */
const MAX_REBUILDS = 60;
/** Parcel id labels appear inside this radius… */
const LABEL_M = 40;
/** …but not right under the camera: a billboard the player is standing on
 * fills the screen with blended pixels. */
const LABEL_MIN_M = 3;
/** …and only the nearest few: alpha-blended billboards are pure fill cost,
 * and forty of them at once was the whole cost of this layer (probe, 2026-09-05). */
const MAX_LABELS = 8;

type XZ = [number, number];

/** Closest distance from a point to a polygon's vertices/edges (approximate:
 * vertices only, which is enough for a 600 m proximity test). */
export function nearestVertexDistance(poly: Poly | null, x: number, z: number): number {
  if (!poly || !poly.length) return Infinity;
  let best = Infinity;
  for (const [px, pz] of poly) best = Math.min(best, Math.hypot(px - x, pz - z));
  return best;
}

/** Blueprints within `NEAR_M` of the player, by id (sorted, deterministic). */
export function blueprintsNear(blueprints: Blueprint[], x: number, z: number, radiusM = NEAR_M): string[] {
  return blueprints
    .filter((bp) => nearestVertexDistance(bp.boundary, x, z) <= radiusM)
    .map((bp) => bp.id)
    .sort();
}

/** Resample a polyline every ~STEP_M metres, keeping the original vertices. */
export function resample(points: Poly, stepM = STEP_M): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  if (points.length) out.push(points[points.length - 1] as XZ);
  return out;
}

type Ground = (x: number, z: number) => number | null;

function buildLines(
  bps: Blueprint[],
  ground: Ground,
): { geometry: THREE.BufferGeometry; missing: boolean } {
  const pos: number[] = [];
  const col: number[] = [];
  let missing = false;
  const c = new THREE.Color();
  const push = (x: number, y: number, z: number, hex: string) => {
    pos.push(x, y + LIFT_M, z);
    c.set(hex);
    col.push(c.r, c.g, c.b);
  };
  /** A segment is drawn only when BOTH ends have a decoded ground height;
   * a missing end marks the build incomplete so it is retried, not faked. */
  const strip = (points: Poly, hex: string, close: boolean) => {
    if (points.length < 2) return;
    const line = close ? [...points, points[0]] : points;
    const pts = resample(line);
    const ys = pts.map(([x, z]) => ground(x, z));
    for (let i = 0; i + 1 < pts.length; i++) {
      const y0 = ys[i];
      const y1 = ys[i + 1];
      if (y0 === null || y1 === null) { missing = true; continue; }
      push(pts[i][0], y0, pts[i][1], hex);
      push(pts[i + 1][0], y1, pts[i + 1][1], hex);
    }
  };
  /** A short vertical pin plus a ground cross — reads as a marker at eye level. */
  const pin = (x: number, z: number, hex: string, heightM: number) => {
    const y = ground(x, z);
    if (y === null) { missing = true; return; }
    const base = y + LIFT_M;
    c.set(hex);
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      pos.push(ax, ay, az, bx, by, bz);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    seg(x, base, z, x, base + heightM, z);
    seg(x - 1, base, z, x + 1, base, z);
    seg(x, base, z - 1, x, base, z + 1);
  };

  for (const bp of bps) {
    if (bp.boundary) strip(bp.boundary, "#ffffff", true);
    for (const d of bp.districts) if (d.polygon) strip(d.polygon, kitFill(d.cultureKit), true);
    for (const p of bp.parcels) if (p.polygon) strip(p.polygon, groundFitFill(p.groundFit), true);
    for (const l of bp.landmarks) if (l.positionM) pin(l.positionM[0], l.positionM[1], "#ffd166", 6);
    for (const d of bp.docks) if (d.positionM) pin(d.positionM[0], d.positionM[1], "#6fb7e0", 4);
    for (const d of bp.doors) {
      if (!d.thresholdM) continue;
      // Tick pointing out of the door, 1.5 m long: which way the threshold faces.
      const rad = ((d.facingDeg ?? 0) * Math.PI) / 180;
      const dx = Math.sin(rad) * 1.5;
      const dz = -Math.cos(rad) * 1.5;
      strip([d.thresholdM, [d.thresholdM[0] + dx, d.thresholdM[1] + dz]], "#ff7b6b", false);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return { geometry, missing };
}

function buildRibbons(bps: Blueprint[], ground: Ground): { geometry: THREE.BufferGeometry; missing: boolean } {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  let missing = false;
  for (const bp of bps) {
    for (const way of bp.ways) {
      const pts = resample(way.points);
      if (pts.length < 2) continue;
      const half = Math.max(0.3, (way.widthM ?? 1) / 2);
      c.set(WAY_STYLE[way.group]?.colour ?? "#cccccc");
      const ys = pts.map(([x, z]) => ground(x, z));
      // Only runs of consecutive decoded samples become quads; a gap where a
      // chunk has not decoded is left empty and the build is retried.
      let runStart = -1;
      const flush = (end: number) => {
        if (runStart < 0 || end - runStart < 2) { runStart = -1; return; }
        const first = pos.length / 3;
        for (let i = runStart; i < end; i++) {
          const prev = pts[Math.max(runStart, i - 1)];
          const next = pts[Math.min(end - 1, i + 1)];
          const tx = next[0] - prev[0];
          const tz = next[1] - prev[1];
          const len = Math.hypot(tx, tz) || 1;
          const nx = (-tz / len) * half;
          const nz = (tx / len) * half;
          const [x, z] = pts[i];
          const y = (ys[i] as number) + LIFT_M;
          pos.push(x + nx, y, z + nz, x - nx, y, z - nz);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
        for (let i = 0; i + 1 < end - runStart; i++) {
          const a = first + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        runStart = -1;
      };
      for (let i = 0; i < pts.length; i++) {
        if (ys[i] === null) { missing = true; flush(i); continue; }
        if (runStart < 0) runStart = i;
      }
      flush(pts.length);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  return { geometry, missing };
}

function labelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.font = "bold 34px system-ui, sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(text, 128, 44);
  g.fillStyle = "#f2efe6";
  g.fillText(text, 128, 44);
  return new THREE.CanvasTexture(canvas);
}

export function BlueprintGround({ blueprints, focusRef, groundAt }: {
  blueprints: Blueprint[];
  focusRef: { current: { x: number; z: number } };
  /** Runtime-space terrain height, or null where the chunk is not decoded yet. */
  groundAt: Ground;
}) {
  const [nearIds, setNearIds] = useState<string[]>([]);
  // Terrain streams in: a build made before the chunks decoded is retried.
  const [attempt, setAttempt] = useState(0);
  const incomplete = useRef(false);
  const lastCheck = useRef(0);
  const lastRebuild = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (now - lastCheck.current < 500) return;
    lastCheck.current = now;
    const { x, z } = focusRef.current;
    const ids = blueprintsNear(blueprints, x, z);
    setNearIds((prev) => (prev.join() === ids.join() ? prev : ids));
    // Bounded retry while ground is missing: a build is milliseconds, chunks
    // decode within seconds, and nothing is ever drawn at a guessed height.
    if (incomplete.current && now - lastRebuild.current >= 2000) {
      lastRebuild.current = now;
      setAttempt((a) => (a < MAX_REBUILDS ? a + 1 : a));
    }
  });

  useEffect(() => setAttempt(0), [nearIds]);

  const near = useMemo(
    () => blueprints.filter((bp) => nearIds.includes(bp.id)),
    [blueprints, nearIds],
  );

  const built = useMemo(() => {
    if (!near.length) return null;
    const t0 = performance.now();
    const { geometry, missing } = buildLines(near, groundAt);
    const { geometry: ribbons, missing: ribbonsMissing } = buildRibbons(near, groundAt);
    let labelsMissing = false;
    const labels = near.flatMap((bp) => bp.parcels
      .filter((p) => p.centreM)
      .flatMap((p) => {
        const y = groundAt(p.centreM![0], p.centreM![1]);
        if (y === null) { labelsMissing = true; return []; }
        return [{
          id: p.id,
          x: p.centreM![0],
          z: p.centreM![1],
          y: y + 2,
          tex: labelTexture(p.id.split(".").pop() ?? p.id),
        }];
      }));
    incomplete.current = missing || ribbonsMissing || labelsMissing;
    // Kept deliberately: this layer is temporary and its cost is the thing
    // the owner asked about (three draw calls plus the labels).
    console.info("[bpground] build", {
      buildMs: Number((performance.now() - t0).toFixed(1)),
      blueprints: near.length,
      lineVerts: geometry.getAttribute("position").count,
      ribbonVerts: ribbons.getAttribute("position").count,
      labels: labels.length,
      missingGround: missing || ribbonsMissing || labelsMissing,
    });
    return { geometry, ribbons, labels };
    // `attempt` re-runs the build while chunks are still decoding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, groundAt, attempt]);

  useEffect(() => () => {
    built?.geometry.dispose();
    built?.ribbons.dispose();
    built?.labels.forEach((l) => l.tex.dispose());
  }, [built]);

  // Parcel ids only inside LABEL_M — sprite text is cheap, a hundred of them
  // permanently on screen is not.
  const labelGroup = useRef<THREE.Group>(null);
  useFrame(() => {
    const group = labelGroup.current;
    if (!group) return;
    const { x, z } = focusRef.current;
    const near: { child: THREE.Object3D; d: number }[] = [];
    for (const child of group.children) {
      child.visible = false;
      const d = Math.hypot(child.position.x - x, child.position.z - z);
      if (d <= LABEL_M && d >= LABEL_MIN_M) near.push({ child, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const n of near.slice(0, MAX_LABELS)) n.child.visible = true;
  });

  if (!built) return null;
  return (
    <group>
      {/* Outlines and ribbons are both depth-tested (owner 2026-09-07:
          outlines drawn through hills that should hide them were confusing);
          the lines sit LIFT_M above the ground instead of a polygon offset,
          which GL does not apply to lines. Ribbons keep a polygon offset so
          they do not z-fight the ground. */}
      <lineSegments geometry={built.geometry} renderOrder={900}>
        <lineBasicMaterial vertexColors transparent opacity={0.95} depthWrite={false} />
      </lineSegments>
      <mesh geometry={built.ribbons} renderOrder={899}>
        <meshBasicMaterial vertexColors transparent opacity={0.35} depthWrite={false}
          polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} side={THREE.DoubleSide} />
      </mesh>
      <group ref={labelGroup}>
        {built.labels.map((l) => (
          <sprite key={l.id} position={[l.x, l.y, l.z]} scale={[6, 1.5, 1]} visible={false}>
            <spriteMaterial map={l.tex} transparent depthTest={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}
