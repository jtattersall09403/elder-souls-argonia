import { describe, expect, it } from "vitest";
import { InteractionArbiter, pickCandidate, type InteractionCandidate } from "./arbiter";

const door: InteractionCandidate = {
  id: "door.a", kind: "door", positionM: [10, 0], reachM: 1.5, promptTextId: "text.door.prompt-enter",
};
const socket: InteractionCandidate = {
  id: "travel.ferry", kind: "travel", positionM: [11.5, 0], reachM: 3, promptTextId: "text.travel.prompt-talk",
};

describe("InteractionArbiter", () => {
  it("a door and a socket both in reach: only the nearer answers the press", () => {
    const arbiter = new InteractionArbiter();
    arbiter.offer(socket);
    arbiter.offer(door);
    arbiter.resolve({ x: 10.5, z: 0 }, true);     // door 0.5 m, socket 1.0 m
    expect(arbiter.focused?.id).toBe("door.a");
    expect(arbiter.answers("door.a")).toBe(true);
    expect(arbiter.answers("travel.ferry")).toBe(false);
    expect(arbiter.answers("door.a")).toBe(false);          // answered once

    arbiter.offer(door);
    arbiter.offer(socket);
    arbiter.resolve({ x: 11.2, z: 0 }, true);     // door 1.2 m, socket 0.3 m
    expect(arbiter.answers("travel.ferry")).toBe(true);
    expect(arbiter.answers("door.a")).toBe(false);
    expect(arbiter.isFocused("door.a")).toBe(false);
  });

  it("nothing in reach: no focus, and the press goes nowhere", () => {
    const arbiter = new InteractionArbiter();
    arbiter.offer(door);
    arbiter.offer(socket);
    arbiter.resolve({ x: 30, z: 0 }, true);
    expect(arbiter.focused).toBeNull();
    expect(arbiter.activated).toBeNull();
    expect(arbiter.answers("door.a")).toBe(false);
    expect(arbiter.answers("travel.ferry")).toBe(false);
  });

  it("each candidate's own reach decides: a nearer thing out of its reach loses to a farther one in reach", () => {
    // player at 12: door 2.0 m (reach 1.5, out), socket 0.5 m
    expect(pickCandidate([door, socket], 12, 0)?.id).toBe("travel.ferry");
    // at 8.4: door 1.6 m out of its reach, socket 3.1 m out of its reach
    expect(pickCandidate([door, socket], 8.4, 0)).toBeNull();
  });

  it("the focus shows without a press, and a press answers only on the frame it lands", () => {
    const arbiter = new InteractionArbiter();
    arbiter.offer(door);
    arbiter.resolve({ x: 10, z: 0 }, false);
    expect(arbiter.isFocused("door.a")).toBe(true);
    expect(arbiter.answers("door.a")).toBe(false);
    // offers are per frame: nothing offered, nothing focused
    arbiter.resolve({ x: 10, z: 0 }, true);
    expect(arbiter.focused).toBeNull();
  });

  it("equal distances break on the id, whatever the offer order", () => {
    const a = { ...door, id: "b.second", positionM: [1, 0] as const };
    const b = { ...door, id: "a.first", positionM: [-1, 0] as const };
    expect(pickCandidate([a, b], 0, 0)?.id).toBe("a.first");
    expect(pickCandidate([b, a], 0, 0)?.id).toBe("a.first");
  });
});
