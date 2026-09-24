import { useState } from "react";

/** Up to four series: palette slots 1–4 (dataviz reference palette), fixed order, set per theme in styles.css. */
export type Series = { id: string; label: string; points: [number, number][] };

const W = 520;
const H = 240;
const PAD = { l: 44, r: 96, t: 12, b: 32 };

export function LineChart({ series, xLabel, yLabel }: { series: Series[]; xLabel: string; yLabel: string }) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points.map((p) => p[1]));
  const yMin = Math.min(0, ...all);
  const yMax = Math.max(...all) * 1.05 || 1;
  const xs = series[0]?.points.map((p) => p[0]) ?? [];
  const xMax = xs.at(-1) ?? 100;
  const px = (x: number) => PAD.l + (x / xMax) * (W - PAD.l - PAD.r);
  const py = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const nearest = hoverX === null ? null : xs.reduce((best, x) => (Math.abs(x - hoverX) < Math.abs(best - hoverX) ? x : best), xs[0]);

  return (
    <figure className="chart">
      <div className="legend">
        {series.map((s, i) => (
          <span key={s.id}><i className={`swatch c${i + 1}`} />{s.label}</span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={yLabel}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - box.left) / box.width) * W;
          setHoverX(Math.max(0, Math.min(xMax, ((x - PAD.l) / (W - PAD.l - PAD.r)) * xMax)));
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {ticks.map((y) => (
          <g key={y}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={py(y)} y2={py(y)} />
            <text className="axis" x={PAD.l - 6} y={py(y) + 4} textAnchor="end">{y.toFixed(2)}</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((x) => (
          <text key={x} className="axis" x={px(x)} y={H - PAD.b + 16} textAnchor="middle">{x}</text>
        ))}
        <text className="axis" x={(PAD.l + W - PAD.r) / 2} y={H - 2} textAnchor="middle">{xLabel}</text>
        {series.map((s, i) => {
          const last = s.points.at(-1)!;
          return (
            <g key={s.id}>
              <polyline className={`line c${i + 1}`} fill="none" points={s.points.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")} />
              <text className="direct" x={px(last[0]) + 6} y={py(last[1]) + 4}>{s.label}</text>
            </g>
          );
        })}
        {nearest !== null && (
          <g>
            <line className="crosshair" x1={px(nearest)} x2={px(nearest)} y1={PAD.t} y2={H - PAD.b} />
            {series.map((s, i) => {
              const p = s.points.find((q) => q[0] === nearest)!;
              return <circle key={s.id} className={`dot c${i + 1}`} cx={px(p[0])} cy={py(p[1])} r={4} />;
            })}
          </g>
        )}
      </svg>
      {nearest !== null && (
        <div className="tooltip">
          <strong>{xLabel} {nearest}</strong>
          {series.map((s) => (
            <span key={s.id}>{s.label}: {s.points.find((q) => q[0] === nearest)![1].toFixed(3)}</span>
          ))}
        </div>
      )}
    </figure>
  );
}
