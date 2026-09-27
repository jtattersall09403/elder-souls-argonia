import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSettlementSockets } from "./sockets";
import { SETTLEMENT_SOCKET_KINDS } from "./types";

const base = { positionM: [1, 2, 3], yawDeg: 0, parcelId: "p", interiorCell: null, host: null, why: "w" };
const idle = { ...base, id: "idle.work", kind: "idle", activity: "work-at" };
const home = { ...base, id: "idle.home", kind: "idle", activity: "sleep" };
const npc = {
  ...base, id: "npc.keeper", kind: "npc", rosterSlotId: "well-keeper",
  schedule: [
    { dayPhase: "morning", socketId: "idle.work", purpose: "work" },
    { dayPhase: "night", socketId: "idle.home", purpose: "home" },
  ],
};
const barrel = { ...base, id: "yard.barrel", kind: "container", containerClass: "barrel", fillRule: "blanket.household-barrel" };

describe("parseSettlementSockets", () => {
  it("reads a well-formed record and an older entry with none", () => {
    const got = parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [idle, home, npc, barrel] });
    expect(got.map((s) => s.kind)).toEqual(["idle", "idle", "npc", "container"]);
    expect(parseSettlementSockets({ id: "s" })).toEqual([]);
  });

  it("refuses a skewed version, a bad socket, a duplicate id and a schedule naming no idle socket", () => {
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 2, sockets: [] })).toThrow(/socketsSchemaVersion 2/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [{ ...idle, positionM: [1, 2] }] })).toThrow(/positionM/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [idle, idle] })).toThrow(/used twice/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [idle, npc] })).toThrow(/idle\.home, which is no idle socket/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [{ ...base, id: "x", kind: "loot" }] })).toThrow(/not a socket kind/);
  });

  it("keeps the socket kinds equal to the vocabulary record", () => {
    const vocab = JSON.parse(readFileSync(fileURLToPath(new URL(
      "../../../../world/sources/vocab/socket-vocabulary.json", import.meta.url)), "utf8"));
    expect([...SETTLEMENT_SOCKET_KINDS]).toEqual(vocab.socketKinds);
  });
});
