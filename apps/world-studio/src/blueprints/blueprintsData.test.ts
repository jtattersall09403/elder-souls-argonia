/** The Blueprint view's parsing, drawing conventions and URL round-trip. */
import { describe, expect, it } from "vitest";
import {
  AREA_WHY_KEYS, blueprintBounds, compassDeg, encodeBlueprintUrl, findBlueprint,
  groundFitFill, kitFill, loadBlueprints, parseBlueprintUrl, polyPath, scaleBarMetres,
  shortName, toggleIn, wayStyle, WHY_HEADINGS,
  type Blueprint, type BlueprintBundle, type BpWhy,
} from "./blueprintsData";

/** A fully written why block, for the fixtures. */
function why(): BpWhy {
  return {
    what: "a fisher's stilt house",
    whyHere: "the village lives off the shrimp runs in this bay",
    whySpot: "the one bank firm enough to take piles at this water line",
    whyNeighbours: "it shares a landing with the two houses either side",
    playerPurpose: "the first door a player can knock on from the water",
    microGeography: "it stands off a half-metre fall onto the tide flat",
  };
}

function makeBlueprint(id = "place.hist-heartland.nine-trunks"): Blueprint {
  return {
    id,
    seed: id,
    causalModel: { founding: "nine root-joined trunks in one ring" },
    boundary: [[100, 200], [140, 200], [140, 240], [100, 240]],
    districts: [{
      id: "district.nine-trunks.ring", kind: "residential", cultureKit: "argonian-root",
      wealth: "middling", notes: "the ring itself", why: why(),
      polygon: [[110, 210], [130, 210], [130, 230], [110, 230]], centreM: [120, 220],
    }],
    parcels: [{
      id: "parcel.nine-trunks.trunk-1", districtId: "district.nine-trunks.ring", use: "dwelling",
      buildingFamily: "argonian-trunk-house", assetRef: "bmv:architecture/housetronc001",
      groundFit: "dug-in", yawDeg: 180, orientationWhy: "door onto the clearing", notes: null,
      spans: null, interior: { kind: "dwelling", assetRef: "bmv:interior/tronc01" }, why: why(),
      polygon: [[112, 212], [120, 212], [120, 220], [112, 220]], centreM: [116, 216],
    }],
    ways: [{
      id: "route.nine-trunks.approach", group: "routes", kind: "road", widthM: 3,
      assetRef: null, routing: "terrain", endsAt: ["parcel.nine-trunks.trunk-1"],
      why: "the only dry line in from the road", notes: null,
      via: [[100, 240], [116, 224]], points: [[100, 240], [108, 232], [116, 224]],
    }, {
      id: "fence.nine-trunks.pale", group: "fences", kind: "palisade", widthM: 0.4,
      assetRef: "kit:palisade01", routing: "straight", endsAt: [],
      why: "it closes the ring against the marsh", notes: null,
      via: [[110, 210], [130, 210]], points: [[110, 210], [130, 210]],
    }],
    landmarks: [{ id: "landmark.nine-trunks.root-join-1", kind: "hist-root", assetRef: "htbm:histroots02", why: why(), notes: null, positionM: [125, 218] }],
    docks: [{ id: "dock.nine-trunks.landing", waterBodyId: "water.channel.nine-trunks", piledToBed: true, why: why(), notes: null, positionM: [104, 222] }],
    doors: [{
      id: "door.hist-heartland.nine-trunks.1", parcelId: "parcel.nine-trunks.trunk-1", facingDeg: 180,
      thresholdM: [116, 220], interiorClaim: { sizeClass: "large", culture: "argonian", owner: "the naheesh" },
    }],
    combatSpaces: [{ id: "combat.nine-trunks.clearing", clearanceClass: "open",
      why: "the night attack in the local quest happens in the ring", notes: null, polygon: [[118, 218], [126, 218], [126, 226], [118, 226]] }],
    questSockets: [{ id: "socket.nine-trunks.pitch-ledger", kind: "station", parcelId: null, ownerQuestTier: 3, notes: null, positionM: [122, 232] }],
    approaches: [{
      id: "approach.nine-trunks.road", mode: "walk", fromRouteId: "route.nine-trunks.approach",
      fromDirection: null, firstSeen: "landmark.nine-trunks.root-join-1",
      sequence: "the root join clears the canopy first, then the trunk doors",
      wayfinding: "follow the root join to the ring and turn left at the landing",
      notes: null,
    }],
    scaleGrounding: {
      loreSource: "UESP: Nine-Trunks", population: "40-60", households: 12,
      buildingsPlanned: 1, npcsPlanned: 24, why: "one ring of root houses, no outliers",
    },
    contextM: { x0: -1400, z0: -1300, x1: 1640, z1: 1740 },
    clearance: { hardClear: [[[105, 205], [135, 205], [135, 235], [105, 235]]], thinned: [], kept: [{ id: "kept.nine-trunks.shade-1", kind: "shade", notes: null, positionM: [131, 233] }] },
    siting: {
      dossier: "world/sources/sites/dossiers/nine-trunks.json",
      candidates: [
        { id: "candidate.nine-trunks.knoll", chosen: true, why: "firm-lowland knoll", rejectedBecause: null, positionM: [120, 220] },
        { id: "candidate.nine-trunks.bank", chosen: false, why: null, rejectedBecause: "floods in the wet season", positionM: [95, 250] },
      ],
    },
    budget: { maxInstances: 700 },
    provision: { quests: ["quest.local.lh51"] },
    assetConstraints: ["grown-root kit only inside the ring"],
    terrain: { image: "province/blueprints/place.hist-heartland.nine-trunks.png", x0: 90, z0: 190, x1: 150, z1: 250, pxM: 3.65568 },
    summary: { districts: 1, parcels: 1 },
  };
}

function makeBundle(): BlueprintBundle {
  return {
    schemaVersion: 2, source: "worldgen.export_blueprints", units: "world metres",
    provinceExtentM: 7373.51, layers: ["map", "context", "terrain", "districts", "parcels"],
    blueprints: [makeBlueprint("place.a.alpha"), makeBlueprint()],
  };
}

describe("loadBlueprints", () => {
  const withFetch = async (impl: typeof fetch, run: () => Promise<void>) => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try { await run(); } finally { globalThis.fetch = original; }
  };

  it("returns the bundle when the export is present", async () => {
    const bundle = makeBundle();
    await withFetch((() => Promise.resolve(new Response(JSON.stringify(bundle), {
      status: 200, headers: { "content-type": "application/json" },
    }))) as typeof fetch, async () => {
      expect((await loadBlueprints("/")).blueprints).toHaveLength(2);
    });
  });

  it("names the exporter when the schema is a different version", async () => {
    await withFetch((() => Promise.resolve(new Response(JSON.stringify({ ...makeBundle(), schemaVersion: 99 }), {
      status: 200, headers: { "content-type": "application/json" },
    }))) as typeof fetch, async () => {
      await expect(loadBlueprints("/")).rejects.toThrow(/export_blueprints/);
    });
  });

  it("treats Vite's index.html fallback as a missing export", async () => {
    await withFetch((() => Promise.resolve(new Response("<!doctype html>", {
      status: 200, headers: { "content-type": "text/html" },
    }))) as typeof fetch, async () => {
      await expect(loadBlueprints("/")).rejects.toThrow(/export_blueprints/);
    });
  });
});

describe("findBlueprint", () => {
  it("falls back to the first entry with no id", () => {
    expect(findBlueprint(makeBundle(), null)?.id).toBe("place.a.alpha");
  });
  it("matches the full id and the bare slug", () => {
    expect(findBlueprint(makeBundle(), "place.hist-heartland.nine-trunks")?.id).toBe("place.hist-heartland.nine-trunks");
    expect(findBlueprint(makeBundle(), "nine-trunks")?.id).toBe("place.hist-heartland.nine-trunks");
  });
  it("is null with no bundle", () => {
    expect(findBlueprint(null, "nine-trunks")).toBeNull();
  });
});

describe("bounds and paths", () => {
  it("covers every drawn class, terrain included, with padding", () => {
    const b = blueprintBounds(makeBlueprint());
    expect(b.x0).toBeLessThan(90);      // terrain crop is the outermost thing
    expect(b.x1).toBeGreaterThan(150);
    expect(b.z0).toBeLessThan(190);
    expect(b.z1).toBeGreaterThan(250);
  });

  it("survives a blueprint with no geometry at all", () => {
    const empty = { ...makeBlueprint(), boundary: null, districts: [], parcels: [], ways: [],
      landmarks: [], docks: [], doors: [], combatSpaces: [], questSockets: [],
      approaches: [{
      id: "approach.nine-trunks.road", mode: "walk", fromRouteId: "route.nine-trunks.approach",
      fromDirection: null, firstSeen: "landmark.nine-trunks.root-join-1",
      sequence: "the root join clears the canopy first, then the trunk doors",
      wayfinding: "follow the root join to the ring and turn left at the landing",
      notes: null,
    }],
    scaleGrounding: {
      loreSource: "UESP: Nine-Trunks", population: "40-60", households: 12,
      buildingsPlanned: 1, npcsPlanned: 24, why: "one ring of root houses, no outliers",
    },
    contextM: { x0: -1400, z0: -1300, x1: 1640, z1: 1740 },
    clearance: { hardClear: [], thinned: [], kept: [] }, siting: null, terrain: null };
    expect(blueprintBounds(empty)).toEqual({ x0: 0, z0: 0, x1: 100, z1: 100 });
  });

  it("writes closed and open paths in metre space", () => {
    expect(polyPath([[1, 2], [3, 4]])).toBe("M1.00 2.00 L3.00 4.00 Z");
    expect(polyPath([[1, 2], [3, 4]], false)).toBe("M1.00 2.00 L3.00 4.00");
    expect(polyPath([])).toBe("");
  });
});

describe("drawing conventions", () => {
  it("tints a district by its kit set and a parcel by its ground fit", () => {
    expect(kitFill("argonian-root")).toBe("#2e6b45");
    expect(kitFill("dunmer-hlaalu")).not.toBe(kitFill("imperial"));
    expect(groundFitFill("stilt")).toBe("#9fc6d8");
  });
  it("falls back to a neutral colour for an unknown kit or fit", () => {
    expect(kitFill("something-new")).toBe("#6b7280");
    expect(groundFitFill(null)).toBe("#b9b9b9");
  });
  it("picks a round scale bar of roughly 120 px", () => {
    for (const pxPerM of [0.4, 1, 3, 12, 40]) {
      const m = scaleBarMetres(pxPerM);
      expect(String(m).replace(/[.0]/g, "").replace(/^$/, "1")).toMatch(/^[125]$/);
      expect(m * pxPerM).toBeGreaterThan(20);
      expect(m * pxPerM).toBeLessThanOrEqual(130);
    }
  });
  it("shortens an id to its last segment", () => {
    expect(shortName("parcel.nine-trunks.trunk-1")).toBe("trunk 1");
  });
});

describe("URL round-trip", () => {
  it("emits nothing for a fresh view", () => {
    expect(encodeBlueprintUrl({ blueprintId: null, selectedId: null, hidden: new Set() })).toEqual({});
  });

  it("round-trips the blueprint, the selection and the hidden layers", () => {
    const state = {
      blueprintId: "place.hist-heartland.nine-trunks",
      selectedId: "parcel.nine-trunks.trunk-1",
      hidden: new Set(["terrain", "clearance"]),
    };
    const q = new URLSearchParams(encodeBlueprintUrl(state));
    const back = parseBlueprintUrl(q);
    expect(back.blueprintId).toBe(state.blueprintId);
    expect(back.selectedId).toBe(state.selectedId);
    expect([...back.hidden].sort()).toEqual(["clearance", "terrain"]);
  });

  it("reads an empty query as everything shown", () => {
    const s = parseBlueprintUrl(new URLSearchParams(""));
    expect(s).toEqual({ blueprintId: null, selectedId: null, hidden: new Set() });
  });

  it("toggles a layer without mutating the old set", () => {
    const a = new Set(["terrain"]);
    const b = toggleIn(a, "parcels");
    expect([...a]).toEqual(["terrain"]);
    expect([...b].sort()).toEqual(["parcels", "terrain"]);
    expect([...toggleIn(b, "terrain")]).toEqual(["parcels"]);
  });
});

// ---------------------------------------------------------------------------
// Round 2 (owner 2026-09-05): the whys, the new line styles, the context box
// ---------------------------------------------------------------------------

describe("the why block", () => {
  it("reads in the owner's heading order, ground last", () => {
    expect(WHY_HEADINGS.map(([, label]) => label)).toEqual([
      "What it is",
      "Why it is in this place",
      "Why this spot",
      "Why it sits with its neighbours",
      "What it gives the player",
      "How it uses the ground",
    ]);
  });

  it("drops only 'why this spot' for a whole-area record", () => {
    const shown = WHY_HEADINGS.filter(([k]) => AREA_WHY_KEYS.has(k)).map(([k]) => k);
    expect(shown).not.toContain("whySpot");
    expect(shown).toHaveLength(WHY_HEADINGS.length - 1);
  });

  it("carries every heading on a parcel, so a gap is visible per heading", () => {
    const parcel = makeBlueprint().parcels[0];
    for (const [k] of WHY_HEADINGS) expect(parcel.why?.[k]).toBeTruthy();
  });

  it("keeps a null key when the author has not written it yet", () => {
    const partial: BpWhy = { ...why(), whySpot: null };
    expect(partial.what).toBeTruthy();
    expect(partial.whySpot).toBeNull();     // the view shows this one in red
  });
});

describe("way styles", () => {
  it("tells a dredged channel from a cut canal", () => {
    expect(wayStyle("canals", "channel")).not.toEqual(wayStyle("canals", "canal"));
    expect(wayStyle("canals", "channel").dash).toBeDefined();
  });

  it("gives every fence kind its own line", () => {
    const kinds = ["fence", "wall", "palisade", "hedge"];
    const seen = kinds.map((k) => JSON.stringify(wayStyle("fences", k)));
    expect(new Set(seen).size).toBe(kinds.length);
  });

  it("draws fences as hairlines so a 0.3 m pale does not vanish", () => {
    expect(wayStyle("fences", "palisade").hairline).toBe(true);
    expect(wayStyle("routes", "road").hairline).toBeFalsy();
  });

  it("falls back to the group for an unknown kind", () => {
    expect(wayStyle("boardwalks", "gangway")).toEqual(wayStyle("boardwalks", null));
  });
});

describe("approach bearings", () => {
  it("reads compass words and abbreviations", () => {
    expect(compassDeg("north")).toBe(0);
    expect(compassDeg("south-west")).toBe(225);
    expect(compassDeg("NE")).toBe(45);
  });
  it("is null when the approach names no direction", () => {
    expect(compassDeg(null)).toBeNull();
    expect(compassDeg("from the landing")).toBeNull();
  });
});

describe("the map context box", () => {
  it("opens out well beyond the blueprint, so neighbours are on screen", () => {
    const bp = makeBlueprint();
    const b = blueprintBounds(bp);
    expect(bp.contextM.x0).toBeLessThan(b.x0);
    expect(bp.contextM.x1).toBeGreaterThan(b.x1);
    expect(bp.contextM.z0).toBeLessThan(b.z0);
    expect(bp.contextM.z1).toBeGreaterThan(b.z1);
  });

  it("does not widen the fit — the view still opens on the blueprint", () => {
    expect(blueprintBounds(makeBlueprint()).x1).toBeLessThan(200);
  });
});

describe("the new drawn fields", () => {
  it("keeps a way's authored waypoints alongside its routed line", () => {
    const road = makeBlueprint().ways[0];
    expect(road.via).toHaveLength(2);
    expect(road.points.length).toBeGreaterThan(road.via!.length);
    expect(road.endsAt).toEqual(["parcel.nine-trunks.trunk-1"]);
  });

  it("carries a fence with its kit piece", () => {
    const fence = makeBlueprint().ways.find((w) => w.group === "fences");
    expect(fence?.kind).toBe("palisade");
    expect(fence?.assetRef).toBeTruthy();
  });

  it("carries the approach and the scale grounding the panel reads", () => {
    const bp = makeBlueprint();
    expect(bp.approaches[0].firstSeen).toBe("landmark.nine-trunks.root-join-1");
    expect(bp.approaches[0].wayfinding).toBeTruthy();
    expect(bp.scaleGrounding?.households).toBe(12);
  });
});
