/**
 * 16h check-in 3 §2: a modular run is seated as ONE rigid chain on the
 * compile's datum, so adjacent pieces step by exactly their mined rise.
 */
import { describe, expect, it } from "vitest";
import {
  anchorPlacement, anchorRun, createPlacementResolver, runJointErrors, RUN_JOINT_TOLERANCE_M,
} from "./anchoring";
import { SETTLEMENT_COLLISION_FRAME, type SettlementPlacement } from "./types";

const PITCH = 7.27;
const RISES = [0, 0.12, 0.3];
const SINKS = [0, -0.02, 0.0036];
const slope = (x: number) => 20 + x * 0.04; // 4 % rise to +x

function piece(i: number): SettlementPlacement {
  const x0 = i * PITCH;
  return {
    id: `run.a.piece.${i + 1}`, sourceId: "s", kind: "settlement", assetId: `wall${i}`, kit: "k",
    positionM: [x0 + PITCH / 2, 0, 0], yawDeg: 0, scale: 1,
    footprintM: [[x0, -0.5], [x0 + PITCH, -0.5], [x0 + PITCH, 0.5], [x0, 0.5]],
    anchor: { mode: "streamed-perimeter", groundFit: "pad",
      originOffsetM: [0, 0, 0], buryM: 0, buryCapM: 0.9, slopeBuryPerM: 0 },
    run: { id: "run.a", index: i, riseM: RISES[i] },
    collision: { frame: SETTLEMENT_COLLISION_FRAME, kind: "mesh" },
  };
}

const pieces = [2, 0, 1].map(piece); // bundle order is not run order
const sinkOf = (p: SettlementPlacement) => SINKS[p.run!.index];

describe("modular run seating", () => {
  it("steps every joint by exactly its mined rise on sloping ground", () => {
    const resolve = createPlacementResolver(pieces,
      (p) => ({ designedSinkM: { p25: 0, p50: sinkOf(p), p75: 0, n: 1, evidence: "plugin" } }), slope);
    const y = [0, 1, 2].map((i) => resolve(pieces.find((p) => p.run!.index === i)!)!.matrix.elements[13]);
    for (let i = 1; i < 3; i++) {
      expect(Math.abs((y[i] - y[i - 1]) - (RISES[i] - RISES[i - 1]))).toBeLessThan(0.001);
    }
    // Datum = the highest mean ground (the last piece on this slope), seated
    // on its own mean minus its own sink.
    const datumMean = slope(2 * PITCH + PITCH / 2);
    expect(y[2]).toBeCloseTo(datumMean - SINKS[2], 6);
    expect(runJointErrors(pieces.map((p) => ({
      placementId: p.id, run: p.run!, y: y[p.run!.index] })))).toEqual([]);
  });

  it("the joint gate fails the old per-piece seating", () => {
    const own = pieces.map((p) => ({
      placementId: p.id, run: p.run!, y: anchorPlacement(p, slope, sinkOf(p)).y }));
    const errors = runJointErrors(own);
    expect(errors.length).toBe(2);
    expect(errors[0]).toMatch(/mm off its mined rise/);
    // just inside and just outside the tolerance
    const at = (dy: number) => runJointErrors([
      { placementId: "a", run: { id: "r", index: 0, riseM: 0 }, y: 0 },
      { placementId: "b", run: { id: "r", index: 1, riseM: 0.1 }, y: 0.1 + dy }]);
    expect(at(RUN_JOINT_TOLERANCE_M * 0.9)).toEqual([]);
    expect(at(RUN_JOINT_TOLERANCE_M * 1.1).length).toBe(1);
  });

  it("waits for terrain and refuses a run with a missing member", () => {
    expect(anchorRun(pieces, (x) => (x > 15 ? null : 1), sinkOf)).toBeNull();
    expect(() => anchorRun([pieces[0], pieces[2]], slope, sinkOf)).toThrow(/not 0\.\.1/);
  });
});
