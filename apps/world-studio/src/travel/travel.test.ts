import { describe, expect, it } from "vitest";
import { evaluatePredicate, type WorldStateReader } from "@elder-souls/game-core/travel/travelServices";
import { createStudioWorldState } from "./studioWorldState";
import { nearestSocket, TALK_RADIUS_M, type SocketPoint } from "./nearestSocket";

const socketAt = (id: string, x: number, z: number): SocketPoint => ({
  serviceId: id, stationId: `station.${id}`, positionM: [x, z], role: "ferryman",
});

describe("the studio WorldStateReader", () => {
  const world: WorldStateReader = createStudioWorldState();

  it("answers every question the contract can ask", () => {
    expect(typeof world.weather()).toBe("string");
    expect(typeof world.season()).toBe("string");
    expect(world.placeStance("place.anything")).toBe("neutral");
    expect(world.carriedValue()).toBe(0);
  });

  it("reports a season the record's gates use", () => {
    expect(["wet", "dry"]).toContain(world.season());
  });

  it("feeds the contract's predicates without throwing", () => {
    expect(typeof evaluatePredicate({ predicate: "weatherIs", is: "storm" }, world)).toBe("boolean");
    expect(evaluatePredicate({ predicate: "placeStanceIs", place: "place.x", is: "neutral" }, world)).toBe(true);
    expect(evaluatePredicate({ predicate: "carriedValueAtLeast", value: 400 }, world)).toBe(false);
  });
});

describe("the prompt-distance rule", () => {
  const sockets = [socketAt("a", 100, 100), socketAt("b", 103, 100), socketAt("c", 500, 500)];

  it("finds nothing when the character stands away from every socket", () => {
    expect(nearestSocket(sockets, 0, 0)).toBeNull();
  });

  it("prompts inside four metres and not outside it", () => {
    expect(nearestSocket(sockets, 100, 103.9)?.serviceId).toBe("a");
    expect(nearestSocket(sockets, 100, 104.1)).toBeNull();
    expect(TALK_RADIUS_M).toBe(4);
  });

  it("takes the nearest when two are in range", () => {
    expect(nearestSocket(sockets, 102.5, 100)?.serviceId).toBe("b");
    expect(nearestSocket(sockets, 101, 100)?.serviceId).toBe("a");
  });
});
