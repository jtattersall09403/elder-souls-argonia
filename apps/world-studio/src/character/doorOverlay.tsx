import { useCallback, useSyncExternalStore } from "react";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import type { DoorPrompt } from "@elder-souls/game-core/interior/doorTransition";
import { doorLoadingText } from "@elder-souls/game-core/interior/doors";
import { input } from "@elder-souls/game-core/io/input";

/**
 * The door prompt, the fade with its loading line and the load-error line, drawn as plain DOM over
 * the canvas like the character HUD (walk 2 D2): a drei `<Html>` inside the
 * canvas projects its anchor every frame, and anchored at the world origin it
 * sat 3 km from any door, off screen. `InteriorDoors` (inside the canvas)
 * writes this channel; `DoorOverlay` (outside it) is the only thing that
 * re-renders when the prompt or the error changes. The fade is written
 * straight onto its element each frame, never through React state.
 */
export interface DoorOverlayChannel {
  prompt: DoorPrompt | null;
  error: string | null;
  /** The text-catalogue id of the line shown on the black while a cell loads (walk 4 c), else null. */
  loading: string | null;
  /** The name the named loading line fills in (`text.door.loading-named`), else null. */
  loadingName: string | null;
  /** 0 clear, 1 black. */
  fade: number;
  /** The fade element, registered by the overlay when it mounts. */
  fadeEl: HTMLDivElement | null;
  setPrompt(prompt: DoorPrompt | null): void;
  setError(error: string | null): void;
  setLoading(textId: string | null, name?: string | null): void;
  setFade(fade: number): void;
  subscribe(listener: () => void): () => void;
}

export function createDoorOverlayChannel(initialFade = 0): DoorOverlayChannel {
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const channel: DoorOverlayChannel = {
    prompt: null,
    error: null,
    loading: null,
    loadingName: null,
    fade: initialFade,
    fadeEl: null,
    setPrompt(prompt) {
      if (prompt?.textId === channel.prompt?.textId && prompt?.doorId === channel.prompt?.doorId
        && prompt?.kind === channel.prompt?.kind) return;
      channel.prompt = prompt;
      notify();
    },
    setError(error) {
      if (error === channel.error) return;
      channel.error = error;
      notify();
    },
    setLoading(textId, name = null) {
      if (textId === channel.loading && name === channel.loadingName) return;
      channel.loading = textId;
      channel.loadingName = name;
      notify();
    },
    setFade(fade) {
      channel.fade = fade;
      if (channel.fadeEl) channel.fadeEl.style.opacity = String(fade);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return channel;
}

/** Outside the canvas, inside the character view's fixed full-screen box. */
export function DoorOverlay({ channel }: { channel: DoorOverlayChannel }) {
  const prompt = useSyncExternalStore(channel.subscribe, () => channel.prompt, () => channel.prompt);
  const error = useSyncExternalStore(channel.subscribe, () => channel.error, () => channel.error);
  const loading = useSyncExternalStore(channel.subscribe, () => channel.loading, () => channel.loading);
  const loadingName = useSyncExternalStore(channel.subscribe, () => channel.loadingName, () => channel.loadingName);
  const fadeRef = useCallback((el: HTMLDivElement | null) => {
    channel.fadeEl = el;
    if (el) el.style.opacity = String(channel.fade);
  }, [channel]);
  return (
    <div data-door-overlay style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* The loading line sits inside the fade, so it shows only as far as the screen is black. */}
      <div ref={fadeRef} data-door-fade style={{ position: "absolute", inset: 0, background: "#000",
        opacity: channel.fade }}>
        {loading && (
          <div data-door-loading style={{ position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)", font: "16px system-ui", color: "#d8d2c4", whiteSpace: "nowrap" }}>
            {doorLoadingText(text(CATALOGUE, loading), loadingName)}
          </div>
        )}
      </div>
      {prompt && (
        <div data-door-prompt={prompt.kind} data-ui-capture
          // The prompt is the touch button: pressing it is `activate`.
          onPointerDown={(e) => { e.preventDefault(); input.setVirtual("activate", true); }}
          onPointerUp={() => input.setVirtual("activate", false)}
          onPointerCancel={() => input.setVirtual("activate", false)}
          onPointerLeave={() => input.setVirtual("activate", false)}
          style={{
            position: "absolute", bottom: "22%", left: "50%", transform: "translateX(-50%)",
            background: "rgba(10,14,20,0.8)", padding: "8px 18px", borderRadius: 8,
            font: "18px system-ui", color: "#ffd9a0", whiteSpace: "nowrap",
            pointerEvents: "auto", touchAction: "none", cursor: "pointer",
          }}>
          {text(CATALOGUE, prompt.textId)}
          {prompt.kind !== "closed" && <span style={{ opacity: 0.7 }}> [E]</span>}
        </div>
      )}
      {error && (
        <div data-door-error style={{ position: "absolute", top: 140, left: 12, color: "#ff9a9a", font: "12px system-ui" }}>
          interior: {error}
        </div>
      )}
    </div>
  );
}
