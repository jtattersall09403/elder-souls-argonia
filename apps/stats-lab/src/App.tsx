import { useMemo, useState } from "react";
import * as s from "@elder-souls/game-core/stats/index";
import type { Sex } from "@elder-souls/game-core/stats/index";
import { LineChart } from "./Chart";
import {
  ATTRIBUTE_ORDER, LAB_SKILLS, climbRows, combatRows, curvePoints, derivedRows, ladderRows,
  referenceState, stateFromCreation, type LabSkill, type LabState, type MeleeSkill, type Row,
} from "./model";
import { attributeName, bandName, className, invariantName, raceName, skillName, ui } from "./text";

const MELEE: MeleeSkill[] = ["longBlade", "blunt", "axe", "spear", "shortBlade", "handToHand"];
const fmt = (v: number | string) =>
  typeof v === "string" ? ui(v) : v === Infinity ? "∞" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <output>{value}</output>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <table>
      <tbody>{rows.map((r) => <tr key={r.key}><td>{ui(r.key)}</td><td>{fmt(r.value)}</td></tr>)}</tbody>
    </table>
  );
}

type Harness = { results: unknown; invariants: { id: string; pass: boolean; detail: string }[] };

function HarnessPanel() {
  const [out, setOut] = useState<Harness | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const sim = await import("@elder-souls/game-core/stats/sim/run");
    setOut(sim.runSim() as Harness);
    setBusy(false);
  };
  return (
    <section>
      <h2>{ui("harness")}</h2>
      <button onClick={run} disabled={busy}>{ui("run-harness")}</button>
      {out && (
        <table>
          <thead><tr><th>{ui("invariant")}</th><th>{ui("result")}</th></tr></thead>
          <tbody>
            {out.invariants.map((i) => (
              <tr key={i.id}>
                <td>{invariantName(i.id)}</td><td className={i.pass ? "pass" : "fail"}>{ui(i.pass ? "pass" : "fail")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function App() {
  const [st, setSt] = useState<LabState>(referenceState);
  const set = (patch: Partial<LabState>) => setSt((prev) => ({ ...prev, ...patch }));
  const curves = useMemo(() => curvePoints(st.curveSkill, st.attributes), [st.curveSkill, st.attributes]);
  const races = s.STATS_DATA.races.races.map((r) => r.id);
  const classes = s.STATS_DATA.classes.classes.map((c) => c.id);

  return (
    <>
      <h1>{ui("title")}</h1>
      <main>
        <div>
          <section>
            <h2>{ui("character")}</h2>
            <button onClick={() => setSt(referenceState())}>{ui("preset-reference")}</button>
            <label className="select"><span>{ui("race")}</span>
              <select value={st.race} onChange={(e) => setSt(stateFromCreation(e.target.value, st.sex, st.classId))}>
                {races.map((r) => <option key={r} value={r}>{raceName(r)}</option>)}
              </select>
            </label>
            <label className="select"><span>{ui("sex")}</span>
              <select value={st.sex} onChange={(e) => setSt(stateFromCreation(st.race, e.target.value as Sex, st.classId))}>
                {(["male", "female"] as const).map((x) => <option key={x} value={x}>{ui(x)}</option>)}
              </select>
            </label>
            <label className="select"><span>{ui("class")}</span>
              <select value={st.classId} onChange={(e) => setSt(stateFromCreation(st.race, st.sex, e.target.value))}>
                {classes.map((c) => <option key={c} value={c}>{className(c)}</option>)}
              </select>
            </label>
            <Slider label={ui("level")} value={st.level} min={1} max={60} onChange={(level) => set({ level })} />
          </section>
          <section>
            <h2>{ui("attributes")}</h2>
            {ATTRIBUTE_ORDER.map((a) => (
              <Slider key={a} label={attributeName(a)} value={st.attributes[a]} min={0} max={130}
                onChange={(v) => set({ attributes: { ...st.attributes, [a]: v } })} />
            ))}
          </section>
          <section>
            <h2>{ui("skills")}</h2>
            {LAB_SKILLS.map((k) => (
              <Slider key={k} label={skillName(k)} value={st.skills[k]} min={0} max={100}
                onChange={(v) => set({ skills: { ...st.skills, [k]: v } })} />
            ))}
            <Slider label={ui("carried")} value={st.carriedKg} min={0} max={300} onChange={(carriedKg) => set({ carriedKg })} />
            <Slider label={ui("armour-rating")} value={st.armourRating} min={0} max={450} onChange={(armourRating) => set({ armourRating })} />
          </section>
        </div>
        <div>
          <section>
            <h2>{ui("derived")}</h2>
            <Rows rows={derivedRows(st)} />
          </section>
          <section>
            <h2>{ui("weapon")}</h2>
            <label className="select"><span>{ui("weapon")}</span>
              <select value={st.weaponSkill} onChange={(e) => set({ weaponSkill: e.target.value as MeleeSkill })}>
                {MELEE.map((k) => <option key={k} value={k}>{skillName(k)}</option>)}
              </select>
            </label>
            <Rows rows={combatRows(st)} />
          </section>
          <section>
            <h2>{ui("curves")}</h2>
            <label className="select"><span>{ui("curve-skill")}</span>
              <select value={st.curveSkill} onChange={(e) => set({ curveSkill: e.target.value as LabSkill })}>
                {LAB_SKILLS.filter((k) => Object.keys(s.STATS_DATA.skillById[k].bands).length).map((k) => <option key={k} value={k}>{skillName(k)}</option>)}
              </select>
            </label>
            {Array.from({ length: Math.ceil(curves.length / 4) }, (_, i) => curves.slice(i * 4, i * 4 + 4)).map((group) => (
              <LineChart key={group[0].band} xLabel={ui("skill-value")} yLabel={ui("multiplier")}
                series={group.map((c) => ({ id: c.band, label: bandName(c.band), points: c.points }))} />
            ))}
          </section>
          <section>
            <h2>{ui("ladder")}</h2>
            <table>
              <thead><tr><th>{ui("band")}</th><th>{ui("enemy-health")}</th><th>{ui("enemy-hit")}</th><th>{ui("mitigation")}</th><th>{ui("blows-to-kill-you")}</th></tr></thead>
              <tbody>{ladderRows(st).map((r) => (
                <tr key={r.band}><td>{r.band}</td><td>{r.health.toFixed(0)}</td><td>{r.hit.toFixed(1)}</td><td>{(r.mitigation * 100).toFixed(1)} %</td><td>{r.blowsToKillYou}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <section>
            <h2>{ui("climb")}</h2>
            <table>
              <thead><tr><th>{ui("wall-height")}</th><th>{ui("climb-seconds")}</th><th>{ui("climb-cost")}</th><th>{ui("climb-in-one-go")}</th></tr></thead>
              <tbody>{climbRows(st).map((r) => (
                <tr key={r.height}><td>{r.height}</td><td>{r.seconds.toFixed(1)}</td><td>{r.cost.toFixed(0)}</td><td>{ui(r.inOneGo ? "yes" : "no")}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <HarnessPanel />
        </div>
      </main>
    </>
  );
}
