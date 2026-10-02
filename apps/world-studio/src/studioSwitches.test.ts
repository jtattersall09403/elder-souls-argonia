import { describe, expect, it } from "vitest";
import { parseStudioSwitches } from "./studioSwitches";

describe("parseStudioSwitches", () => {
  it("defaults to no switches", () => {
    expect(parseStudioSwitches("?view=character")).toEqual({ obuf8: false, tone0: false, msaa0: false, refr: null });
  });
  it("reads obuf, tone and refr", () => {
    expect(parseStudioSwitches("?obuf=8&tone=0&refr=0.5&msaa=0")).toEqual({ obuf8: true, tone0: true, msaa0: true, refr: 0.5 });
  });
  it("ignores refr=0 and junk", () => {
    expect(parseStudioSwitches("?refr=0").refr).toBeNull();
    expect(parseStudioSwitches("?refr=abc").refr).toBeNull();
  });
});
