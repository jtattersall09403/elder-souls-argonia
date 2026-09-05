/** The Blueprint view's parsing, drawing conventions and URL round-trip. */
import { describe, expect, it } from "vitest";
import {
  blueprintBounds, encodeBlueprintUrl, findBlueprint, groundFitFill, kitFill,
  loadBlueprints, parseBlueprintUrl, polyPath, scaleBarMetres, shortName, toggleIn,
  type Blueprint, type BlueprintBundle,
} from "./blueprintsData";

function makeBlueprint(id = "place.hist-heartland.nine-trunks"): Blueprint {
  return {
    id,
    seed: id,
    causalModel: { founding: "nine root-joined trunks in one ring" },
    boundary: [[100, 200], [140, 200], [140, 240], [100, 240]],
    districts: [{
      id: "district.nine-trunks.ring", kind: "residential", cultureKit: "argonian-root",
      wealth: "middling", notes: "the ring itself",
      polygon: [[110, 210], [130, 210], [130, 230], [110, 230]], centreM: [120, 220],
    }],
    parcels: [{
      id: "parcel.nine-trunks.trunk-1", districtId: "district.nine-trunks.ring", use: "dwelling",
      buildingFamily: "argonian-trunk-house", assetRef: "bmv:architecture/housetronc001",
      groundFit: "dug-in", yawDeg: 180, orientationWhy: "door onto the clearing", notes: null,
      polygon: [[112, 212], [120, 212], [120, 220], [112, 220]], centreM: [116, 216],
    }],
    ways: [{ id: "route.nine-trunks.approach", group: "routes", kind: "road", widthM: 3, notes: null, points: [[100, 240], [116, 224]] }],
    landmarks: [{ id: "landmark.nine-trunks.root-join-1", kind: "hist-root", assetRef: "htbm:histroots02", notes: null, positionM: [125, 218] }],
    docks: [{ id: "dock.nine-trunks.landing", waterBodyId: "water.channel.nine-trunks", piledToBed: true, notes: null, positionM: [104, 222] }],
    doors: [{
      id: "door.hist-heartland.nine-trunks.1", parcelId: "parcel.nine-trunks.trunk-1", facingDeg: 180,
      thresholdM: [116, 220], interiorClaim: { sizeClass: "large", culture: "argonian", owner: "the naheesh" },
    }],
    combatSpaces: [{ id: "combat.nine-trunks.clearing", clearanceClass: "open", notes: null, polygon: [[118, 218], [126, 218], [126, 226], [118, 226]] }],
    questSockets: [{ id: "socket.nine-trunks.pitch-ledger", kind: "station", parcelId: null, ownerQuestTier: 3, notes: null, positionM: [122, 232] }],
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
    schemaVersion: 1, source: "worldgen.export_blueprints", units: "world metres",
    provinceExtentM: 7373.51, layers: ["terrain", "districts", "parcels"],
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
