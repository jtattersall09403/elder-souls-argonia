import { describe, expect, it } from "vitest";
import { parseTimeParam } from "./timeState";

describe("parseTimeParam", () => {
  it("reads HH:MM and a bare hour (probe and walk links use t=22)", () => {
    expect(parseTimeParam("22:30")).toBe(22 * 60 + 30);
    expect(parseTimeParam("22")).toBe(22 * 60);
    expect(parseTimeParam("7")).toBe(7 * 60);
  });
  it("rejects out-of-range and malformed values", () => {
    expect(parseTimeParam("24")).toBeNull();
    expect(parseTimeParam("22:5")).toBeNull();
    expect(parseTimeParam("night")).toBeNull();
    expect(parseTimeParam(null)).toBeNull();
  });
});
