import type { AimView } from "@elder-souls/game-core/core/types";
import { useEffect, useMemo, useState } from "react";
import { MAX_ENEMIES } from "@elder-souls/game-core/combat/tuning";
import { marksmanModifiers, meleeModifiers } from "@elder-souls/game-core/stats/modifiers";
import { meleeSkillFor } from "@elder-souls/game-core/equipment/weaponSkill";
import { sneakWeaponKindFor } from "@elder-souls/game-core/equipment/sneakWeaponKind";
import { sneakMultiplier } from "@elder-souls/game-core/stats/derived";
import { useEquippedLoadout } from "@elder-souls/game-core/inventory/store";
import { ENEMY_ARCHETYPES } from "@elder-souls/game-core/actors/enemyArchetypes";
import { classTimingTable, type AttackPhaseSeconds } from "@elder-souls/game-core/equipment/attackTimingTable";
import { useGameStore } from "../sandboxStore";
import { FullscreenButton } from "./FullscreenButton";
import { t } from "./hudText";

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
        {t("text.sandbox.pool-reset")}
      </button>
    </label>
  );
}

const POOL_STEP = 50;
const POOL_MAXIMUM = 400;
const POOL_DEFAULT = 100;

/** Frames per second over the last half second, from the browser's own clock. */
function FpsCounter() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      frames += 1;
      if (now - since >= 500) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);
  return <div className="fps-counter">{fps} {t("text.sandbox.fps")}</div>;
}

function phases(p: AttackPhaseSeconds) {
  return `${p.windup.toFixed(2)} / ${p.active.toFixed(2)} / ${p.recovery.toFixed(2)}`;
}

/**
 * Every melee class's effective light and heavy timing, read-only: the speed
 * table as it plays (`equipment/attackTimingTable`), for the owner to sign.
 */
function TimingPanel() {
  const rows = useMemo(classTimingTable, []);
  return (
    <details className="timing-panel">
      <summary>{t("text.sandbox.timing-heading")}</summary>
      <table>
        <thead>
          <tr>
            <th>{t("text.sandbox.timing-class")}</th>
            <th>{t("text.sandbox.timing-light")}</th>
            <th>{t("text.sandbox.timing-heavy")}</th>
          </tr>
          <tr><th /><th colSpan={2}>{t("text.sandbox.timing-phases")}</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.classId}>
              <td>{row.label}</td>
              <td>{phases(row.light1)}</td>
              <td>{phases(row.heavy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** The sandbox's debug switches: sandbox-only, never part of the game. */
export function DebugPanel() {
  const state = useGameStore();
  // The sliders show what the skill *does*, not the skill number alone: the
  // same curves the rules read (`stats/modifiers`), never a second copy. The
  // weapon skill is whichever one the drawn weapon's class trains.
  const { mainHand } = useEquippedLoadout();
  const marksman = marksmanModifiers(state.marksmanSkill);
  const melee = meleeModifiers(meleeSkillFor(mainHand.stats.class), state.meleeSkill);
  // What the Sneak skill is worth on an unseen blow with the drawn weapon (§121.5).
  const opener = sneakMultiplier(sneakWeaponKindFor(mainHand.stats.class), state.sneakSkill);
  return (
    <details className="debug-panel" data-ui-capture>
      <summary>{t("text.sandbox.debug")}</summary>
      <label>
        <input
          type="checkbox"
          checked={state.enemyEnabled}
          onChange={(event) => state.patch({ enemyEnabled: event.target.checked, lockedOn: false })}
        />
        {t("text.sandbox.enemy-present")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.enemyAiEnabled}
          disabled={!state.enemyEnabled}
          onChange={(event) => state.patch({ enemyAiEnabled: event.target.checked })}
        />
        {t("text.sandbox.enemy-attacks")}
      </label>
      <label className="enemy-count">
        {t("text.sandbox.enemy-count")}: {state.enemyCount}
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
        label={t("text.sandbox.health")}
        value={state.playerMaxHealth}
        onChange={(playerMaxHealth) => state.patch({ playerMaxHealth })}
      />
      <PoolStepper
        label={t("text.sandbox.stamina")}
        value={state.playerMaxStamina}
        onChange={(playerMaxStamina) => state.patch({ playerMaxStamina })}
      />
      <label>
        <input
          type="checkbox"
          checked={state.poiseEnabled}
          onChange={(event) => state.patch({ poiseEnabled: event.target.checked })}
        />
        {t("text.sandbox.poise-toggle")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.showWeaponHitboxes}
          onChange={(event) => state.patch({ showWeaponHitboxes: event.target.checked })}
        />
        {t("text.sandbox.show-weapon-volumes")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.showBackstabZones}
          onChange={(event) => state.patch({ showBackstabZones: event.target.checked })}
        />
        {t("text.sandbox.show-backstab-zones")}
      </label>
      {/* Stealth (decision 0092): applies from the next restart. */}
      <label>
        <input
          type="checkbox"
          checked={state.stealthStart}
          onChange={(event) => state.patch({ stealthStart: event.target.checked })}
        />
        {t("text.sandbox.stealth-start")}
      </label>
      <label className="enemy-picker">
        {t("text.sandbox.sneak-skill")}: {state.sneakSkill} ({t("text.sandbox.sneak-opener")} &times;{opener})
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={state.sneakSkill}
          onChange={(event) => state.patch({ sneakSkill: Number(event.target.value) })}
        />
      </label>
      <label className="enemy-picker">
        {t("text.sandbox.ambient-light")}: {state.ambientLight.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={state.ambientLight}
          onChange={(event) => state.patch({ ambientLight: Number(event.target.value) })}
        />
      </label>
      <label className="enemy-picker">
        {t("text.sandbox.enemy")}:
        <select
          value={state.enemyArchetypeId}
          onChange={(event) => state.patch({ enemyArchetypeId: event.target.value })}
        >
          {Object.values(ENEMY_ARCHETYPES).map((archetype) => (
            <option key={archetype.id} value={archetype.id}>
              {archetype.label}: {archetype.loadout.mainHand.label}
              {archetype.loadout.offHand ? `, ${t("text.sandbox.with-shield")}` : ""}
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
        {t("text.sandbox.foot-driven")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.lockedSpeedFollowsClip}
          onChange={(event) => state.patch({ lockedSpeedFollowsClip: event.target.checked })}
        />
        {t("text.sandbox.locked-speed-follows-clip")}
      </label>
      <label className="enemy-picker">
        {t("text.sandbox.locked-stride-rate")}: {state.lockedStrideRate.toFixed(2)}&times;
        <input
          type="range"
          min={1}
          max={2.5}
          step={0.05}
          value={state.lockedStrideRate}
          onChange={(event) => state.patch({ lockedStrideRate: Number(event.target.value) })}
        />
      </label>
      <label className="enemy-picker">
        {t("text.sandbox.arrow-gravity")}: {state.arrowGravityScale.toFixed(2)}&times;
        <input
          type="range"
          min={1}
          max={3}
          step={0.25}
          value={state.arrowGravityScale}
          onChange={(event) => state.patch({ arrowGravityScale: Number(event.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.skillsEnabled}
          onChange={(event) => state.patch({ skillsEnabled: event.target.checked })}
        />
        {t("text.sandbox.skills-enabled")}
      </label>
      <label className="enemy-picker">
        {t("text.sandbox.marksman-skill")}: {state.marksmanSkill} ({t("text.sandbox.nock")} &times;{marksman.nockSpeed.toFixed(2)}, {t("text.sandbox.draw")} &times;{marksman.drawSpeed.toFixed(2)}, {t("text.sandbox.range-position")} {marksman.damage.toFixed(2)})
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={state.marksmanSkill}
          onChange={(event) => state.patch({ marksmanSkill: Number(event.target.value) })}
        />
      </label>
      <label className="enemy-picker">
        {t("text.sandbox.melee-skill")}: {state.meleeSkill} ({t("text.sandbox.range-position")} {melee.damagePosition.toFixed(2)}, {t("text.sandbox.stamina-cost")} &times;{melee.staminaCost.toFixed(2)})
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={state.meleeSkill}
          onChange={(event) => state.patch({ meleeSkill: Number(event.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.classEffectsEnabled}
          onChange={(event) => state.patch({ classEffectsEnabled: event.target.checked })}
        />
        {t("text.sandbox.class-effects")}
      </label>
      <TimingPanel />
      <label className="enemy-picker">
        {t("text.sandbox.bow-view")}:
        <select
          value={state.aimView}
          onChange={(event) => state.patch({ aimView: event.target.value as AimView })}
        >
          <option value="firstPerson">{t("text.sandbox.bow-view-first-person")}</option>
          <option value="shoulder">{t("text.sandbox.bow-view-shoulder")}</option>
          <option value="eye">{t("text.sandbox.bow-view-eye")}</option>
        </select>
      </label>
      {state.aiming && (
        <div className="aim-error">
          {/* How far the shot's line is from the crosshair ray, in degrees.
              Zero where the crosshair lands; the rest is the parallax of a
              bow held beside the camera rather than behind it. */}
          {t("text.sandbox.aim-error")}: {state.aimErrorDegrees.toFixed(2)}&deg;
        </div>
      )}
      <FpsCounter />

      <label>
        <input
          type="checkbox"
          checked={state.showHitboxes}
          onChange={(event) => state.patch({ showHitboxes: event.target.checked })}
        />
        {t("text.sandbox.show-colliders")}
      </label>
      <FullscreenButton />
      <button onClick={state.reset}>{t("text.sandbox.reset-restart")}</button>
    </details>
  );
}
