import { describe, expect, it } from "vitest";
import { loadCatalogue, landformColour, placeLabel } from "./catalogueData";
import { FIXTURE_CATALOGUE } from "./fixturePlaces";

describe("plotted province map data", () => {
  it("falls back to the fixture while no places-*.json is committed", () => {
    const load = loadCatalogue(FIXTURE_CATALOGUE);
    // Either state is legal: real files present (isFixture false) or not.
    expect(load.places.length).toBeGreaterThan(0);
    if (load.isFixture) expect(load.regions).toBe(FIXTURE_CATALOGUE);
  });

  it("never invents a place id and always has something to label a dot with", () => {
    for (const p of loadCatalogue(FIXTURE_CATALOGUE).places) {
      expect(p.id).toMatch(/^place\.[a-z0-9-]+\.[a-z0-9-]+$/);
      expect(placeLabel(p).length).toBeGreaterThan(0);
    }
  });

  it("plots only sited places, and every sited place carries its whySiteWon", () => {
    for (const p of loadCatalogue(FIXTURE_CATALOGUE).places) {
      if (!p.position) continue;
      expect(p.position.u).toBeGreaterThanOrEqual(0);
      expect(p.position.u).toBeLessThanOrEqual(1);
      expect(p.position.v).toBeGreaterThanOrEqual(0);
      expect(p.position.v).toBeLessThanOrEqual(1);
      expect(p.whySiteWon, `${p.id} is plotted with no whySiteWon`).toBeTruthy();
    }
  });

  it("colours landform classes deterministically", () => {
    expect(landformColour(3, 24)).toBe(landformColour(3, 24));
    expect(landformColour(3, 24)).not.toBe(landformColour(4, 24));
  });
});
