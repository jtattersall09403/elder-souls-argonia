import { describe, expect, it } from "vitest";

import { canBackstabState } from "./backstab";

describe("backstab state eligibility", () => {
  it("allows a backstab while an enemy is attacking", () => {
    expect(canBackstabState("attack")).toBe(true);
    expect(canBackstabState("shoot")).toBe(true);
  });

  it("does not interrupt committed reactions or death", () => {
    expect(canBackstabState("critical")).toBe(false);
    expect(canBackstabState("parried")).toBe(false);
    expect(canBackstabState("dead")).toBe(false);
  });
});
