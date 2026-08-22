import { useEffect, useState } from "react";

function toggleFullscreen() {
  if (!document.fullscreenElement) return document.documentElement.requestFullscreen?.();
  return document.exitFullscreen?.();
}

export function enterFullscreen() {
  if (document.fullscreenElement) return;
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function FullscreenButton({ className = "" }: { className?: string }) {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  return (
    <button
      className={className}
      onClick={() => { void toggleFullscreen()?.catch(() => undefined); }}
      aria-pressed={fullscreen}
    >
      {fullscreen ? "EXIT FULL SCREEN" : "FULL SCREEN"}
    </button>
  );
}
