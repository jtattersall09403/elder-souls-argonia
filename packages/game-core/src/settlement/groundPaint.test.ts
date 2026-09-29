import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GROUND_PAINT_TEXTURES, groundPaintOfBundle, paintStrip, type GroundPaintEntry,
} from "./groundPaint";

const here = dirname(fileURLToPath(import.meta.url));
const road: GroundPaintEntry = {
  id: "paint.route.t.road", kind: "road", texture: "bc_road", edgeM: 1,
  polygonM: [[0, -2.65], [30, -2.65], [30, 2.65], [0, 2.65]],
};
/** Rolling ground with a crease every 1.8 m, as the terrain's posts make it. */
const ground = (x: number, z: number) => 10 + Math.sin(x / 3) * 1.5 + Math.abs(((z / 1.8) % 1)) * 0.2;

describe("ground paint (16k walk 4)", () => {
  it("drapes every strip vertex within 0.05 m of the sampled ground, alpha soft at the edge", () => {
    const s = paintStrip(road, ground)!;
    expect(s.vertexCount).toBeGreaterThan(100);
    let worst = 0;
    for (let v = 0; v < s.vertexCount; v++) {
      const [x, y, z] = [s.positions[v * 3], s.positions[v * 3 + 1], s.positions[v * 3 + 2]];
      worst = Math.max(worst, Math.abs(y - ground(x, z)));
    }
    expect(worst).toBeLessThanOrEqual(0.05);
    const alphas = Array.from({ length: s.vertexCount }, (_, v) => s.colors[v * 4 + 3]);
    expect(Math.min(...alphas)).toBe(0);
    expect(Math.max(...alphas)).toBe(1);
  });

  it("waits while the ground under a strip is not decoded", () => {
    expect(paintStrip(road, (x) => (x > 20 ? null : 1))).toBeNull();
  });

  it("refuses an unknown texture id and an unknown version", () => {
    const bad = { ...road, texture: "grass_dirt" };
    expect(() => groundPaintOfBundle([{ id: "place.t", groundPaint: { schemaVersion: 1, entries: [bad] } }]))
      .toThrow(/texture "grass_dirt" is not a road paint material/);
    expect(() => groundPaintOfBundle([{ id: "place.t", groundPaint: { schemaVersion: 2, entries: [road] } }]))
      .toThrow(/schemaVersion 2, expected 1/);
    expect(groundPaintOfBundle([{ id: "place.t", groundPaint: { schemaVersion: 1, entries: [road, road] } }]))
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
    for (const e of entries) expect(paintStrip(e, ground)).not.toBeNull();
    console.info(`[ground-paint] claywater: ${entries.length} strips in ${(performance.now() - start).toFixed(1)} ms`);
  });
});
