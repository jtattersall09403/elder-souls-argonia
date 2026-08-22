import { describe, expect, it } from "vitest";
import {
  buildRunEdges,
  buildRunEvidenceSegments,
  buildRunTransitionSegments,
  compareRenderedRunPath,
  extractRenderedRuns,
} from "./visual-run-contract.mjs";

function frame(time, playerAnimation, clipTime = time, enemyAnimation = null, commandSerial = 1) {
  return {
    time,
    player: playerAnimation ? { animation: playerAnimation, clipTime, commandSerial } : null,
    enemy: enemyAnimation ? { animation: enemyAnimation, clipTime, commandSerial } : null,
  };
}

describe("rendered animation run contracts", () => {
  it("extracts occurrence-aware semantic runs and adjacent edge ids", () => {
    const telemetry = { visualFrames: [
      frame(0, "SWORD_IDLE", 0),
      frame(0.033, "SWORD_IDLE", 0.033),
      frame(0.067, "SWORD_IDLE", 0.067),
      frame(0.1, "ROLL", 0),
      frame(0.133, "ROLL", 0.04),
      frame(0.167, "ROLL", 0.08),
      frame(0.2, "SWORD_IDLE", 0),
      frame(0.233, "SWORD_IDLE", 0.033),
      frame(0.267, "SWORD_IDLE", 0.067),
    ] };
    const runs = extractRenderedRuns(telemetry, "player");
    expect(runs.map(({ id }) => id)).toEqual([
      "player:01:SWORD_IDLE#1",
      "player:02:ROLL#1",
      "player:03:SWORD_IDLE#2",
    ]);
    expect(buildRunEdges(runs).map(({ id }) => id)).toEqual([
      "player:01:SWORD_IDLE#1->ROLL#1",
      "player:02:ROLL#1->SWORD_IDLE#2",
    ]);
  });

  it("requires the exact complete path and rejects detours or re-entry", () => {
    const samples = (states) => states.flatMap((state, runIndex) => (
      [0, 1, 2].map((offset) => frame(runIndex * 0.15 + offset / 30, state, offset / 30))
    ));
    const requiredRuns = ["SWORD_IDLE", "RIPOSTE", "CRITICAL_KNOCKDOWN", "SWORD_IDLE"];
    expect(compareRenderedRunPath({
      telemetry: { visualFrames: samples(requiredRuns) },
      actor: "player",
      requiredRuns,
    }).pass).toBe(true);

    const detour = compareRenderedRunPath({
      telemetry: { visualFrames: samples(["SWORD_IDLE", "RIPOSTE", "GUARD", "CRITICAL_KNOCKDOWN", "SWORD_IDLE"]) },
      actor: "player",
      requiredRuns,
    });
    expect(detour.pass).toBe(false);
    expect(detour.failures.join(" ")).toMatch(/expected CRITICAL_KNOCKDOWN, observed GUARD|unexpected rendered run/);

    const reentry = compareRenderedRunPath({
      telemetry: { visualFrames: samples(["SWORD_IDLE", "RIPOSTE", "SWORD_IDLE", "RIPOSTE", "CRITICAL_KNOCKDOWN", "SWORD_IDLE"]) },
      actor: "player",
      requiredRuns,
    });
    expect(reentry.pass).toBe(false);
    expect(reentry.failures.join(" ")).toMatch(/expected CRITICAL_KNOCKDOWN, observed SWORD_IDLE|unexpected rendered run/);
  });

  it("enforces sample, duration, source-span, and continuity minima", () => {
    const telemetry = { visualFrames: [
      frame(0, "ROLL", 0),
      frame(0.2, "ROLL", 0.02),
    ] };
    const result = compareRenderedRunPath({
      telemetry,
      actor: "player",
      requiredRuns: [{
        state: "ROLL",
        minSamples: 3,
        minDurationSeconds: 0.3,
        minClipSpanSeconds: 0.2,
      }],
    });
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/rendered samples/);
    expect(result.failures.join(" ")).toMatch(/lasts/);
    expect(result.failures.join(" ")).toMatch(/source time/);
    expect(result.failures.join(" ")).toMatch(/frame gap/);
  });

  it("does not misclassify a looping clip-time wrap as a command restart", () => {
    const telemetry = { visualFrames: [
      frame(0, "RUN", 0.58),
      frame(0.033, "RUN", 0.61),
      frame(0.067, "RUN", 0.01),
      frame(0.1, "RUN", 0.04),
    ] };
    expect(extractRenderedRuns(telemetry, "player")).toHaveLength(1);
  });

  it("splits and reviews a deliberate same-semantic command restart", () => {
    const telemetry = { visualFrames: [
      frame(0, "CRITICAL_KNOCKDOWN", 1.38, null, 4),
      frame(0.033, "CRITICAL_KNOCKDOWN", 1.41, null, 4),
      frame(0.067, "CRITICAL_KNOCKDOWN", 1.433, null, 5),
      frame(0.1, "CRITICAL_KNOCKDOWN", 1.466, null, 5),
    ] };
    const runs = extractRenderedRuns(telemetry, "player");
    expect(runs.map(({ state, occurrence, commandSerial }) => ({ state, occurrence, commandSerial })))
      .toEqual([
        { state: "CRITICAL_KNOCKDOWN", occurrence: 1, commandSerial: 4 },
        { state: "CRITICAL_KNOCKDOWN", occurrence: 2, commandSerial: 5 },
      ]);
    expect(buildRunTransitionSegments(runs, 0.2)).toMatchObject([{
      reviewId: "edge:player:01:CRITICAL_KNOCKDOWN#1->CRITICAL_KNOCKDOWN#2",
      fromCommandSerial: 4,
      toCommandSerial: 5,
    }]);
  });

  it("creates a distinct checklist id for every run chunk", () => {
    const runs = extractRenderedRuns({ visualFrames: [
      frame(0, "RUN", 0),
      frame(0.5, "RUN", 0.5),
      frame(1, "RUN", 0.37),
      frame(1.5, "RUN", 0.24),
      frame(1.9, "RUN", 0.01),
    ] }, "player");
    const segments = buildRunEvidenceSegments(runs, 2);
    expect(segments.map(({ reviewId }) => reviewId)).toEqual([
      "run:player:01:RUN#1:part:1-of-2",
      "run:player:01:RUN#1:part:2-of-2",
    ]);
  });

  it("balances a barely-over-boundary run without inventing a sub-frame tail", () => {
    const segments = buildRunEvidenceSegments([{
      id: "enemy:05:SWORD_IDLE#3",
      actor: "enemy",
      index: 4,
      state: "SWORD_IDLE",
      occurrence: 3,
      commandSerial: 5,
      start: 4.1,
      end: 7.067,
      samples: 90,
    }], 7.067);

    expect(segments).toHaveLength(4);
    expect(segments[0].start).toBe(4.05);
    expect(segments.at(-1).end).toBe(7.067);
    expect(segments.every(({ duration }) => duration > 0.7 && duration <= 1)).toBe(true);
    expect(segments.every(({ start, end, duration }) => duration === Number((end - start).toFixed(3))))
      .toBe(true);
  });

  it("fails exact validation when command serial evidence is absent", () => {
    const result = compareRenderedRunPath({
      telemetry: { visualFrames: [{ time: 0, player: { animation: "ROLL", clipTime: 0 } }] },
      actor: "player",
      requiredRuns: [{ state: "ROLL", minSamples: 1 }],
    });
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/missing commandSerial/);
  });
});
