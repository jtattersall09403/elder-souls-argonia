import { describe, expect, it } from "vitest";
import { evaluatePlayerHits } from "./visual-player-hits.mjs";

const expected = [{ attack: "light1", hand: "main", damage: 57.14, tolerance: 0.5 }];
const hit = (attack, damage, hand = "main") => ({ time: 1, attack, hand, damage, enemyHealthAfter: 150 - damage });

describe("evaluatePlayerHits", () => {
  it("passes the expected blow within its tolerance and reports it", () => {
    const result = evaluatePlayerHits("s", { playerHits: [hit("light1", 57.1429)] }, expected);
    expect(result.failures).toEqual([]);
    expect(result.measured).toEqual([{ attack: "light1", hand: "main", damage: 57.1429 }]);
  });

  it("fails a blow outside the tolerance", () => {
    expect(evaluatePlayerHits("s", { playerHits: [hit("light1", 19.05)] }, expected).failures.join(" "))
      .toMatch(/light1 damage 19.05, expected 57.14 ± 0.5/);
  });

  it("fails the wrong attack, a missing blow and an extra blow", () => {
    expect(evaluatePlayerHits("s", { playerHits: [hit("backstab", 57.14)] }, expected).failures.join(" ")).toMatch(/attack backstab, expected light1/);
    expect(evaluatePlayerHits("s", { playerHits: [] }, expected).failures.join(" ")).toMatch(/1 expected, 0 landed/);
    expect(evaluatePlayerHits("s", { playerHits: [hit("light1", 57.14), hit("light1", 57.14)] }, expected).failures.join(" ")).toMatch(/1 expected, 2 landed/);
    expect(evaluatePlayerHits("s", {}, expected).failures.join(" ")).toMatch(/no playerHits telemetry/);
  });
});
