import { useEffect, useRef, useState } from "react";
import { input, type InputAction } from "@elder-souls/game-core/io/input";
import { UI_MENU_BINDINGS, uiMenuInput } from "@elder-souls/game-core/io/uiMenus";
import { useGameStore } from "@elder-souls/game-core/core/store";
import { MAX_ENEMIES } from "@elder-souls/game-core/combat/tuning";
import { ENEMY_ARCHETYPES } from "@elder-souls/game-core/actors/enemyArchetypes";
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
function Crosshair({ drawFraction, arrowsLeft, zoom }: {
  drawFraction: number;
  arrowsLeft: number;
  /** 0-1 of the aim zoom, shown as magnification once it is off the wide end. */
  zoom: number;
}) {
  // Widest at rest, closing onto the dot at full draw.
  const spread = 26 - drawFraction * 18;
  // 75 degrees down to 28: the magnification a player reads is the ratio of
  // the tangents, not of the angles.
  const fov = 75 - zoom * (75 - 28);
  const magnification = Math.tan((75 * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360);
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
      {zoom > 0.01 && <span className="crosshair-zoom">{magnification.toFixed(1)}\u00d7</span>}
    </div>
  );
}

/**
 * One debug pool, stepped rather than typed.
 *
 * Steps of 50 up to 400: enough headroom for the chains that do not fit a
 * hundred-point bar, and coarse enough that a value is a deliberate choice
 * rather than a number someone tuned by nudging. Raising a pool refills it.
 */
function PoolStepper({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const step = (delta: number) => onChange(
    Math.min(POOL_MAXIMUM, Math.max(POOL_STEP, value + delta)),
  );
  return (
    <label className="pool-stepper">
      {label}: {value}
      <button type="button" disabled={value <= POOL_STEP} onClick={() => step(-POOL_STEP)}>−</button>
      <button type="button" disabled={value >= POOL_MAXIMUM} onClick={() => step(POOL_STEP)}>+</button>
      <button type="button" className="pool-reset" disabled={value === POOL_DEFAULT} onClick={() => onChange(POOL_DEFAULT)}>
        reset
      </button>
    </label>
  );
}

const POOL_STEP = 50;
const POOL_MAXIMUM = 400;
const POOL_DEFAULT = 100;

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
        <div className="vital-row"><span className="level-orb">08</span><Bar value={state.playerHealth} max={state.playerMaxHealth} className="health" label="Health" /></div>
        <Bar value={state.playerStamina} max={state.playerMaxStamina} className="stamina" label="Stamina" />
        {/* Poise: how much more you can be hit before a blow interrupts you.
            Dimmed when full, because full poise is the normal state and a bar
            that is always solid teaches nothing. */}
        {state.poiseEnabled && state.playerMaxPoise > 0 && (
          <div className="poise-row" data-spent={state.playerPoise < state.playerMaxPoise || undefined}>
            <Bar value={state.playerPoise} max={state.playerMaxPoise} className="poise" label="Poise" />
            <small>{Math.round(state.playerPoise)}/{Math.round(state.playerMaxPoise)}</small>
          </div>
        )}
      </section>

      {state.aiming && <Crosshair drawFraction={state.drawFraction} arrowsLeft={state.arrowsLeft} zoom={state.aimZoom} />}

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
      {!visualScenario && <details className="debug-panel" data-ui-capture>
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
        {/* Player pools. Sandbox-only, and here rather than in the tuning
            constants because the point is to look at a rule you cannot
            otherwise reach — a two-handed heavy chain costs more stamina than
            the standard bar holds — without changing what the game ships. */}
        <PoolStepper
          label="Health"
          value={state.playerMaxHealth}
          onChange={(playerMaxHealth) => state.patch({ playerMaxHealth })}
        />
        <PoolStepper
          label="Stamina"
          value={state.playerMaxStamina}
          onChange={(playerMaxStamina) => state.patch({ playerMaxStamina })}
        />
        <label>
          <input
            type="checkbox"
            checked={state.poiseEnabled}
            onChange={(event) => state.patch({ poiseEnabled: event.target.checked })}
          />
          Poise (off = flinch on every hit)
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.showWeaponHitboxes}
            onChange={(event) => state.patch({ showWeaponHitboxes: event.target.checked })}
          />
          Show weapon &amp; parry volumes
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.showBackstabZones}
            onChange={(event) => state.patch({ showBackstabZones: event.target.checked })}
          />
          Show backstab zones
        </label>
        <label className="enemy-picker">
          Enemy:
          <select
            value={state.enemyArchetypeId}
            onChange={(event) => state.patch({ enemyArchetypeId: event.target.value })}
          >
            {Object.values(ENEMY_ARCHETYPES).map((archetype) => (
              <option key={archetype.id} value={archetype.id}>
                {archetype.label} — {archetype.loadout.mainHand.label}
                {archetype.loadout.offHand ? " + shield" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.footDrivenMotion}
            onChange={(event) => state.patch({ footDrivenMotion: event.target.checked })}
          />
          Attack movement from the feet
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.lockedSpeedFollowsClip}
            onChange={(event) => state.patch({ lockedSpeedFollowsClip: event.target.checked })}
          />
          Locked-on speed follows the strafe clips
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.firstPersonBowRig}
            onChange={(event) => state.patch({ firstPersonBowRig: event.target.checked })}
          />
          First-person bow rig (Skyrim arms)
        </label>

        <label>
          <input
            type="checkbox"
            checked={state.showHitboxes}
            onChange={(event) => state.patch({ showHitboxes: event.target.checked })}
          />
          Show all other colliders
        </label>
        <FullscreenButton />
        <button onClick={state.reset}>RESET &amp; RESTART</button>
      </details>}
      {!touch && state.started && <CameraZone />}
      {help && (
        <aside className="help-panel" data-ui-capture>
          <button onClick={() => setHelp(false)} aria-label="Close controls">×</button>
          <h2>Controls</h2>
          <div className="control-columns">
            <dl>
              <dt>Move / camera</dt><dd>WASD / drag</dd>
              <dt>Light / heavy</dt><dd>Mouse 1 / R</dd>
              <dt>Guard / parry</dt><dd>Mouse 2 / F</dd>
              <dt>Dodge / sprint</dt><dd>Space tap / hold</dd>
              <dt>Jump</dt><dd>J</dd>
              <dt>Crouch</dt><dd>C</dd>
              <dt>Lock / heal / equip</dt><dd>Q / H / Tab</dd>
              <dt>Inventory</dt><dd>I (Esc closes)</dd>
              <dt>Switch target</dt><dd>, / .</dd>
              <dt>Bow: raise / draw</dt><dd>Mouse 1 tap / hold</dd>
              <dt>Bow: lower</dt><dd>Mouse 2</dd>
              <dt>Bow: zoom</dt><dd>Scroll wheel</dd>
            </dl>
            <dl>
              <dt>Move / camera</dt><dd>L stick / R stick</dd>
              <dt>Light / heavy</dt><dd>R / ZR</dd>
              <dt>Guard / parry</dt><dd>L / ZL</dd>
              <dt>Dodge / sprint</dt><dd>B tap / hold</dd>
              <dt>Jump</dt><dd>A</dd>
              <dt>Crouch</dt><dd>L3</dd>
              <dt>Lock / heal / equip</dt><dd>R3 / X / D-pad →</dd>
              <dt>Inventory</dt><dd>Start</dd>
              <dt>Bow: raise / draw</dt><dd>R tap / hold</dd>
              <dt>Bow: lower</dt><dd>L</dd>
              <dt>Bow: zoom</dt><dd>ZR in / ZL out</dd>
              <dt>Switch target</dt><dd>Right stick ←/→</dd>
            </dl>
          </div>
          <p>GameSir mapping uses Nintendo-layout button positions. Release dodge quickly to roll; hold while moving to sprint. Press R or ZR again during the current swing to chain without recovering between attacks. An attack pressed during a roll comes out as the roll ends. Parry during the enemy windup, then light attack at close range. Circle behind the enemy and use a light attack at close range to backstab. With a bow drawn, tap light to raise it into first person, hold light to draw — the longer the pull, the harder the shot, and holding at full draw bleeds stamina — and release to loose. Guard lowers the bow; with it raised, scroll (or hold ZR/ZL) to zoom, and the view turns more slowly the further in you are. Crouch is a toggle: it halves your pace and drops you into a sneak, and you stand back up automatically to sprint or jump.</p>
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
            {/* Parry and heavy do nothing while a bow is raised, so they become
                the zoom rather than two more buttons competing for the thumb.
                The pad reuses the same physical triggers for the same reason. */}
            <ActionButton
              action={state.aiming ? "zoomOut" : "parry"}
              label="ZL"
              sublabel={state.aiming ? "ZOOM \u2212" : "PARRY"}
              className="parry"
            />
            <ActionButton action="light" label="R" sublabel={state.aiming ? "DRAW" : "LIGHT"} className="light" />
            <ActionButton
              action={state.aiming ? "zoomIn" : "heavy"}
              label="ZR"
              sublabel={state.aiming ? "ZOOM +" : "HEAVY"}
              className="heavy"
            />
            <ActionButton action="dodge" label="B" sublabel="DODGE" className="dodge" />
            <ActionButton action="heal" label="X" sublabel="ESTUS" className="heal" />
            <ActionButton action="equip" label="→" sublabel="EQUIP" className="equip" />
            <ActionButton action="jump" label="A" sublabel="JUMP" className="jump" />
            <ActionButton action="crouch" label="L3" sublabel="CROUCH" className="crouch" />
          </div>
        </div>
      )}

    </div>
  );
}
