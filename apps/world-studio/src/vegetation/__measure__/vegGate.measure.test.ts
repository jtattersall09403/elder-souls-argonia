/**
 * MEASUREMENT HARNESS, not a gate (walk-5 perf lane, 2026-09-29). Skipped
 * unless `VEG_MEASURE=1`; it reads the locally published vegetation bundles and
 * kit manifest, which CI does not have.
 *
 *   VEG_MEASURE=1 npx vitest run src/vegetation/__measure__ -w @elder-souls/world-studio
 *
 * It builds the real cells (`buildCell`) around a site from the real bundles,
 * with the real ladder functions (`floraKit.ts`), runs the real gate
 * (`gateSpecies`) for a character-mode camera at four headings, and counts:
 *   - submitted: copies (and triangles) the gate leaves in the draw prefixes;
 *   - in view: copies whose rung holds at the camera distance AND whose
 *     bounding sphere is inside the TRUE (unwidened) view frustum;
 *   - distinct plants: instances with at least one rung submitted.
 * Triangles per level are estimated from the manifest (`triangles` x the
 * builder's decimation ratios; a card is 2 triangles per view, ~4).
 * Numbers go to stdout as one JSON line per site.
 */
import { describe, it } from "vitest";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import {
  buildCell,
  type CellSpeciesParams,
  type CellSpeciesSource,
} from "@elder-souls/game-core/vegetation/cellBuild";
import {
  gateSpecies,
  GATE_TILE_COUNT,
  viewPlanesFor,
  type GateSpecies,
  type GateRung,
  type GateStats,
} from "@elder-souls/game-core/vegetation/cellGating";
import { lodFadeFactors, lodLadder, BAYER4_MAX } from "@elder-souls/game-core/fx/lodFade";
import { speciesRings, maxDrawDistance, treeDrawDistance } from "../floraKit";
import { decodeVegetationBundle, readInstance } from "../vegetationBundle";
import { QUALITY_PRESETS } from "@elder-souls/game-core/core/quality";

const PUBLIC = resolve(__dirname, "../../../public");
const RUN = process.env.VEG_MEASURE === "1" && existsSync(`${PUBLIC}/province/vegetation`);

interface ManifestAsset {
  id: string; category: string; sizeM: number[]; triangles: number;
  alphaTest: boolean; lodLevels: number; billboard?: boolean; lodRatios: number[];
}

const SITES = [
  { label: "jungle", x: 4020, z: 4610 },
  { label: "greenspring", x: 4747, z: 1859 },
];

describe.skipIf(!RUN)("vegetation gate measurement (VEG_MEASURE=1)", () => {
  it("submitted vs in-view copies per site", () => {
    const index = JSON.parse(readFileSync(`${PUBLIC}/province/vegetation/vegetation-index.json`, "utf8"));
    const assets: ManifestAsset[] = [
      ...JSON.parse(readFileSync(`${PUBLIC}/kits/flora-province-v1.kit.json`, "utf8")).assets,
    ];
    const qualityName = (process.env.VEG_Q ?? "medium") as "low" | "medium" | "high";
    const quality = QUALITY_PRESETS[qualityName];
    const size: number = index.chunkMetres;
    const params = new Map<string, CellSpeciesParams>();
    const trisPerLevel = new Map<string, number[]>();
    const categoryOf = new Map<string, string>();
    for (const a of assets) {
      const h = a.sizeM[2];
      // VEG_MID=1 models round 13: every tree over 3 000 triangles gains a
      // mid (0.30) and far (0.10) level.
      // The kit's real round-13 tiers (`lodTiers`); VEG_MID=1 instead models
      // every tree over 3 000 triangles with a 0.30 mid and 0.10 far.
      const tiers = (a as unknown as { lodTiers?: { mid?: { triangles: number }; far?: { triangles: number } } }).lodTiers;
      const r13 = process.env.VEG_MID === "1" && a.category === "tree" && a.triangles > 3000;
      const tierTris = tiers
        ? [tiers.mid?.triangles, tiers.far?.triangles].filter((t): t is number => typeof t === "number")
        : r13 ? [a.triangles * 0.3, a.triangles * 0.1] : [];
      const folded = a.alphaTest && tierTris.length === 0;
      const meshLevels = tierTris.length > 0 ? 1 + tierTris.length
        : folded ? 1 : Math.max(1, a.lodLevels - (a.billboard ? 1 : 0));
      const card = a.billboard ? meshLevels : null;
      const maxDraw = a.category === "tree"
        ? treeDrawDistance(quality.vegChunkRing, size)
        : maxDrawDistance(h) * quality.vegDrawScale;
      const rings = speciesRings({ heightM: h, meshLevels, category: a.category, submerged: false, folded },
        quality.vegDrawScale, quality.name);
      const ladder = lodLadder(rings, meshLevels, card, maxDraw);
      const tris = (tierTris.length > 0 ? [a.triangles, ...tierTris]
        : [a.triangles, a.triangles * (a.lodRatios[0] ?? 1), a.triangles * (a.lodRatios[1] ?? 1)])
        .slice(0, meshLevels);
      if (card !== null) tris.push(4);
      trisPerLevel.set(a.id, tris);
      categoryOf.set(a.id, a.category);
      params.set(a.id, {
        species: a.id, ladder, vanishes: a.category !== "tree", maxDraw,
        sways: false, trunkRadiusM: null, solid: false, cardLevel: card,
        reachM: Math.hypot(h, Math.max(a.sizeM[0], a.sizeM[1]) / 2), heightM: h,
        stiffness: () => 0,
      });
    }
    for (const site of SITES) {
      const cx = Math.floor(site.x / size);
      const cz = Math.floor(site.z / size);
      const list: GateSpecies[] = [];
      const meta = new Map<GateRung, { species: string; level: number; placements: Float32Array; count: number; band: [number, number, number, number]; tris: number }>();
      let groundY = NaN;
      const ring = quality.vegChunkRing;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          const key = `${cx + dx}_${cz + dz}`;
          const file = `${PUBLIC}/province/vegetation/chunk_${key}_vegetation.bin`;
          if (!existsSync(file)) continue;
          const buf = readFileSync(file);
          const bundle = decodeVegetationBundle(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
          const sources: CellSpeciesSource[] = [];
          for (const group of bundle.species) {
            const id = index.speciesOrder[group.index];
            if (!params.has(id)) continue;
            sources.push({
              species: id, anchorPivotTerrain: false, count: group.count,
              read: (i, out) => {
                const inst = readInstance(group, i);
                out.x = inst.x; out.y = inst.y; out.z = inst.z; out.yaw = inst.yaw;
                out.scale = inst.scale; out.tiltX = inst.tiltX; out.tiltZ = inst.tiltZ; out.sink = inst.sink;
              },
            });
          }
          const build = buildCell(sources, params, () => null, 1, 6000,
            (cx + dx) * size, (cz + dz) * size, size);
          for (const sb of build.species) {
            const p = params.get(sb.species)!;
            const tris = trisPerLevel.get(sb.species)!;
            if (dx === 0 && dz === 0 && !Number.isFinite(groundY)) {
              // the nearest instance's height is the ground under the camera
              let best = Infinity;
              for (let i = 0; i < sb.count; i++) {
                const d = Math.hypot(sb.placements[i * 7] - site.x, sb.placements[i * 7 + 2] - site.z);
                if (d < best) { best = d; groundY = sb.placements[i * 7 + 1]; }
              }
            }
            const entry: GateSpecies = {
              key: `${key}|${sb.species}`, cell: key, species: sb.species, maxDraw: p.maxDraw,
              cellBox: { minX: sb.minX - p.reachM * sb.maxScale, minZ: sb.minZ - p.reachM * sb.maxScale,
                maxX: sb.maxX + p.reachM * sb.maxScale, maxZ: sb.maxZ + p.reachM * sb.maxScale },
              reachM: p.reachM, rungs: [], near: true,
            };
            sb.rungs.forEach((r, ri) => {
              const t = tris[Math.min(r.level, tris.length - 1)];
              const rung: GateRung = {
                band: r.band, near: ri === 0, casts: r.level !== (p.cardLevel ?? -1) && r.level === (p.cardLevel === 1 || !sb.rungs.some((q) => q.level === 1) ? 0 : 1),
                castsFromZero: r.level === 1 && p.cardLevel !== 1,
                tileOffsets: sb.tileOffsets, tileBounds: sb.tileBounds,
                state: new Uint8Array(GATE_TILE_COUNT), ids: [new Int32Array(sb.count)],
                copies: sb.count, triangles: sb.count * t, trianglesPerInstance: t, onTiles: 0,
                heightM: p.heightM,
              };
              entry.rungs.push(rung);
              meta.set(rung, { species: sb.species, level: r.level, placements: sb.placements, count: sb.count, band: r.band, tris: t });
            });
            list.push(entry);
          }
        }
      }
      const eye = new THREE.Vector3(site.x, (Number.isFinite(groundY) ? groundY : 0) + 3, site.z);
      const out: Record<string, unknown> = { site: site.label, quality: qualityName };
      const byLevel: Record<string, number> = {};
      const sums = { submittedCopies: 0, submittedTris: 0, inViewCopies: 0, inViewTris: 0,
        distinctSubmitted: 0, distinctTreesSubmitted: 0, distinctTreesInView: 0, draws: 0, headings: 0 };
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
        camera.position.copy(eye);
        camera.rotation.set(-10 * Math.PI / 180, yaw, 0, "YXZ");
        camera.updateMatrixWorld(true);
        const fwd3 = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const fl = Math.hypot(fwd3.x, fwd3.z);
        const fwd = { x: fwd3.x / fl, z: fwd3.z / fl };
        const view = process.env.VEG_GATE === "old" ? undefined : viewPlanesFor(camera);
        // Noon-ish sun from the south-east at 55° elevation; VEG_SUN=0 is night.
        if (view) view.shadow = process.env.VEG_SUN === "0" ? null
          : { x: -Math.SQRT1_2, z: -Math.SQRT1_2, perM: 1 / Math.tan((55 * Math.PI) / 180) };
        for (const e of list) for (const r of e.rungs) { r.state.fill(0); r.onTiles = 0; }
        const stats: GateStats = { visibleCopies: 0, visibleTriangles: 0, checksCell: 0, checksTile: 0 };
        const g0 = performance.now();
        gateSpecies(list, eye, fwd, () => undefined, stats, undefined, undefined, view);
        byLevel.gateMsX1000 = (byLevel.gateMsX1000 ?? 0) + (performance.now() - g0) * 1000;
        sums.submittedCopies += stats.visibleCopies;
        sums.submittedTris += stats.visibleTriangles;
        // ground truth, per instance
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const sphere = new THREE.Sphere();
        const drawKeys = new Set<string>();
        const distinct = new Set<string>();
        const treesIn = new Set<string>();
        const treesSub = new Set<string>();
        for (const e of list) {
          for (const r of e.rungs) {
            const m = meta.get(r)!;
            for (let t = 0; t < GATE_TILE_COUNT; t++) {
              const on = (r.state[t] & 1) === 1;
              if (on && r.tileOffsets[t + 1] > r.tileOffsets[t]) drawKeys.add(`${m.species}|${m.level}`);
              if (on) byLevel[`sub${m.level === (params.get(m.species)!.cardLevel ?? -1) ? "C" : m.level}`] = (byLevel[`sub${m.level === (params.get(m.species)!.cardLevel ?? -1) ? "C" : m.level}`] ?? 0) + (r.tileOffsets[t + 1] - r.tileOffsets[t]) * m.tris;
              for (let i = r.tileOffsets[t]; i < r.tileOffsets[t + 1]; i++) {
                const x = m.placements[i * 7]; const y = m.placements[i * 7 + 1]; const z = m.placements[i * 7 + 2];
                const s = m.placements[i * 7 + 6];
                const id = `${e.key}|${i}`;
                if (on) {
                  distinct.add(id);
                  if (categoryOf.get(m.species) === "tree") treesSub.add(id);
                }
                const d = Math.hypot(x - eye.x, z - eye.z);
                const f = lodFadeFactors(m.band, d);
                if (f.fadeIn <= 0 || f.fadeOut > BAYER4_MAX) continue;
                const h = (r.heightM ?? 2) * s;
                sphere.center.set(x, y + h / 2, z);
                sphere.radius = Math.max(h / 2, e.reachM * s * 0.6);
                if (!frustum.intersectsSphere(sphere)) continue;
                sums.inViewCopies++;
                sums.inViewTris += m.tris;
                if (categoryOf.get(m.species) !== "tree") byLevel[`inSmall${m.level === (params.get(m.species)!.cardLevel ?? -1) ? "C" : m.level}`] = (byLevel[`inSmall${m.level === (params.get(m.species)!.cardLevel ?? -1) ? "C" : m.level}`] ?? 0) + m.tris;
                byLevel[`in${m.level === (params.get(m.species)!.cardLevel ?? -1) ? "C" : m.level}`] = (byLevel[`in${m.level === (params.get(m.species)!.cardLevel ?? -1) ? "C" : m.level}`] ?? 0) + m.tris;
                if (categoryOf.get(m.species) === "tree") treesIn.add(id);
              }
            }
          }
        }
        sums.distinctSubmitted += distinct.size;
        sums.distinctTreesSubmitted += treesSub.size;
        sums.distinctTreesInView += treesIn.size;
        sums.draws += drawKeys.size;
        sums.headings++;
      }
      for (const [k, v] of Object.entries(sums)) if (k !== "headings") out[k] = Math.round(v / sums.headings);
      out.submittedOverInView = Math.round((sums.submittedCopies / Math.max(1, sums.inViewCopies)) * 100) / 100;
      for (const [k, v] of Object.entries(byLevel)) out[`tris_${k}`] = Math.round(v / 4);
      out.variant = process.env.VEG_LABEL ?? "";
      out.gate = process.env.VEG_GATE === "old" ? "old" : "new";
      appendFileSync(process.env.VEG_OUT ?? "/tmp/veg-measure.jsonl", `${JSON.stringify(out)}\n`);
    }
  }, 300_000);
});
