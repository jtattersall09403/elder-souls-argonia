import { describe, expect, it } from "vitest";
import { GROUND_PAINT_SCHEMA_VERSION, type GroundPaintEntry } from "./groundPaint";
import { buildPaintGroups, paintGroups } from "./GroundPaintLayer";

const strip = (id: string, x: number): GroundPaintEntry => ({
  id, kind: "road", texture: "bc_road", edgeM: 1,
  polygonM: [[x, -2], [x + 20, -2], [x + 20, 2], [x, 2]],
});
const place = (id: string, x: number) => ({
  id, groundPaint: { schemaVersion: GROUND_PAINT_SCHEMA_VERSION, entries: [strip(`paint.${id}`, x)] },
});

describe("ground paint layer grouping (16k walk 5)", () => {
  // Claywater and Greenspring sit ~4.4 km apart; only Claywater's ground is decoded.
  const bundle = [place("claywater", 307), place("greenspring", 4700)];
  const groundAt = (x: number) => (x < 1000 ? 5 : null);

  it("groups by (place, texture), never one texture across places", () => {
    expect([...paintGroups(bundle).keys()]).toEqual(["claywater|bc_road", "greenspring|bc_road"]);
  });

  it("builds a decoded place's paint while another place's ground is still undecoded", () => {
    const { built, waiting, missing } = buildPaintGroups(paintGroups(bundle).values(), groundAt, () => 4);
    expect(built.map((b) => b.group.placeId)).toEqual(["claywater"]);
    expect(built[0].geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect(waiting.map((g) => g.placeId)).toEqual(["greenspring"]);
    expect(missing).toEqual([]);
  });

  it("drops a group whose texture has no ground material instead of retrying it", () => {
    const { built, missing } = buildPaintGroups(paintGroups(bundle).values(), () => 5, () => undefined);
    expect(built).toEqual([]);
    expect(missing).toHaveLength(2);
  });
});
