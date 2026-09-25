import { AudioManager, SoundEventBus, parseManifest, type AudioManifest } from "@elder-souls/audio";
import { createThreeAudio } from "@elder-souls/audio/three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";

/**
 * The sandbox's audio (decision 0095): one sound-event bus for the session and
 * an AudioManager on it, its listener riding the scene camera. The combat
 * runtime emits on the bus; the manager plays what it hears once the first
 * gesture has unlocked the context. The bus exists from the first render, so
 * the stealth feed hears even before the manifest has arrived.
 */

/**
 * What the arena prefetches and pins on entry, so a swing never waits on a
 * fetch: every combat set, the footstep sets on the arena's stone and in the
 * pool's water, the swim sets and the torch. Everything else streams on first use.
 */
function sandboxSets(manifest: AudioManifest): string[] {
  return Object.keys(manifest.sets).filter((id) =>
    id.startsWith("combat.")
    || /^footstep\.[a-z]+\.[a-z-]+\.(stone|water)$/.test(id)
    || id.startsWith("footstep.swim.")
    || id === "footstep.water.splash"
    || id === "object.torch.burn");
}

export function useSandboxAudio({ prefetch }: { prefetch: boolean }) {
  const camera = useThree((state) => state.camera);
  const [sounds] = useState(() => new SoundEventBus());
  const [audio, setAudio] = useState<AudioManager | null>(null);

  useEffect(() => {
    let cancelled = false;
    let manager: AudioManager | null = null;
    let detachListener: (() => void) | null = null;
    const base = `${import.meta.env.BASE_URL}audio/`;
    const unlock = () => { void manager?.unlock(); };
    // Every gesture, not once: iOS suspends the context on interruptions, and
    // resume is a no-op while it runs.
    const gestures = ["pointerdown", "keydown", "touchend"] as const;
    for (const gesture of gestures) window.addEventListener(gesture, unlock);
    void (async () => {
      const response = await fetch(`${base}audio-manifest.json`);
      const manifest = parseManifest(await response.json());
      if (cancelled) return;
      const { listener, backend } = createThreeAudio(camera);
      detachListener = () => camera.remove(listener);
      manager = new AudioManager({ backend, manifest, baseUrl: base, listenerPosition: () => camera.position });
      manager.attach(sounds);
      if (prefetch) void manager.prefetch(sandboxSets(manifest));
      setAudio(manager);
    })().catch((error: unknown) => console.error("sandbox audio:", error));
    return () => {
      cancelled = true;
      for (const gesture of gestures) window.removeEventListener(gesture, unlock);
      manager?.dispose();
      detachListener?.();
      setAudio(null);
    };
  }, [camera, prefetch, sounds]);

  useFrame(() => audio?.update());

  return { sounds, audio };
}
