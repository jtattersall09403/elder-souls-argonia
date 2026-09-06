import type { WaterInteractionEvent, WaterInteractionSubscription } from "@elder-souls/contracts";

/** Bounded fan-out log: render, audio and gameplay drain independently without
 * stealing events. Slow consumers drop oldest entries, never grow memory. */
export class WaterInteractionStream {
  private readonly events: (WaterInteractionEvent | undefined)[];
  private sequence = 0;
  private legacyCursor = 0;
  private subscribers = 0;
  constructor(readonly capacity = 256, readonly maxSubscribers = 16) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(maxSubscribers) || maxSubscribers < 1) {
      throw new RangeError("Water interaction budgets must be positive integers");
    }
    this.events = new Array(capacity);
  }
  emit(event: WaterInteractionEvent): void {
    // Producers commonly reuse physics vectors. Capture once so delayed
    // consumers receive the actual contact, not the body's later position.
    const snapshot = Object.freeze({ ...event, position: Object.freeze({ ...event.position }),
      velocity: event.velocity ? Object.freeze({ ...event.velocity }) : undefined,
      waterVelocity: event.waterVelocity ? Object.freeze({ ...event.waterVelocity }) : undefined,
      sheetContact: event.sheetContact ? Object.freeze({ ...event.sheetContact, normal: Object.freeze({ ...event.sheetContact.normal }) }) : undefined });
    this.events[this.sequence++ % this.capacity] = snapshot;
  }
  private read(cursor: number): WaterInteractionEvent[] {
    const result: WaterInteractionEvent[] = [];
    for (let i = Math.max(cursor, this.sequence - this.capacity); i < this.sequence; i++) {
      result.push(this.events[i % this.capacity]!);
    }
    return result;
  }
  drain(): WaterInteractionEvent[] {
    const result = this.read(this.legacyCursor);
    this.legacyCursor = this.sequence;
    return result;
  }
  subscribe(): WaterInteractionSubscription {
    if (this.subscribers >= this.maxSubscribers) throw new RangeError("Water interaction subscriber budget exhausted");
    this.subscribers++;
    let cursor = this.sequence, disposed = false, dropped = 0;
    return {
      get droppedEvents() { return dropped; },
      drain: () => {
        if (disposed) return [];
        dropped += Math.max(0, this.sequence - this.capacity - cursor);
        const result = this.read(cursor);
        cursor = this.sequence;
        return result;
      },
      dispose: () => { if (!disposed) { disposed = true; this.subscribers--; } },
    };
  }
}
