import { describe, expect, it } from "vitest";
import { overlayLoadPlan } from "./overlayLoad";

describe("overlayLoadPlan", () => {
  const known = ["rivers", "danger", "mist"];
  it("loads only layers that are on, not loaded and not in flight", () => {
    const plan = overlayLoadPlan({ rivers: true, danger: true, mist: false }, ["rivers"], [], known);
    expect(plan).toEqual({ load: ["danger"], release: [] });
    expect(overlayLoadPlan({ danger: true }, [], ["danger"], known).load).toEqual([]);
  });
  it("releases loaded layers that are switched off", () => {
    expect(overlayLoadPlan({ rivers: false, mist: true }, ["rivers", "mist"], [], known))
      .toEqual({ load: [], release: ["rivers"] });
  });
  it("loads nothing on mount when every layer is off", () => {
    expect(overlayLoadPlan({}, [], [], known)).toEqual({ load: [], release: [] });
  });
});
