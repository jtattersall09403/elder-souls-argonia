import type { HitShakeKind } from "../fx/cameraShake";

// The simulation decides what happened; subscribers own how it looks. This
// keeps camera shake and HUD messaging out of the rules. Sound has its own
// typed bus (`@elder-souls/audio` SoundEventBus, decision 0095).
export type CombatEvent =
  | { type: "shake"; kind: HitShakeKind; direction?: { x: number; z: number } }
  | { type: "vignette" }
  | { type: "message"; text: string; duration: number };

export type CombatEventListener = (event: CombatEvent) => void;

export class CombatEventBus {
  private listeners = new Set<CombatEventListener>();

  on(listener: CombatEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: CombatEvent) {
    for (const listener of this.listeners) listener(event);
  }

  shake(kind: HitShakeKind, direction?: { x: number; z: number }) {
    this.emit({ type: "shake", kind, direction });
  }

  vignette() {
    this.emit({ type: "vignette" });
  }

  message(text: string, duration = 1.2) {
    this.emit({ type: "message", text, duration });
  }
}
