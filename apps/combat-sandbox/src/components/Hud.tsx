import { useEffect, useRef, useState } from "react";
import { input, type InputAction } from "@elder-souls/game-core/io/input";
import { UI_MENU_BINDINGS, uiMenuInput } from "@elder-souls/game-core/io/uiMenus";
import { useGameStore } from "@elder-souls/game-core/core/store";
import { MAX_ENEMIES } from "@elder-souls/game-core/combat/tuning";
import { FullscreenButton } from "./FullscreenButton";
import type { VisualScenario } from "@elder-souls/game-core/validation/visualScenarios";

function Bar({ value, max, className, label }: { value: number; max: number; className: string; label: string }) {
  return (
    <div className={`meter ${className}`} aria-label={`${label}: ${Math.ceil(value)} of ${max}`}>
      <span style={{ transform: `scaleX(${Math.max(0, value / max)})` }} />
    </div>
  );
}

function ActionButton({ action, label, sublabel, className = "" }: { action: InputAction; label: string; sublabel?: string; className?: string }) {
  const release = () => input.setVirtual(action, false);
  return (
    <button
      className={`action-button ${className}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        input.setVirtual(action, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      aria-label={sublabel ? `${label}: ${sublabel}` : label}
    >
      <strong>{label}</strong>
      {sublabel && <small>{sublabel}</small>}
    </button>
  );
}

/**
 * On-screen buttons for the UI screens, generated from UI_MENU_BINDINGS so a
 * future map/journal/pause screen appears here without touching this file.
 */
function MenuButtons() {
  return (
    <div className="menu-buttons">
      {UI_MENU_BINDINGS.map((binding) => {
        const release = () => uiMenuInput.press(binding.menu, false);
        return (
          <button
            key={binding.menu}
            className={`action-button menu menu-${binding.menu}`}
            aria-label={binding.label}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              uiMenuInput.press(binding.menu, true);
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
          >
            <strong>{binding.padLabel}</strong>
            <small>{binding.label.toUpperCase()}</small>
          </button>
        );
      })}
    </div>
  );
}

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
      className="touch-stick"
      onPointerDown={(event) => {
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => pointer.current === event.pointerId && update(event)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span style={{ transform: `translate(${nub.x}px, ${nub.y}px)` }} />
    </div>
  );
}

function CameraZone() {
  const previous = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div
      className="camera-zone"
      aria-label="Drag to rotate camera"
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

/**
 * The aiming reticle.
 *
 * Four ticks that open as the string comes back, so how far the shot is drawn
 * is readable without looking away from the target — a partial draw is a real,
 * much weaker shot and the player has to be able to see they are about to take
 * one. The centre dot stays fixed: that is where the arrow goes.
 */
function Crosshair({ drawFraction, arrowsLeft }: { drawFraction: number; arrowsLeft: number }) {
  // Widest at rest, closing onto the dot at full draw.
  const spread = 26 - drawFraction * 18;
  return (
    <div className="crosshair" aria-hidden="true">
      <span className="crosshair-dot" />
      {(["up", "down", "left", "right"] as const).map((side) => (
        <span
          key={side}
          className={`crosshair-tick ${side}`}
          style={{ ["--spread" as string]: `${spread}px` }}
        />
      ))}
      <span className="crosshair-count">{arrowsLeft}</span>
    </div>
  );
}

export function Hud({ visualScenario = null }: { visualScenario?: VisualScenario | null }) {
  const state = useGameStore();
  const [help, setHelp] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const dead = state.playerHealth <= 0;
  const won = state.enemyHealth <= 0;
  return (
    <div className="hud">
      {visualScenario && (
        <div className="visual-scenario-label" data-testid="visual-scenario-label">
          VISUAL TEST · {visualScenario.label}
        </div>
      )}
      <section className="player-vitals" aria-label="Player status">
        <div className="vital-row"><span className="level-orb">08</span><Bar value={state.playerHealth} max={100} className="health" label="Health" /></div>
        <Bar value={state.playerStamina} max={100} className="stamina" label="Stamina" />
      </section>

      {state.aiming && <Crosshair drawFraction={state.drawFraction} arrowsLeft={state.arrowsLeft} />}

      {state.damagePulse > 0 && <div key={state.damagePulse} className="damage-vignette" aria-hidden="true" />}
      {state.message && (
        <div className={`combat-message ${dead ? "major" : won ? "victory" : ""}`}>
          {state.message}
        </div>
      )}

      <section className="quick-slots" aria-label="Equipment">
        <div className="slot sword-icon"><i /></div>
        <div className="slot flask-icon"><i /> <b>{state.estus}</b></div>
        <span>{state.equipped ? "Weathered Straight Sword" : "Empty right hand"}</span>
      </section>

      <div className={`connection ${state.gamepad ? "connected" : ""}`}>
        {state.gamepad ? "CONTROLLER CONNECTED" : "KEYBOARD · TOUCH · GAMEPAD"}
      </div>

      {!visualScenario && <button className="help-button" onClick={() => setHelp((value) => !value)} aria-expanded={help}>?</button>}
      {!visualScenario && <details className="debug-panel">
        <summary>DEBUG</summary>
        <label>
          <input
            type="checkbox"
            checked={state.enemyEnabled}
            onChange={(event) => state.patch({ enemyEnabled: event.target.checked, lockedOn: false })}
          />
          Enemy present
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.enemyAiEnabled}
            disabled={!state.enemyEnabled}
            onChange={(event) => state.patch({ enemyAiEnabled: event.target.checked })}
          />
          Enemy attacks
        </label>
        <label className="enemy-count">
          Enemies: {state.enemyCount}
          <button
            type="button"
            disabled={!state.enemyEnabled || state.enemyCount <= 1}
            onClick={() => state.patch({ enemyCount: Math.max(1, state.enemyCount - 1) })}
          >
            −
          </button>
          <button
            type="button"
            disabled={!state.enemyEnabled || state.enemyCount >= MAX_ENEMIES}
            onClick={() => state.patch({ enemyCount: Math.min(MAX_ENEMIES, state.enemyCount + 1) })}
          >
            +
          </button>
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.showHitboxes}
            onChange={(event) => state.patch({ showHitboxes: event.target.checked })}
          />
          Show hitboxes
        </label>
        <FullscreenButton />
        <button onClick={state.reset}>RESET &amp; RESTART</button>
      </details>}
      {!touch && state.started && <CameraZone />}
      {help && (
        <aside className="help-panel">
          <button onClick={() => setHelp(false)} aria-label="Close controls">×</button>
          <h2>Controls</h2>
          <div className="control-columns">
            <dl>
              <dt>Move / camera</dt><dd>WASD / drag</dd>
              <dt>Light / heavy</dt><dd>Mouse 1 / R</dd>
              <dt>Guard / parry</dt><dd>Mouse 2 / F</dd>
              <dt>Dodge / sprint</dt><dd>Space tap / hold</dd>
              <dt>Jump</dt><dd>J</dd>
              <dt>Lock / heal / equip</dt><dd>Q / H / Tab</dd>
              <dt>Inventory</dt><dd>I (Esc closes)</dd>
              <dt>Switch target</dt><dd>, / .</dd>
              <dt>Bow: raise / draw</dt><dd>Mouse 1 tap / hold</dd>
              <dt>Bow: lower</dt><dd>Mouse 2</dd>
            </dl>
            <dl>
              <dt>Move / camera</dt><dd>L stick / R stick</dd>
              <dt>Light / heavy</dt><dd>R / ZR</dd>
              <dt>Guard / parry</dt><dd>L / ZL</dd>
              <dt>Dodge / sprint</dt><dd>B tap / hold</dd>
              <dt>Jump</dt><dd>A / L3</dd>
              <dt>Lock / heal / equip</dt><dd>R3 / X / D-pad →</dd>
              <dt>Inventory</dt><dd>Start</dd>
              <dt>Bow: raise / draw</dt><dd>R tap / hold</dd>
              <dt>Bow: lower</dt><dd>L</dd>
              <dt>Switch target</dt><dd>Right stick ←/→</dd>
            </dl>
          </div>
          <p>GameSir mapping uses Nintendo-layout button positions. Release dodge quickly to roll; hold while moving to sprint. Press R or ZR again during the current swing to chain without recovering between attacks. An attack pressed during a roll comes out as the roll ends. Parry during the enemy windup, then light attack at close range. Circle behind the enemy and use a light attack at close range to backstab. With a bow drawn, tap light to raise it into first person, hold light to draw — the longer the pull, the harder the shot, and holding at full draw bleeds stamina — and release to loose. Guard lowers the bow.</p>
        </aside>
      )}

      {touch && !state.gamepad && state.started && !dead && (
        <div className="touch-controls">
          <CameraZone />
          <TouchJoystick />
          <MenuButtons />
          <div className="touch-actions">
            <ActionButton action="lockOn" label="R3" sublabel="LOCK" className="lock" />
            <ActionButton action="targetLeft" label="◀" sublabel="TARGET" className="target-left" />
            <ActionButton action="targetRight" label="▶" sublabel="TARGET" className="target-right" />
            <ActionButton
              action="guard"
              label="L"
              sublabel={state.aiming ? "LOWER" : "GUARD"}
              className="guard"
            />
            <ActionButton action="parry" label="ZL" sublabel="PARRY" className="parry" />
            <ActionButton action="light" label="R" sublabel="LIGHT" className="light" />
            <ActionButton action="heavy" label="ZR" sublabel="HEAVY" className="heavy" />
            <ActionButton action="dodge" label="B" sublabel="DODGE" className="dodge" />
            <ActionButton action="heal" label="X" sublabel="ESTUS" className="heal" />
            <ActionButton action="equip" label="→" sublabel="EQUIP" className="equip" />
            <ActionButton action="jump" label="A" sublabel="JUMP" className="jump" />
          </div>
        </div>
      )}

    </div>
  );
}
