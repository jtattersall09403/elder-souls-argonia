import { describe, expect, it } from "vitest";
import { inspectSettlementNavigation } from "./settlementNavigationHandoff";

describe("settlement navigation hand-off", () => {
  it("keeps well-formed exported cuts and links visibly blocked until a runtime consumes them", () => {
    expect(inspectSettlementNavigation({
      navmeshCuts: [{
        id: "navcut.house", placementId: "house", order: 3,
        polygonM: [[0, 0], [4, 0], [4, 4], [0, 4]],
      }],
      navmeshLinks: [{
        id: "navlink.house.deck", placementId: "house", kind: "deck-to-ground",
        bidirectional: true,
      }],
    })).toEqual({
      status: "blocked-no-navigation-runtime", cuts: 1, links: 1, errors: [],
    });
  });

  it("rejects malformed polygons and links that do not belong to a cut building", () => {
    const result = inspectSettlementNavigation({
      navmeshCuts: [{
        id: "navcut.house", placementId: "house", order: 3,
        polygonM: [[0, 0], [4, 0]],
      }],
      navmeshLinks: [{
        id: "navlink.other.deck", placementId: "other", kind: "deck-to-ground",
        bidirectional: true,
      }],
    });
    expect(result.status).toBe("invalid-export");
    expect(result.errors).toContain("navmeshCuts[0] has no valid footprint polygon");
    expect(result.errors).toContain("navmeshLinks[0] does not name a cut placement");
  });

  it("does not silently accept a bundle with no building cuts", () => {
    expect(inspectSettlementNavigation({ navmeshCuts: [], navmeshLinks: [] }).status)
      .toBe("missing-export");
  });
});
