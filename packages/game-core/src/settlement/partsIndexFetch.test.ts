import { describe, expect, it } from "vitest";
import { KIT_PARTS_SCHEMA_VERSION } from "../assets/kitParts";
import { loadExteriorPartsIndex } from "./partsIndexFetch";

const reply = (body: unknown) => (async () => ({ ok: true, status: 200, json: async () => body }) as Response);

describe("loadExteriorPartsIndex", () => {
  it("resolves null and logs once, naming the kit, on a wrong schemaVersion", async () => {
    const logs: string[] = [];
    const r = await loadExteriorPartsIndex("u", "mud", "kits/mud/parts/", reply({ schemaVersion: 2, kit: "mud", exterior: true, assets: {} }), (m) => logs.push(m));
    expect(r).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/settlement kit mud: .*unsupported schemaVersion 2/);
  });
  it("resolves null and logs on a network failure", async () => {
    const logs: string[] = [];
    const r = await loadExteriorPartsIndex("u", "mud", "s", async () => { throw new Error("offline"); }, (m) => logs.push(m));
    expect(r).toBeNull();
    expect(logs[0]).toMatch(/offline/);
  });
  it("returns a valid exterior index and logs nothing", async () => {
    const logs: string[] = [];
    const r = await loadExteriorPartsIndex("u", "mud", "s", reply({ schemaVersion: KIT_PARTS_SCHEMA_VERSION, kit: "mud", exterior: true, assets: {}, fires: {} }), (m) => logs.push(m));
    expect(r?.kit).toBe("mud");
    expect(logs).toHaveLength(0);
  });
});
