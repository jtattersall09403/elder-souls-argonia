import { describe, expect, it } from "vitest";
import { GroundOverlayRegistry } from "@elder-souls/game-core/terrain/heightOverlays";
import type { Ladder } from "../ladder";
import { installPlaceOverlays, ladderGatedPlaceGround, PLACE_GROUND_SCHEMA_VERSION, type PlaceGroundDoc } from "./chunkStore";

const PAD = {
  id: "patch.pad.settlement.place.t.b1", bboxM: [0, 0, 4, 4] as [number, number, number, number],
  blendM: 3, hardM: 0,
  pieces: [{ placementId: "place.t.b1.building", polygonM: [[0, 0], [4, 0], [4, 4], [0, 4]] as [number, number][], datumM: 1 }],
};
const DOC: PlaceGroundDoc = {
  schemaVersion: PLACE_GROUND_SCHEMA_VERSION,
  settlements: [{ id: "place.t", groundOverlays: { schemaVersion: 1, pads: [PAD] } }],
};
const ladder = (hiddenLayers: string[]): Ladder =>
  ({ schemaVersion: 1, through: "x", ran: [], skipped: [], hiddenLayers });

describe("installPlaceOverlays (16k fix 2 round 3: pads follow the ladder)", () => {
  it("applies the places' pads when the ladder shows settlements", async () => {
    const reg = new GroundOverlayRegistry();
    await installPlaceOverlays(reg, Promise.resolve(ladder([])), async () => DOC);
    await reg.ready;
    expect(reg.overlays().map((o) => o.id)).toEqual([PAD.id]);
  });

  it("applies none, and never reads the sidecar, when the ladder hides settlements", async () => {
    const reg = new GroundOverlayRegistry();
    let read = 0;
    await installPlaceOverlays(reg, Promise.resolve(ladder(["settlements"])), async () => { read++; return DOC; });
    await reg.ready;
    expect(reg.overlays()).toEqual([]);
    expect(read).toBe(0);
  });

  it("applies the pads when there is no ladder record (hides nothing)", async () => {
    const reg = new GroundOverlayRegistry();
    await installPlaceOverlays(reg, Promise.resolve(null), async () => DOC);
    expect(reg.overlays()).toHaveLength(1);
  });
});

describe("ladderGatedPlaceGround (16k fix 2 round 4 W4: the clearance follows the ladder)", () => {
  const CLEARED: PlaceGroundDoc = {
    schemaVersion: PLACE_GROUND_SCHEMA_VERSION,
    settlements: [{ id: "place.t", vegetationClearance: { schemaVersion: 1 } as never }],
  };
  it("hands the vegetation no clearance, and never reads the sidecar, when the ladder hides settlements", async () => {
    let read = 0;
    const got = await ladderGatedPlaceGround(Promise.resolve(ladder(["settlements"])), async () => { read++; return CLEARED; });
    expect(got.settlements).toEqual([]);
    expect(read).toBe(0);
  });
  it("hands it the places' clearance when the ladder shows settlements or there is no record", async () => {
    expect((await ladderGatedPlaceGround(Promise.resolve(ladder([])), async () => CLEARED)).settlements).toHaveLength(1);
    expect((await ladderGatedPlaceGround(Promise.resolve(null), async () => CLEARED)).settlements).toHaveLength(1);
  });
});
