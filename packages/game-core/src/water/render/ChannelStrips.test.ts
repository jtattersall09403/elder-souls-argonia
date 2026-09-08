import { describe, expect, it } from "vitest";
import {
  BOULDER_BED_M2_PER_ROCK, BOULDER_RADIUS_M, STRIP_BANK_M, STRIP_STEP_M, buildChannelStripGeometry, resampleStrip,
  stripBoulderCandidates, type ChannelStrip,
} from "./ChannelStrips";

const point = (x: number, y: number, kind: ChannelStrip["points"][number]["kind"]) => ({
  x, z: 0, y, bedY: y - 0.8, halfWidthM: 1.5, speedMS: 2, season: 0.5, kind,
});

/** A 20 m chain: field join, three steep stations, field join. */
const chain: ChannelStrip = {
  id: "strip-test",
  band: 2,
  points: [
    point(0, 30, "join"),
    point(5, 28, "steep"),
    point(10, 25, "fall"),
    point(15, 22, "steep"),
    point(20, 21, "join"),
  ],
};

describe("channel strip meshes", () => {
  it("resamples at no more than the longitudinal step and keeps y monotone", () => {
    const stations = resampleStrip(chain.points);
    expect(stations.length).toBeGreaterThanOrEqual(20 / STRIP_STEP_M);
    for (let i = 1; i < stations.length; i++) {
      const step = Math.hypot(stations[i].x - stations[i - 1].x, stations[i].z - stations[i - 1].z);
      expect(step).toBeLessThanOrEqual(STRIP_STEP_M + 1e-6);
      expect(stations[i].y).toBeLessThanOrEqual(stations[i - 1].y + 1e-6);
    }
  });

  it("overlaps the field at both joins, at exactly the compiled field height", () => {
    const stations = resampleStrip(chain.points);
    expect(stations[0].x).toBeCloseTo(0, 6);
    expect(stations[0].y).toBeCloseTo(30, 6);
    expect(stations[stations.length - 1].x).toBeCloseTo(20, 6);
    expect(stations[stations.length - 1].y).toBeCloseTo(21, 6);
  });

  it("widens the ribbon by the bank margin the depth fade dissolves", () => {
    const built = buildChannelStripGeometry([chain]);
    const pos = built.geometry.getAttribute("position");
    const width = Math.abs(pos.getZ(1) - pos.getZ(0));
    expect(width).toBeCloseTo(2 * (1.5 + STRIP_BANK_M), 5);
  });

  it("carries one hydraulic attribute set per vertex", () => {
    const built = buildChannelStripGeometry([chain]);
    expect(built.vertexCount).toBe(built.stationCount * 2);
    expect(built.triangleCount).toBe((built.stationCount - 1) * 2);
    for (const name of ["aStill", "aBedDepth", "aFlow", "aSeason", "aDrop"]) {
      expect(built.geometry.getAttribute(name).count).toBe(built.vertexCount);
    }
    const bed = built.geometry.getAttribute("aBedDepth");
    expect(bed.getX(0)).toBeCloseTo(0.8, 5);
    const flow = built.geometry.getAttribute("aFlow");
    expect(Math.hypot(flow.getX(0), flow.getY(0))).toBeCloseTo(2, 5);
    expect(built.geometry.getAttribute("aStill").getX(0)).toBeCloseTo(30, 5);
  });

  it("merges every chain into one geometry and drops degenerate ones", () => {
    const degenerate: ChannelStrip = { id: "strip-bad", band: 1, points: [point(3, 5, "join")] };
    const built = buildChannelStripGeometry([chain, degenerate, chain]);
    expect(built.stripCount).toBe(2);
    expect(built.geometry.groups.length).toBe(0);
    expect(built.geometry.getIndex()!.count).toBe(built.triangleCount * 3);
  });
});

describe("ribbon UV (decision 0047 item 4)", () => {
  it("carries arc metres, signed across metres and one scroll speed per ribbon", () => {
    const built = buildChannelStripGeometry([chain]);
    const arc = built.geometry.getAttribute("aArc");
    const sideM = built.geometry.getAttribute("aSideM");
    const scroll = built.geometry.getAttribute("aScroll");
    expect(arc.getX(0)).toBeCloseTo(0, 6);
    expect(arc.getX(arc.count - 1)).toBeCloseTo(20, 6);
    for (let i = 2; i < arc.count; i += 2) expect(arc.getX(i)).toBeGreaterThan(arc.getX(i - 2));
    expect(sideM.getX(0)).toBeCloseTo(-(1.5 + STRIP_BANK_M), 6);
    expect(sideM.getX(1)).toBeCloseTo(1.5 + STRIP_BANK_M, 6);
    for (let i = 0; i < scroll.count; i++) expect(scroll.getX(i)).toBeCloseTo(2, 6);
  });

  it("prefers the compiler's monotone arcM, falls back to the polyline arc otherwise", () => {
    const authored: ChannelStrip = { ...chain, points: chain.points.map((p, i) => ({ ...p, arcM: i * 7 })) };
    const stations = resampleStrip(authored.points);
    expect(stations[stations.length - 1].arcM).toBeCloseTo(28, 6);
    const broken: ChannelStrip = { ...chain, points: chain.points.map((p, i) => ({ ...p, arcM: i === 2 ? 1 : i * 7 })) };
    expect(resampleStrip(broken.points)[stations.length - 1].arcM).toBeCloseTo(20, 6);
  });

  it("accepts v2 lip/plunge chain ends", () => {
    const v2: ChannelStrip = { ...chain, points: [
      { ...point(0, 30, "join") }, { ...point(5, 28, "steep") }, { ...point(10, 25, "lip") },
    ] };
    expect(buildChannelStripGeometry([v2]).stripCount).toBe(1);
  });
});

describe("across-width coordinate", () => {
  it("marks the water edge at |aSide| = 1 and the bank margin beyond it", () => {
    const built = buildChannelStripGeometry([chain]);
    const side = built.geometry.getAttribute("aSide");
    const values = Array.from({ length: side.count }, (_, i) => side.getX(i));
    // halfWidthM 1.5 + STRIP_BANK_M 0.6 => the mesh edge sits at 2.1/1.5 = 1.4
    const expected = (1.5 + STRIP_BANK_M) / 1.5;
    for (const v of values) expect(Math.abs(v)).toBeCloseTo(expected, 5);
    expect(Math.abs(expected)).toBeGreaterThan(1); // the margin is OUTSIDE the water
    expect(values.filter((v) => v < 0)).toHaveLength(side.count / 2);
    // aEdge carries that same mesh-edge ratio so the bank fade spans exactly the margin
    const edge = built.geometry.getAttribute("aEdge");
    for (let i = 0; i < edge.count; i++) expect(edge.getX(i)).toBeCloseTo(expected, 5);
  });
});

describe("boulder candidates for the scatter compiler (research §3.6: 1 per 160 m² of bed)", () => {
  /** 400 m long, 4 m wide (halfWidth 2) => 1600 m² of bed => ~10 rocks. */
  const long: ChannelStrip = { id: "strip-long", band: 2, points: [
    { ...point(0, 60, "join"), halfWidthM: 2 },
    { ...point(200, 40, "steep"), halfWidthM: 2 },
    { ...point(400, 20, "join"), halfWidthM: 2 },
  ] };

  it("yields about one rock per 160 m² of wetted bed, inside the channel, deterministically", () => {
    const rocks = stripBoulderCandidates(long);
    const bedM2 = 400 * 4;
    expect(rocks.length).toBeGreaterThanOrEqual(Math.floor(bedM2 / BOULDER_BED_M2_PER_ROCK) - 1);
    expect(rocks.length).toBeLessThanOrEqual(Math.ceil(bedM2 / BOULDER_BED_M2_PER_ROCK) + 1);
    for (const r of rocks) {
      expect(Math.abs(r.sideM)).toBeLessThanOrEqual(0.8 * 2 + 1e-9);
      expect(Math.abs(r.z)).toBeLessThanOrEqual(0.8 * 2 + 1e-9);   // chain runs along x at z = 0
      expect(r.radiusM).toBeGreaterThanOrEqual(BOULDER_RADIUS_M.min);
      expect(r.radiusM).toBeLessThanOrEqual(BOULDER_RADIUS_M.max);
      expect(r.arcM).toBeGreaterThan(0);
      expect(r.arcM).toBeLessThan(400);
      expect(Math.hypot(r.tx, r.tz)).toBeCloseTo(1, 6);
      expect(r.tx).toBeGreaterThan(0);   // downstream
      expect(r.y).toBeCloseTo(60 - r.x * 0.1 - 0.8, 1);   // on the bed
    }
    expect(rocks.map((r) => r.id)).toEqual(rocks.map((_, i) => `strip-long:rock-${i}`));
    expect(stripBoulderCandidates(long)).toEqual(rocks);
    expect(stripBoulderCandidates({ ...long, id: "strip-other" })).not.toEqual(rocks);
    // spacing follows the quota: consecutive rocks are ~40 m apart on a 4 m bed
    for (let i = 1; i < rocks.length; i++) {
      expect(rocks[i].arcM - rocks[i - 1].arcM).toBeGreaterThan(BOULDER_BED_M2_PER_ROCK / 4 - STRIP_STEP_M - 1e-6);
    }
  });

  it("scales with width and yields nothing for a degenerate chain", () => {
    const wide: ChannelStrip = { ...long, points: long.points.map((p) => ({ ...p, halfWidthM: 4 })) };
    expect(stripBoulderCandidates(wide).length).toBeGreaterThan(stripBoulderCandidates(long).length * 1.5);
    expect(stripBoulderCandidates({ id: "x", band: 1, points: [point(0, 1, "join")] })).toEqual([]);
    expect(stripBoulderCandidates(chain).length).toBeLessThanOrEqual(1);   // 20 m x 3 m = 60 m²
  });
});
