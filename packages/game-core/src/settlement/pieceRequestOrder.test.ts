import { describe, expect, it } from "vitest";
import { BULK_KIT_PRIORITY, NEEDED_KIT_PRIORITY, orderPieceRequests, requestKit } from "./pieceRequestOrder";

describe("pieceRequestOrder (decision 0120)", () => {
  it("puts the spawn ring and the view first, then band, then distance, one request per key", () => {
    const order = orderPieceRequests([
      { key: "works-v1#far", distanceM: 900, band: 2, inView: false },
      { key: "works-v1#mid", distanceM: 200, band: 1, inView: false },
      { key: "mud#seen", distanceM: 400, band: 1, inView: true },
      { key: "mud#near", distanceM: 30, band: 0, inView: false },
      { key: "mud#nearer", distanceM: 10, band: 0, inView: false },
      { key: "works-v1#far", distanceM: 40, band: 0, inView: false },   // same piece, nearer placement
    ]);
    expect(order.map((r) => r.key)).toEqual(["mud#nearer", "mud#near", "works-v1#far", "mud#seen", "works-v1#mid"]);
    expect(order.map((r) => r.ring)).toEqual([true, true, true, false, false]);
    expect(order.map((r) => r.priority)).toEqual(
      [NEEDED_KIT_PRIORITY, NEEDED_KIT_PRIORITY, NEEDED_KIT_PRIORITY, NEEDED_KIT_PRIORITY, BULK_KIT_PRIORITY]);
  });

  it("is deterministic on ties and names the kit of a key", () => {
    const a = orderPieceRequests([{ key: "b", distanceM: 5, band: 1, inView: false }, { key: "a", distanceM: 5, band: 1, inView: false }]);
    expect(a.map((r) => r.key)).toEqual(["a", "b"]);
    expect(requestKit("works-v1#x:y")).toBe("works-v1");
    expect(requestKit("watercraft-v1")).toBe("watercraft-v1");
  });
});
