import { describe, expect, it } from "vitest";
import { WaterInteractionStream } from "./interactionStream";

describe("water interaction fan-out", () => {
  it("keeps render/audio/gameplay readers independent and snapshots mutable producer vectors", () => {
    const stream = new WaterInteractionStream();
    const audio = stream.subscribe(), gameplay = stream.subscribe();
    const position = { x: 1, y: 2, z: 3 };
    const normal = { x: 0, y: 0, z: 1 }, waterVelocity = { x: 0, y: -8, z: 0 };
    stream.emit({ kind: "splash", position, waterVelocity, sheetContact: { waterBodyId: 'fall', normal } });
    position.x = 99;
    normal.z = -1; waterVelocity.y = 12;
    const renderEvents = stream.drain();
    expect(renderEvents[0].position.x).toBe(1);
    expect(renderEvents[0].waterVelocity?.y).toBe(-8);
    expect(renderEvents[0].sheetContact?.normal.z).toBe(1);
    expect(audio.drain()).toEqual(renderEvents);
    expect(gameplay.drain()).toEqual(renderEvents);
    expect(audio.drain()).toEqual([]);
    expect(stream.drain()).toEqual([]);
  });
  it("bounds lagging readers, reports dropped events and releases subscriber slots", () => {
    const stream = new WaterInteractionStream(3, 1), slow = stream.subscribe();
    expect(() => stream.subscribe()).toThrow("budget");
    for (let x = 0; x < 10; x++) stream.emit({ kind: "wake", position: { x, y: 0, z: 0 } });
    expect(slow.drain().map(e => e.position.x)).toEqual([7, 8, 9]);
    expect(slow.droppedEvents).toBe(7);
    expect(stream.drain()).toHaveLength(3);
    slow.dispose(); slow.dispose();
    const next = stream.subscribe();
    expect(next.drain()).toEqual([]);
    expect(slow.drain()).toEqual([]);
    next.dispose();
  });
});
