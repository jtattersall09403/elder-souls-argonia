import { t } from "./hudText";
import { Fragment, useEffect, useRef, useState } from "react";
import { input, type InputAction } from "@elder-souls/game-core/io/input";
import { UI_MENU_BINDINGS, uiMenuInput } from "@elder-souls/game-core/io/uiMenus";
import { useGameStore } from "../sandboxStore";
import { useEquippedLoadout } from "@elder-souls/game-core/inventory/store";
import { DebugPanel } from "./DebugPanel";
import type { VisualScenario } from "@elder-souls/game-core/validation/visualScenarios";

function Bar({ value, max, className, label }: { value: number; max: number; className: string; label: string }) {
  return (
    <div className={`meter ${className}`} aria-label={`${label}: ${Math.ceil(value)} / ${max}`}>
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
      aria-label={t("text.sandbox.camera-drag")}
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

/** The keyboard column of the controls sheet: action, then its keys. */
const HELP_ROWS = [
  "move", "attack", "guard", "dodge", "jump", "crouch", "lock", "inventory", "switch-target", "bow-draw", "bow-lower", "bow-zoom",
].map((action) => [action, "keys"] as const);
/** The pad column, in the order a pad player reads it. */
const PAD_ROWS = [
  "move", "attack", "guard", "dodge", "jump", "crouch", "lock", "inventory", "bow-draw", "bow-lower", "bow-zoom", "switch-target",
] as const;

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

  const { mainHand } = useEquippedLoadout();
  const dead = state.playerHealth <= 0;
  const won = state.enemyHealth <= 0;
  return (
    <div className="hud">
      {visualScenario && (
        <div className="visual-scenario-label" data-testid="visual-scenario-label">
          {t("text.sandbox.visual-test")} · {visualScenario.label}
        </div>
      )}
      <section className="player-vitals" aria-label={t("text.sandbox.player-status")}>
        <div className="vital-row"><span className="level-orb">08</span><Bar value={state.playerHealth} max={state.playerMaxHealth} className="health" label={t("text.sandbox.health")} /></div>
        <Bar value={state.playerStamina} max={state.playerMaxStamina} className="stamina" label={t("text.sandbox.stamina")} />
        {/* Poise: how much more you can be hit before a blow interrupts you.
            Dimmed when full, because full poise is the normal state and a bar
            that is always solid teaches nothing. */}
        {state.poiseEnabled && state.playerMaxPoise > 0 && (
          <div className="poise-row" data-spent={state.playerPoise < state.playerMaxPoise || undefined}>
            <Bar value={state.playerPoise} max={state.playerMaxPoise} className="poise" label={t("text.sandbox.poise")} />
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

      <section className="quick-slots" aria-label={t("text.sandbox.equipment")}>
        <div className="slot sword-icon"><i /></div>
        <div className="slot flask-icon"><i /> <b>{state.estus}</b></div>
        <span>{state.equipped ? mainHand.label : t("text.sandbox.empty-hand")}</span>
      </section>

      <div className={`connection ${state.gamepad ? "connected" : ""}`}>
        {state.gamepad ? t("text.sandbox.controller-connected") : t("text.sandbox.input-modes")}
      </div>

      {!visualScenario && <button className="help-button" onClick={() => setHelp((value) => !value)} aria-expanded={help}>?</button>}
      {!visualScenario && <DebugPanel />}
      {!touch && state.started && <CameraZone />}
      {help && (
        <aside className="help-panel" data-ui-capture>
          <button onClick={() => setHelp(false)} aria-label={t("text.sandbox.close-controls")}>×</button>
          <h2>{t("text.sandbox.controls")}</h2>
          <div className="control-columns">
            <dl>
              {HELP_ROWS.map(([action, keys]) => (
                <Fragment key={action}><dt>{t(`text.sandbox.help-${action}`)}</dt><dd>{t(`text.sandbox.${keys}-${action}`)}</dd></Fragment>
              ))}
            </dl>
            <dl>
              {PAD_ROWS.map((action) => (
                <Fragment key={action}><dt>{t(`text.sandbox.help-${action}`)}</dt><dd>{t(`text.sandbox.pad-${action}`)}</dd></Fragment>
              ))}
            </dl>
          </div>
          <p>{t("text.sandbox.help-notes")}</p>
        </aside>
      )}

      {touch && !state.gamepad && state.started && !dead && (
        <div className="touch-controls">
          <CameraZone />
          <TouchJoystick />
          <MenuButtons />
          <div className="touch-actions">
            <ActionButton action="lockOn" label="R3" sublabel={t("text.sandbox.touch-lock")} className="lock" />
            <ActionButton action="targetLeft" label="◀" sublabel={t("text.sandbox.touch-target")} className="target-left" />
            <ActionButton action="targetRight" label="▶" sublabel={t("text.sandbox.touch-target")} className="target-right" />
            <ActionButton
              action="guard"
              label="L"
              sublabel={state.aiming ? t("text.sandbox.touch-lower") : t("text.sandbox.touch-guard")}
              className="guard"
            />
            {/* Parry and heavy do nothing while a bow is raised, so they become
                the zoom rather than two more buttons competing for the thumb.
                The pad reuses the same physical triggers for the same reason. */}
            <ActionButton
              action={state.aiming ? "zoomOut" : "parry"}
              label="ZL"
              sublabel={state.aiming ? t("text.sandbox.touch-zoom-out") : t("text.sandbox.touch-parry")}
              className="parry"
            />
            <ActionButton action="light" label="R" sublabel={state.aiming ? t("text.sandbox.touch-draw") : t("text.sandbox.touch-light")} className="light" />
            <ActionButton
              action={state.aiming ? "zoomIn" : "heavy"}
              label="ZR"
              sublabel={state.aiming ? t("text.sandbox.touch-zoom-in") : t("text.sandbox.touch-heavy")}
              className="heavy"
            />
            <ActionButton action="dodge" label="B" sublabel={t("text.sandbox.touch-dodge")} className="dodge" />
            <ActionButton action="heal" label="X" sublabel={t("text.sandbox.touch-estus")} className="heal" />
            <ActionButton action="equip" label="→" sublabel={t("text.sandbox.touch-equip")} className="equip" />
            <ActionButton action="jump" label="A" sublabel={t("text.sandbox.touch-jump")} className="jump" />
            <ActionButton action="crouch" label="L3" sublabel={t("text.sandbox.touch-crouch")} className="crouch" />
          </div>
        </div>
      )}

    </div>
  );
}
