import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { socketsToDraw } from "./interiorSockets";
import type { SettlementSocket } from "../settlement/types";

const base = { yawDeg: 0, parcelId: null, host: null, why: "" };
const outside = { ...base, id: "socket.p.out", kind: "idle", activity: "stand", positionM: [4724, 4.4, 1881], interiorCell: null } as SettlementSocket;
const authoredIn = {
  ...base, id: "socket.p.in", kind: "idle", activity: "work-at", positionM: [102.9, 89.4, 55.7], interiorCell: "Cell",
  interact: { kind: "station", position: [102.9, 89.4, 55.7], facing: 90 },
} as SettlementSocket;
const cellOwn = { id: "socket.Cell.1", kind: "container", positionM: [100, 82, 50], yawDeg: 0, host: "Cell.1" };

describe("socket overlay (16k walk 6): interior sockets are drawn in the shown cell", () => {
  it("outside: only the place's outdoor sockets, clamped to the ground", () => {
    expect(socketsToDraw([outside, authoredIn], null)).toEqual([
      { id: "socket.p.out", kind: "idle", positionM: [4724, 4.4, 1881], clampToGround: true, interact: null }]);
  });

  it("inside: the cell's own sockets and the place's authored ones, moved by the cell origin, never clamped", () => {
    const got = socketsToDraw([outside, authoredIn], { cellId: "Cell", originM: [4700, 1000, 1900], sockets: [cellOwn, authoredIn] });
    expect(got.map((d) => d.id)).toEqual(["socket.p.in", "socket.Cell.1"]);
    expect(got[0].positionM).toEqual([4802.9, 1089.4, 1955.7]);
    expect(got[0].interact).toEqual({ kind: "station", positionM: [4802.9, 1089.4, 1955.7], facing: 90 });
    expect(got[1].positionM).toEqual([4800, 1082, 1950]);
    expect(got.every((d) => !d.clampToGround)).toBe(true);
    // another cell's sockets stay hidden
    expect(socketsToDraw([authoredIn], { cellId: "Other", originM: [0, 0, 0], sockets: [] })).toEqual([]);
  });

  it("every published cell draws all its sockets, each work socket with its interact point", () => {
    for (const cell of ["KeebaHouseCrafter", "DawnstarBrinasHouse"]) {
      const bundle = JSON.parse(readFileSync(new URL(
        `../../../../apps/world-studio/public/province/interiors/${cell}.json`, import.meta.url), "utf8"));
      const got = socketsToDraw([], { cellId: cell, originM: [0, 1000, 0], sockets: bundle.sockets });
      expect(got.length).toBe(bundle.sockets.length);
      expect(got.length).toBeGreaterThan(30);
      const work = bundle.sockets.filter((s: { kind: string; activity?: string }) => s.activity === "work-at" || s.kind === "station");
      expect(work.length).toBeGreaterThan(0);
      expect(got.filter((d) => d.interact).length).toBe(work.length);
    }
  });
});
