import { describe, expect, it } from "vitest";
import { beaconNearFade, NEAR_FADE_END_M, NEAR_FADE_START_M } from "./CityMarkers";

describe("beaconNearFade", () => {
  it("hides the beam on the axis", () => expect(beaconNearFade(0)).toBe(0));
  it("hides the beam at the start distance", () => expect(beaconNearFade(NEAR_FADE_START_M)).toBe(0));
  it("shows the beam in full at the end distance", () => expect(beaconNearFade(NEAR_FADE_END_M)).toBe(1));
});
