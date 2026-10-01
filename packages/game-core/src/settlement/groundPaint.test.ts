import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GROUND_PAINT_TEXTURES, GROUND_PAINT_SCHEMA_VERSION, groundPaintOfBundle, paintSurface, type GroundPaintEntry,
} from "./groundPaint";

const here = dirname(fileURLToPath(import.meta.url));
const road: GroundPaintEntry = {
  id: "paint.route.t.road", kind: "road", texture: "track_mud", edgeM: 1, peakAlpha: 0.75,
  polygonM: [[0, -2.65], [30, -2.65], [30, 2.65], [0, 2.65]],
};
/** A footpath crossing the road at x 10..12: overlaps it by 5.3 m. */
const path: GroundPaintEntry = {
  id: "paint.route.t.path", kind: "footpath", texture: "track_mud", edgeM: 0.7, peakAlpha: 0.5,
  polygonM: [[10, -8], [12, -8], [12, 8], [10, 8]],
};
/** Rolling ground with a crease every 1.8 m, as the terrain's posts make it. */
const ground = (x: number, z: number) => 10 + Math.sin(x / 3) * 1.5 + Math.abs(((z / 1.8) % 1)) * 0.2;

describe("ground paint (16k walk 4)", () => {
  it("drapes every surface vertex within 0.05 m of the sampled ground, alpha soft at the edge", () => {
    const s = paintSurface([road], ground)!;
    expect(s.vertexCount).toBeGreaterThan(100);
    let worst = 0;
    for (let v = 0; v < s.vertexCount; v++) {
      const [x, y, z] = [s.positions[v * 3], s.positions[v * 3 + 1], s.positions[v * 3 + 2]];
      worst = Math.max(worst, Math.abs(y - ground(x, z)));
    }
    expect(worst).toBeLessThanOrEqual(0.05);
    const alphas = Array.from({ length: s.vertexCount }, (_, v) => s.weights[v * 3]);
    expect(Math.min(...alphas)).toBe(0);
    expect(Math.max(...alphas)).toBeCloseTo(0.75, 5);
  });

  it("is ONE surface where two ways cross: every grid vertex once, weights by texture, max never summed", () => {
    // a second material (a vocabulary row away) takes the second weight channel
    const s = paintSurface([{ ...road, texture: "bc_road" }, path], ground)!;
    expect(s.textures).toEqual(["bc_road", "track_mud"]);
    const seen = new Set<string>();
    for (let v = 0; v < s.vertexCount; v++) {
      const key = `${s.positions[v * 3]},${s.positions[v * 3 + 2]}`;
      expect(seen.has(key)).toBe(false);      // no coplanar second layer anywhere
      seen.add(key);
      expect(s.weights[v * 3]).toBeLessThanOrEqual(0.75 + 1e-6);
      expect(s.weights[v * 3 + 1]).toBeLessThanOrEqual(0.5 + 1e-6);
    }
    // the same way twice paints no darker than once
    const once = paintSurface([path], ground)!; const twice = paintSurface([path, { ...path, id: "b" }], ground)!;
    expect(Array.from(twice.weights)).toEqual(Array.from(once.weights));
  });

  it("waits while the ground under a strip is not decoded", () => {
    expect(paintSurface([road], (x) => (x > 20 ? null : 1))).toBeNull();
  });

  it("refuses an unknown texture id and an unknown version", () => {
    const bad = { ...road, texture: "grass_dirt" };
    const v = GROUND_PAINT_SCHEMA_VERSION;
    expect(() => groundPaintOfBundle([{ id: "place.t", groundPaint: { schemaVersion: v, entries: [bad] } }]))
      .toThrow(/texture "grass_dirt" is not a road paint material/);
    expect(() => groundPaintOfBundle([{ id: "place.t", groundPaint: { schemaVersion: 1, entries: [road] } }]))
      .toThrow(/schemaVersion 1, expected 2/);
    expect(groundPaintOfBundle([{ id: "place.t", groundPaint: { schemaVersion: v, entries: [road, road] } }]))
      .toHaveLength(2);
  });

  it("knows exactly the textures the ground-paint vocabulary names", () => {
    const vocab = JSON.parse(readFileSync(join(here, "../../../../world/sources/vocab/ground-paint.json"), "utf8")) as
      { kinds: Record<string, { texture: string }> };
    expect(new Set(Object.values(vocab.kinds).map((k) => k.texture))).toEqual(GROUND_PAINT_TEXTURES);
  });

  it("paints the published places' ways", () => {
    const bundle = JSON.parse(readFileSync(join(here,
      "../../../../apps/world-studio/public/province/settlements/place.imperial-fringe.claywater-station.json"), "utf8"));
    const entries = groundPaintOfBundle([bundle.settlement]);
    expect(entries.length).toBeGreaterThanOrEqual(8);
    const start = performance.now();
    expect(paintSurface(entries, ground)).not.toBeNull();
    console.info(`[ground-paint] claywater: ${entries.length} ways, one surface in ${(performance.now() - start).toFixed(1)} ms`);
  });
});

describe("contact shade (16k walk 9, the building-to-ground seam)", () => {
  const shade: GroundPaintEntry = {
    id: "seam.shade.b", kind: "shade", texture: "shade", edgeM: 0.8, peakAlpha: 0.45,
    polygonM: [[-0.8, -0.8], [10.8, -0.8], [10.8, 10.8], [-0.8, 10.8]],
    holeM: [[0.5, 0.5], [9.5, 0.5], [9.5, 9.5], [0.5, 9.5]],
  };
  it("rides its own channel: texture weights stay 0, shade peaks at the wall and fades out, none in the hole", () => {
    const s = paintSurface([shade], ground)!;
    expect(s.textures).toEqual(["track_mud"]);
    expect(Math.max(...s.weights)).toBe(0);
    const at = (x: number, z: number) => {
      for (let v = 0; v < s.vertexCount; v++) {
        if (Math.abs(s.positions[v * 3] - x) < 1e-6 && Math.abs(s.positions[v * 3 + 2] - z) < 1e-6) return s.shade[v];
      }
      return null;
    };
    expect(at(0, 5)).toBeCloseTo(0.45, 5);          // at the wall: full strength
    expect(at(-0.5, 5)!).toBeLessThan(0.1);         // fading outward
    expect(at(-0.5, 5)!).toBeGreaterThan(0);
    expect(at(5, 5)).toBeNull();                     // the hole is never surfaced
  });
  it("is accepted by the bundle reader beside a way", () => {
    expect(groundPaintOfBundle([{ id: "p", groundPaint: {
      schemaVersion: GROUND_PAINT_SCHEMA_VERSION, entries: [road, shade] } }])).toHaveLength(2);
  });
});

describe("paintSurface cost (review walk 6)", () => {
  it("two ways 1 km apart cost their own cells, not the union box", () => {
    const at = (x: number, id: string): GroundPaintEntry => ({
      id, kind: "road", texture: "bc_road", edgeM: 1, peakAlpha: 0.75,
      polygonM: [[x, 0], [x + 4, 0], [x + 4, 4], [x, 4]],
    });
    let calls = 0;
    const surface = paintSurface([at(0, "a"), at(1000, "b")], () => { calls++; return 0; });
    expect(surface).not.toBeNull();
    expect(surface!.vertexCount).toBeLessThan(200);
    expect(calls).toBe(surface!.vertexCount);
  });
});
