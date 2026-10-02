import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { paintGeometry, paintMaterial, type PaintState } from "./groundPaintMaterial";
import { GROUND_PAINT_SHADE, type GroundPaintEntry } from "./groundPaint";

const ROWS = [{ id: 7, name: "track_mud", file: "", tileM: 4 }, { id: 12, name: "grass_dirt", file: "", tileM: 6 }];

describe("ground paint material (16k walk 7/9, node material)", () => {
  it("samples the terrain's albedo array at each row's id layer (no PNG maps)", () => {
    const array = new THREE.Texture();
    const m = paintMaterial(array, ROWS);
    const s = m.userData.esGroundPaint as PaintState;
    expect(s.array).toBe(array);
    // two rows: the third channel repeats the last row
    expect(s.layer.toArray()).toEqual([7, 12, 12]);
    expect(s.tile.toArray()).toEqual([4, 6, 6]);
    expect(m.map).toBeNull();
    expect(m.userData.paintMaps).toBeUndefined();
    expect(m.colorNode).toBeTruthy();
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
  });

  it("geometry carries the weight and contact-shade channels the colour node reads", () => {
    const path: GroundPaintEntry = {
      id: "paint.t.path", kind: "footpath", texture: "track_mud", edgeM: 0.7, peakAlpha: 0.5,
      polygonM: [[0, -2], [6, -2], [6, 2], [0, 2]],
    };
    const shade: GroundPaintEntry = { ...path, id: "paint.t.shade", texture: GROUND_PAINT_SHADE, peakAlpha: 0.6 };
    const built = paintGeometry([path, shade], () => 0)!;
    const g = built.geometry;
    expect(g.getAttribute("paintWeight").itemSize).toBe(3);
    const s = g.getAttribute("paintShade");
    expect(s.itemSize).toBe(1);
    expect(s.count).toBe(g.getAttribute("position").count);
    expect(Math.max(...(s.array as Float32Array))).toBeGreaterThan(0);
    expect(built.textures).toEqual(["track_mud"]);
  });
});
