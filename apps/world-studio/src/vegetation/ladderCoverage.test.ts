/**
 * The band-coverage invariant (walk 5, 2026-09-29): for every species shape
 * the renderer can meet — height, tree or not, submerged, one to three mesh
 * levels, with or without a card, every quality preset — the emitted rungs
 * tile the distance line from 0 to the draw distance with no gap and no
 * overlap: at every distance every screen pixel is kept by EXACTLY one rung
 * (the temporal cross-fade then splits that pixel between two copies only
 * while the camera crosses an edge, `lodFadeTemporal.test.ts`), and inside
 * the vanish window by at most one. A gap here is a plant that is invisible
 * at some distance and reappears nearer — the owner's walk-5 "pop in, then pop
 * out" — so the test walks every distance, not just the edges.
 */
import { describe, expect, it } from "vitest";
import { lodLadder } from "@elder-souls/game-core/fx/lodFade";
import { QUALITY_PRESETS } from "@elder-souls/game-core/core/quality";
import {
  maxDrawDistance,
  projectedHeightPx,
  distanceAtPx,
  speciesRings,
  SUBMERGED_MAX_DRAW_M,
  treeDrawDistance,
  HANDOVER_PX,
  SMALL_PLANT_TOP_TIER_M,
  ladderCoverageFailures,
  TREE_MESH_FLOOR_M,
} from "./floraKit";

const CHUNK_M = 467.93;
const HEIGHTS = [0.3, 0.8, 1.5, 3, 6, 12, 20, 30, 45];

describe("vegetation ladder band coverage", () => {
  it("covers every distance exactly once for every species shape and preset", () => {
    let checked = 0;
    const failures: string[] = [];
    for (const preset of Object.values(QUALITY_PRESETS)) {
      for (const heightM of HEIGHTS) {
        for (const category of ["tree", "shrub"] as const) {
          for (const submerged of [false, true]) {
            for (const meshLevels of [1, 2, 3]) {
              for (const hasCard of [true, false]) {
                const folded = meshLevels === 1;
                const card = hasCard ? meshLevels : null;
                const maxDraw = submerged
                  ? Math.min(maxDrawDistance(heightM) * preset.vegDrawScale, SUBMERGED_MAX_DRAW_M)
                  : category === "tree"
                    ? treeDrawDistance(preset.vegChunkRing, CHUNK_M)
                    : maxDrawDistance(heightM) * preset.vegDrawScale;
                const rings = speciesRings(
                  { heightM, meshLevels, category, submerged, folded },
                  preset.vegDrawScale, preset.name);
                const ladder = lodLadder(rings, meshLevels, card, maxDraw);
                // Every shipped mesh level is reached (round 13d: low skipped
                // a two-level tree's far rung) wherever the draw distance
                // reaches the last level's start.
                const shown = ladder.filter((r) => r.hi > r.lo).map((r) => r.level);
                const meshShown = shown.filter((l) => l < meshLevels);
                if (meshLevels === 1 || rings[meshLevels - 2] < maxDraw) {
                  const want = Array.from({ length: meshLevels }, (_, i) => i);
                  if (JSON.stringify(meshShown) !== JSON.stringify(want)) {
                    failures.push(`${preset.name} h${heightM} ${category} sub${submerged} L${meshLevels}: rungs ${shown}`);
                  }
                }
                const vanishes = submerged || category !== "tree";
                failures.push(...ladderCoverageFailures(ladder, vanishes, maxDraw,
                  `${preset.name} h${heightM} ${category} sub${submerged} L${meshLevels} card${hasCard}`));
                checked++;
              }
            }
          }
        }
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(checked).toBe(3 * HEIGHTS.length * 2 * 2 * 3 * 2);
  }, 30_000);
});

describe("screen-space hand-over", () => {
  it("hands over where the projected height reaches each threshold", () => {
    for (const px of [30, 90, 260]) {
      expect(projectedHeightPx(25, distanceAtPx(25, px))).toBeCloseTo(px, 6);
    }
    // 1080 px, 60°: a 25 m tree is ~935 x 25 / px metres away.
    expect(distanceAtPx(25, 90)).toBeCloseTo(259.8, 0);
  });

  it("never cards a big multi-level tree nearer than the folded ladder did", () => {
    for (const preset of Object.values(QUALITY_PRESETS)) {
      for (const heightM of [20, 25, 40, 66]) {
        const folded = speciesRings(
          { heightM, meshLevels: 1, category: "tree", submerged: false, folded: true },
          preset.vegDrawScale, preset.name);
        const multi = speciesRings(
          { heightM, meshLevels: 3, category: "tree", submerged: false, folded: false },
          preset.vegDrawScale, preset.name);
        // The single-level full-mesh floor (TREE_MESH_FLOOR_M) exists only
        // because single-level trees have no mid tier; compare the ladders
        // where the floor does not set the folded reach.
        if (folded[0] > TREE_MESH_FLOOR_M[preset.name]) expect(multi[2]).toBeGreaterThanOrEqual(folded[0] * 0.95);
        expect(multi[1]).toBeGreaterThanOrEqual(multi[0]);
        expect(multi[2]).toBeGreaterThanOrEqual(multi[1]);
        // Never nearer than round 13 validated: mid from 2.5 h, far from 5 h
        // (each clamped as the check rendered them).
        expect(multi[0]).toBeGreaterThanOrEqual(Math.min(60, Math.max(18, heightM * 2.5)));
        expect(multi[1]).toBeGreaterThanOrEqual(Math.min(140, Math.max(50, heightM * 5)));
      }
    }
    // Medium, the canopy tree (42 m): the card is ~1.5x further than folded.
    const m = QUALITY_PRESETS.medium;
    const folded = speciesRings({ heightM: 42, meshLevels: 1, category: "tree", submerged: false, folded: true }, m.vegDrawScale, m.name);
    const multi = speciesRings({ heightM: 42, meshLevels: 2, category: "tree", submerged: false, folded: false }, m.vegDrawScale, m.name);
    expect(multi[2]).toBeGreaterThan(folded[0] * 1.4);
    expect(multi[2]).toBeCloseTo(distanceAtPx(42, HANDOVER_PX.medium[2]), 6);
  });

  it("keeps a bush on its full mesh inside the small-plant radius", () => {
    for (const preset of Object.values(QUALITY_PRESETS)) {
      for (const heightM of [0.5, 1.5, 3]) {
        for (const meshLevels of [1, 2, 3]) {
          const rings = speciesRings(
            { heightM, meshLevels, category: "shrub", submerged: false, folded: meshLevels === 1 },
            preset.vegDrawScale, preset.name);
          expect(rings[0]).toBeGreaterThanOrEqual(SMALL_PLANT_TOP_TIER_M[preset.name]);
        }
      }
    }
  });
});

describe("impostor rung (walk-5 impostor lane)", () => {
  // Mangrove shapes: 8.6-13.1 m trees, impostor texel heights 140-180 px.
  it("covers every distance exactly once with the impostor on the card rung", () => {
    const failures: string[] = [];
    for (const preset of Object.values(QUALITY_PRESETS)) {
      for (const heightM of [8.6, 9.3, 13.1]) {
        for (const impostorPx of [120, 172, 260]) {
          for (const meshLevels of [1, 2, 3]) {
            const maxDraw = treeDrawDistance(preset.vegChunkRing, CHUNK_M);
            const rings = speciesRings(
              { heightM, meshLevels, category: "tree", submerged: false,
                folded: meshLevels === 1, impostorPx },
              preset.vegDrawScale, preset.name);
            const ladder = lodLadder(rings, meshLevels, meshLevels, maxDraw);
            failures.push(...ladderCoverageFailures(ladder, false, maxDraw,
              `${preset.name} h${heightM} px${impostorPx} L${meshLevels}`));
          }
        }
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  }, 30_000);

  it("starts no nearer than the impostor's texel height and never nearer than the card", () => {
    for (const preset of Object.values(QUALITY_PRESETS)) {
      for (const meshLevels of [1, 3]) {
        const shape = { heightM: 9.3, meshLevels, category: "tree", submerged: false,
          folded: meshLevels === 1 };
        const card = speciesRings(shape, preset.vegDrawScale, preset.name);
        const imp = speciesRings({ ...shape, impostorPx: 172 }, preset.vegDrawScale, preset.name);
        const last = meshLevels === 1 ? 0 : 2;
        expect(imp[last]).toBeGreaterThanOrEqual(card[last]);
        expect(projectedHeightPx(9.3, imp[last])).toBeLessThanOrEqual(172 + 1e-6);
        // Only the card rung moves: the mesh tiers keep their hand-overs.
        if (meshLevels === 3) expect(imp.slice(0, 2)).toEqual(card.slice(0, 2));
      }
    }
  });
});
