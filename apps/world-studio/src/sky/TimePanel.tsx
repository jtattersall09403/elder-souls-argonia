import { useSyncExternalStore } from "react";
import { MONTHS, type WorldInstant } from "@elder-souls/world-time";
import {
  LIGHT_PRESETS,
  clockVersion,
  formatTimeParam,
  notifyClock,
  setClockInstant,
  subscribeClock,
  worldClock,
  type LightPreset,
} from "./timeState";
import { getLatitudeOverrideDeg, setLatitudeOverrideDeg } from "./WorldSky";

/**
 * Studio time-of-day tooling (module 55 tier 1; module 85 §66): scrubber,
 * date/season field, run-rate control, named region light presets and the
 * latitude debug slider — all captured in the reproducible URL by App.
 */
export function TimePanel({
  onChanged,
  onPreset,
}: {
  /** Called after any clock/latitude change so App reserialises the URL. */
  onChanged: () => void;
  /** Presets also move the camera/spawn — App owns position state. */
  onPreset: (preset: LightPreset) => void;
}) {
  useSyncExternalStore(subscribeClock, clockVersion);
  const instant = worldClock.now();
  const season = worldClock.season();
  const month = MONTHS[instant.month];

  const update = (patch: Partial<WorldInstant>) => {
    setClockInstant({ ...instant, ...patch, day: Math.min(patch.day ?? instant.day, MONTHS[patch.month ?? instant.month].days) });
    onChanged();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 8,
        background: "rgba(10,14,20,0.8)",
        padding: "8px 12px",
        borderRadius: 8,
        color: "#e6ecf5",
        font: "13px system-ui",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: 320,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{formatTimeParam(instant.minuteOfDay)}</strong>
        <span>
          {instant.day} {month.name} ({month.jel}) · {worldClock.weekday()}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1439}
        step={5}
        value={Math.round(instant.minuteOfDay)}
        onChange={(e) => update({ minuteOfDay: Number(e.target.value) })}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={instant.month}
          onChange={(e) => update({ month: Number(e.target.value) })}
          style={{ maxWidth: 150 }}
        >
          {MONTHS.map((m) => (
            <option key={m.index} value={m.index}>
              {m.name} · {m.jel}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={month.days}
          value={instant.day}
          onChange={(e) => update({ day: Math.max(1, Math.min(month.days, Number(e.target.value) || 1)) })}
          style={{ width: 52 }}
        />
        <select
          value={worldClock.rate}
          onChange={(e) => {
            worldClock.rate = Number(e.target.value);
            notifyClock();
            onChanged();
          }}
        >
          <option value={0}>⏸ paused</option>
          <option value={1}>1 min/s</option>
          <option value={10}>10 min/s</option>
          <option value={60}>1 h/s</option>
        </select>
      </div>
      <div style={{ opacity: 0.85 }}>
        {worldClock.dayPhase()} · {season.name} (s {season.s.toFixed(2)})
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value=""
          onChange={(e) => {
            const p = LIGHT_PRESETS.find((x) => x.id === e.target.value);
            if (p) {
              setClockInstant({ era: 4, year: 201, month: p.month, day: p.day, minuteOfDay: p.minuteOfDay });
              onPreset(p);
              onChanged();
            }
          }}
          style={{ maxWidth: 200 }}
        >
          <option value="">— region light preset —</option>
          {LIGHT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label title="Province latitude (debug; canonical −10°, decision 0016)">
          lat°
          <input
            type="number"
            min={-35}
            max={35}
            step={1}
            value={getLatitudeOverrideDeg() ?? -10}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLatitudeOverrideDeg(v === -10 ? null : v);
              notifyClock();
              onChanged();
            }}
            style={{ width: 52, marginLeft: 4 }}
          />
        </label>
      </div>
    </div>
  );
}
