import { useEffect, useRef, useState } from 'react';

// Runs per day, last 30 days. Each bar stacks graded (bottom, anchored to the
// baseline) under started-but-not-graded, with a 2px surface gap between them.
// Drawn at the container's pixel width so axis text stays 10px on phones.
const H = 180;
const PAD = { top: 8, right: 4, bottom: 22, left: 28 };
const PLOT_H = H - PAD.top - PAD.bottom;
const GAP = 2;
const R = 4;

function niceMax(n) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= n);
}

// Bar with only its top corners rounded, so the data end is soft and the base stays flat.
function topRounded(x, y, w, h) {
  const r = Math.min(R, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const dayLabel = (date, opts = { month: 'short', day: 'numeric' }) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, opts);

export default function ActivityChart({ daily }) {
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(600);
  const box = useRef(null);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...daily.map((d) => d.started)));
  const slot = (W - PAD.left - PAD.right) / daily.length;
  const barW = Math.max(2, slot - GAP);
  const y = (v) => PAD.top + PLOT_H - (v / max) * PLOT_H;
  const ticks = [0, max / 2, max];
  const hovered = hover == null ? null : daily[hover];

  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--color-chart-graded)' }} /> Graded
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--color-chart-started)' }} /> Started, not graded
        </span>
      </div>
      <div className="relative min-w-0" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Runs per day over the last 30 days, graded and not graded">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--color-muted-foreground)">{t}</text>
            </g>
          ))}
          {daily.map((d, i) => {
            const x = PAD.left + i * slot + GAP / 2;
            const gH = (d.graded / max) * PLOT_H;
            const rest = d.started - d.graded;
            const rH = Math.max(0, (rest / max) * PLOT_H - (gH > 0 ? GAP : 0));
            const base = PAD.top + PLOT_H;
            return (
              <g key={d.date} opacity={hover == null || hover === i ? 1 : 0.55}>
                {gH > 0 && (rest > 0
                  ? <rect x={x} y={base - gH} width={barW} height={gH} fill="var(--color-chart-graded)" />
                  : <path d={topRounded(x, base - gH, barW, gH)} fill="var(--color-chart-graded)" />)}
                {rH > 0 && <path d={topRounded(x, base - gH - (gH > 0 ? GAP : 0) - rH, barW, rH)} fill="var(--color-chart-started)" />}
                {(daily.length - 1 - i) % 7 === 0 && (
                  <text
                    x={i === daily.length - 1 ? x + barW : x + barW / 2} y={H - 6}
                    textAnchor={i === daily.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--color-muted-foreground)"
                  >
                    {dayLabel(d.date)}
                  </text>
                )}
                <rect
                  x={PAD.left + i * slot} y={PAD.top} width={slot} height={PLOT_H} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                  aria-label={`${dayLabel(d.date)}: ${d.started} started, ${d.graded} graded`}
                />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm whitespace-nowrap"
            style={{ left: `${(((PAD.left + (hover + 0.5) * slot) / W) * 100).toFixed(2)}%` }}
          >
            <div className="font-medium">{dayLabel(hovered.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
            <div className="text-muted-foreground tabular-nums">{hovered.started} started · {hovered.graded} graded</div>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show as table</summary>
        <div className="mt-2 max-h-60 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50"><tr><th className="px-3 py-1.5 text-left">Day</th><th className="px-3 py-1.5 text-left">Started</th><th className="px-3 py-1.5 text-left">Graded</th></tr></thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t"><td className="px-3 py-1">{dayLabel(d.date)}</td><td className="px-3 py-1 tabular-nums">{d.started}</td><td className="px-3 py-1 tabular-nums">{d.graded}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
