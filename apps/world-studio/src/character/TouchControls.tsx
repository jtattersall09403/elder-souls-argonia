import { useRef, useState } from "react";
import { input, type InputAction } from "@elder-souls/game-core/io/input";

/**
 * Touch input for the character mode, feeding the same shared
 * `InputController` the keyboard and gamepad use (input parity, Phase 7).
 * Mirrors the combat sandbox's proven joystick/camera-drag/button pattern.
 */

function TouchJoystick() {
  const pad = useRef<HTMLDivElement>(null);
  const [nub, setNub] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  const update = (event: React.PointerEvent) => {
    const bounds = pad.current!.getBoundingClientRect();
    const radius = bounds.width * 0.36;
    let x = event.clientX - (bounds.left + bounds.width / 2);
    let y = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > radius) {
      x = (x / distance) * radius;
      y = (y / distance) * radius;
    }
    setNub({ x, y });
    input.setTouchMovement({ x: x / radius, y: -y / radius });
  };
  const end = () => {
    pointer.current = null;
    setNub({ x: 0, y: 0 });
    input.setTouchMovement({ x: 0, y: 0 });
  };
  return (
    <div
      ref={pad}
      style={{
        position: "absolute", left: 24, bottom: 60, width: 130, height: 130,
        borderRadius: "50%", background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.25)", touchAction: "none",
      }}
      onPointerDown={(event) => {
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => pointer.current === event.pointerId && update(event)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span style={{
        position: "absolute", left: "50%", top: "50%", width: 48, height: 48,
        margin: "-24px 0 0 -24px", borderRadius: "50%",
        background: "rgba(255,255,255,0.35)",
        transform: `translate(${nub.x}px, ${nub.y}px)`,
      }} />
    </div>
  );
}

function CameraZone() {
  const previous = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div
      aria-label="Drag to rotate camera"
      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "45%", touchAction: "none" }}
      onPointerDown={(event) => {
        previous.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (previous.current?.id !== event.pointerId) return;
        const dx = event.clientX - previous.current.x;
        const dy = event.clientY - previous.current.y;
        previous.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        input.addTouchCamera({ x: dx * 0.18, y: dy * 0.18 });
      }}
      onPointerUp={() => { previous.current = null; }}
      onPointerCancel={() => { previous.current = null; }}
    />
  );
}

function ActionButton({ action, label }: { action: InputAction; label: string }) {
  const release = () => input.setVirtual(action, false);
  return (
    <button
      style={{
        width: 66, height: 66, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)",
        background: "rgba(255,255,255,0.12)", color: "#e6ecf5", font: "600 13px system-ui",
        touchAction: "none",
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        input.setVirtual(action, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {label}
    </button>
  );
}

export function TouchControls() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>
        <CameraZone />
        <TouchJoystick />
        <div style={{ position: "absolute", right: 20, bottom: 70, display: "flex", gap: 12 }}>
          <ActionButton action="dodge" label="SPRINT" />
          <ActionButton action="jump" label="JUMP" />
        </div>
      </div>
    </div>
  );
}
