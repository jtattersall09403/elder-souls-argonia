import { describe, expect, it } from "vitest";
import {
  evaluatePredicate, indexTravelGraph, operatorSockets, resolveTrip, serviceMenu,
  type TravelServiceGraph, type WorldStateReader,
} from "./travelServices";

const graph: TravelServiceGraph = {
  schemaVersion: 1,
  stations: [
    { id: "ferry-landing.x.east", kind: "ferry-landing", positionM: [100, 200], status: "active" },
    { id: "ferry-landing.x.west", kind: "ferry-landing", positionM: [100, 290], status: "active" },
    { id: "station.a", kind: "place", placeId: "place.a", positionM: [0, 0], status: "active" },
    { id: "station.b", kind: "place", placeId: "place.b", positionM: [1000, 0], status: "active" },
    { id: "station.c", kind: "place", placeId: "place.c", positionM: [2000, 0], status: "active" },
  ],
  services: [
    {
      id: "ferry.x", serviceKind: "ferry", form: "road-crossing", status: "active",
      landings: ["ferry-landing.x.east", "ferry-landing.x.west"],
      hops: [{ from: "ferry-landing.x.east", to: "ferry-landing.x.west", follows: { road: "route.road.r" }, lengthM: 90 }],
      operator: { role: "barrier keeper", slotId: "ferry-slot.x", socket: { stationId: "ferry-landing.x.east" } },
      fare: { gold: 15, freeIf: [{ predicate: "placeStanceIs", place: "place.a", is: "friendly" }] },
      available: [{ predicate: "seasonIs", is: "wet" }],
      refusedIf: [{ predicate: "weatherIs", is: "storm" }],
      text: { name: "text.ferry.x.name", hail: "text.ferry.x.hail", refusal: "text.ferry.refused-weather" },
    },
    {
      id: "boat.a-c", serviceKind: "boat", form: "station-run", status: "active",
      stations: ["station.a", "station.b", "station.c"],
      hops: [
        { from: "station.a", to: "station.b", follows: { lane: "route.boat.a-b" }, lengthM: 1000 },
        { from: "station.b", to: "station.c", follows: { lane: "route.boat.b-c" }, lengthM: 1000 },
      ],
      operator: { role: "boat owner", slotId: "boat-slot.a", socket: { stationId: "station.a" } },
      fare: { gold: 5, freeIf: [] }, available: [], refusedIf: [],
      text: { name: "text.boat.a-c.name", hail: "text.boat.a-c.hail" },
    },
  ],
};

function world(over: Partial<WorldStateReader> = {}): WorldStateReader {
  return {
    placeStance: () => "neutral", weather: () => "clear", season: () => "wet", carriedValue: () => 0,
    owing: () => 0, ...over,
  };
}

describe("the talk-to-service contract", () => {
  it("indexes stations and sockets from the record", () => {
    const index = indexTravelGraph(graph);
    expect(index.servicesAtStation.get("station.b")?.map((s) => s.id)).toEqual(["boat.a-c"]);
    expect(operatorSockets(index).map((s) => s.stationId)).toEqual(["ferry-landing.x.east", "station.a"]);
  });

  it("refuses to index a service that names an unknown station", () => {
    const bad = { ...graph, services: [{ ...graph.services[0], landings: ["ferry-landing.x.east", "nowhere"] }] };
    expect(() => indexTravelGraph(bad)).toThrow(/unknown station/);
  });

  it("reads the Owing ledger for a region", () => {
    expect(evaluatePredicate({ predicate: "owingAtLeast", region: "imperial-penal-south", value: 500 }, world({ owing: () => 600 }))).toBe(true);
    expect(evaluatePredicate({ predicate: "owingAtLeast", region: "imperial-penal-south", value: 500 }, world())).toBe(false);
  });

  it("throws on a predicate outside the vocabulary it evaluates", () => {
    expect(() => evaluatePredicate({ predicate: "moonIsFull" }, world())).toThrow(/vocabulary/);
  });

  it("opens the menu with the fare, the destinations and the hop distance", () => {
    const index = indexTravelGraph(graph);
    const menu = serviceMenu(index, "boat.a-c", "station.a", world());
    expect(menu.fareGold).toBe(5);
    expect(menu.destinations.map((d) => [d.stationId, d.lengthM])).toEqual([["station.b", 1000], ["station.c", 2000]]);
  });

  it("refuses in a storm with the service's refusal text", () => {
    const index = indexTravelGraph(graph);
    const out = resolveTrip(index, "ferry.x", "ferry-landing.x.east", "ferry-landing.x.west", 100, world({ weather: () => "storm" }));
    expect(out).toEqual({ kind: "refused", textId: "text.ferry.refused-weather" });
  });

  it("is unavailable outside its season and free for a friend", () => {
    const index = indexTravelGraph(graph);
    expect(resolveTrip(index, "ferry.x", "ferry-landing.x.east", "ferry-landing.x.west", 100, world({ season: () => "dry" })))
      .toEqual({ kind: "unavailable" });
    const friend = world({ placeStance: () => "friendly" });
    expect(serviceMenu(index, "ferry.x", "ferry-landing.x.east", friend).fareGold).toBe(0);
  });

  it("takes the fare and arrives at the far landing, or cannot pay", () => {
    const index = indexTravelGraph(graph);
    expect(resolveTrip(index, "ferry.x", "ferry-landing.x.east", "ferry-landing.x.west", 20, world()))
      .toEqual({ kind: "arrive", fareGold: 15, stationId: "ferry-landing.x.west", positionM: [100, 290] });
    expect(resolveTrip(index, "ferry.x", "ferry-landing.x.east", "ferry-landing.x.west", 3, world()))
      .toEqual({ kind: "cannot-pay", fareGold: 15 });
  });
});
