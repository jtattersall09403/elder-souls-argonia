import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyGroundOverlays, overlayHeight, overlaysOfBundle,
  GroundOverlayRegistry, type GroundOverlay,
} from "./heightOverlays";

interface Fixture {
  overlays: GroundOverlay[];
  points: { pad: string; zone: string; x: number; z: number; baseM: number; expectedM: number }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "__fixtures__/ground-overlays-claywater.json"), "utf8"),
) as Fixture;

describe("ground overlays (decision 0102)", () => {
  it("equals the Python twin on Claywater's twelve golden points", () => {
    expect(fixture.points).toHaveLength(12);
    for (const p of fixture.points) {
      const got = overlayHeight(p.baseM, p.x, p.z, fixture.overlays);
      expect(Math.abs(got - p.expectedM), `${p.pad} ${p.zone}`).toBeLessThan(1e-4);
    }
  });

  it("applies to a grid through the same maths and never writes its input", () => {
    // a 1 m grid whose samples land exactly on the golden points' neighbours
    const grid = { originM: [270, 2980] as const, metresPerSample: 1, nx: 100, ny: 130 };
    const heights = new Float32Array(grid.nx * grid.ny).fill(35);
    const out = applyGroundOverlays(heights, grid, fixture.overlays);
    expect(out).not.toBe(heights);
    expect(heights.every((h) => h === 35)).toBe(true);
    // the family hut's core sample stands on its datum
    const i = (2994 - 2980) * grid.nx + (284 - 270);
    expect(out[i]).toBeCloseTo(overlayHeight(35, 284, 2994, fixture.overlays), 4);
    expect(out[i]).toBeCloseTo(35.8, 4);
    // a grid no overlay reaches comes back as the same array
    const far = { originM: [5000, 5000] as const, metresPerSample: 1, nx: 4, ny: 4 };
    const untouched = new Float32Array(16);
    expect(applyGroundOverlays(untouched, far, fixture.overlays)).toBe(untouched);
  });

  it("reads a bundle's overlays by place and refuses an unknown version", () => {
    const pads = fixture.overlays;
    const got = overlaysOfBundle({ settlements: [{ id: "p", groundOverlays: { schemaVersion: 1, pads } }, { id: "q" }] });
    expect([...got.keys()]).toEqual(["p"]);
    expect(() => overlaysOfBundle({ settlements: [{ id: "p", groundOverlays: { schemaVersion: 2, pads } }] }))
      .toThrow(/schemaVersion 2/);
  });

  it("cuts a pool basin at its datum, applied with the run pads, and yields inside a building pad", () => {
    const circle = Array.from({ length: 24 }, (_, k) =>
      [10 + 4 * Math.cos((2 * Math.PI * k) / 24), 20 + 4 * Math.sin((2 * Math.PI * k) / 24)] as const);
    const pool: GroundOverlay = { id: "pool.place.t.spring", kind: "pool", bboxM: [6, 16, 14, 24],
      blendM: 1, hardM: 0, pieces: [{ placementId: "pool.place.t.spring", polygonM: circle, datumM: 30.4 }] };
    expect(overlayHeight(31, 10, 20, [pool])).toBeCloseTo(30.4, 9);   // inside the rim: the bed
    expect(overlayHeight(31, 10, 25.5, [pool])).toBe(31);              // beyond the 1 m blend
    const hut: GroundOverlay = { id: "b", kind: "building", bboxM: [9, 19, 11, 21], blendM: 1, hardM: 0,
      pieces: [{ polygonM: [[9, 19], [11, 19], [11, 21], [9, 21]], datumM: 32 }] };
    expect(overlayHeight(31, 10, 20, [hut, pool])).toBe(32);           // the building pad outranks it
  });

  it("the registry is ready once set, and empty when its source fails", async () => {
    const reg = new GroundOverlayRegistry();
    reg.set(new Map([["p", fixture.overlays]]));
    await reg.ready;
    expect(reg.overlays()).toHaveLength(fixture.overlays.length);
    const empty = new GroundOverlayRegistry();
    empty.settleEmpty();
    await empty.ready;
    expect(empty.overlays()).toHaveLength(0);
  });
});
