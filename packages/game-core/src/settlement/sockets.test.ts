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
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 3, sockets: [] })).toThrow(/socketsSchemaVersion 3/);
    // schema 2 (decision 0113): a work socket carries its interact point, well formed
    const forge = { ...base, id: "station.forge", kind: "station", stationClass: "forge" };
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 2, sockets: [forge] })).toThrow(/no interact point/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 2,
      sockets: [{ ...forge, interact: { kind: "queue", position: [0, 0, 0], facing: 0 } }] })).toThrow(/interact is not/);
    expect(parseSettlementSockets({ id: "s", socketsSchemaVersion: 2,
      sockets: [{ ...forge, interact: { kind: "station", position: [1, 2, 3], facing: 90 } }] })).toHaveLength(1);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [{ ...idle, positionM: [1, 2] }] })).toThrow(/positionM/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [idle, idle] })).toThrow(/used twice/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [idle, npc] })).toThrow(/idle\.home, which is no idle socket/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [{ ...base, id: "x", kind: "loot" }] })).toThrow(/not a socket kind/);
  });

  it("reads the 0104 station and sign sockets and refuses them malformed", () => {
    const forge = { ...base, id: "station.forge", kind: "station", stationClass: "forge" };
    const sign = { ...base, id: "sign.p1", kind: "sign", pointsTo: ["route.a-b", "place.r.q"] };
    const got = parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [forge, sign] });
    expect(got.map((s) => s.kind)).toEqual(["station", "sign"]);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [{ ...forge, stationClass: undefined }] }))
      .toThrow(/no stationClass/);
    expect(() => parseSettlementSockets({ id: "s", socketsSchemaVersion: 1, sockets: [{ ...sign, pointsTo: ["north"] }] }))
      .toThrow(/pointsTo/);
  });

  it("keeps the socket kinds equal to the vocabulary record", () => {
    const vocab = JSON.parse(readFileSync(fileURLToPath(new URL(
      "../../../../world/sources/vocab/socket-vocabulary.json", import.meta.url)), "utf8"));
    expect([...SETTLEMENT_SOCKET_KINDS]).toEqual(vocab.socketKinds);
  });
});
