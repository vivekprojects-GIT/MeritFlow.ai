'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { scaleLinear, scalePoint, scaleBand, scaleSqrt } from 'd3-scale';
import { line as d3Line, area as d3Area, curveMonotoneX } from 'd3-shape';
import { extent, max } from 'd3-array';

/**
 * The chart kit.
 *
 * d3 supplies the maths (scales, ticks, path generators) and React owns the
 * DOM. That split matters: d3's own selection API mutates nodes behind React's
 * back, which fights reconciliation and leaks on unmount. Importing only
 * `d3-scale`/`d3-shape`/`d3-array` keeps the bundle to the parts that earn it
 * instead of pulling the whole d3 meta-package.
 *
 * The palette below is the app's activity-channel set, validated with the
 * six-check procedure against the white canvas: lightness band, chroma floor,
 * CVD separation, normal-vision floor and contrast all pass. Hues are assigned
 * in this fixed order and never cycled — a series keeps its colour when a
 * filter changes the series count, so colour tracks the entity rather than its
 * rank. One caveat from the validation: amber↔teal sit at ΔE 6.4 under tritan
 * vision, which is the floor band, so anywhere those two are adjacent they must
 * also carry a direct label or a gap rather than relying on colour alone.
 */
export const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

/* Deliberately not from SERIES: state is not identity, and reusing a series hue
   for "at risk" would make a category read as a warning. */
export const STATUS = {
  good: 'var(--chart-good)',
  warn: 'var(--chart-warn)',
  bad: 'var(--chart-bad)',
  neutral: 'var(--chart-neutral)',
} as const;

const AXIS = 'var(--chart-axis)';
const GRID = 'var(--chart-grid)';
/* The surface colour, for rings on marks that overlap a fill. In dark mode a
   white ring would be a bright halo, so this follows the theme too. */
const RING = 'var(--chart-ring)';
const HOVER = 'var(--chart-hover)';

/* ── Sizing ──────────────────────────────────────────────────────────────── */

/**
 * Measure the container so text renders at true pixel size.
 *
 * A viewBox alone would scale the labels along with the plot, which is how
 * charts end up with 9px axis text on a phone and 22px on a monitor.
 */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* ResizeObserver fires once on observe(), so the first measurement comes
       from the callback, never a setState in the effect body. */
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* ── Shared chrome ───────────────────────────────────────────────────────── */

export function ChartFrame({
  title,
  hint,
  legend,
  action,
  children,
}: {
  title: string;
  hint?: string;
  legend?: { label: string; color: string }[];
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="m-0 rounded-2xl border border-line bg-canvas p-4">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </figcaption>
      {/* A legend is present whenever there are two or more series, so identity
          is never carried by colour alone. */}
      {legend && legend.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {children}
    </figure>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  /* Flip before the pointer once the card would overhang the right edge. */
  const flip = x > width - 150;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 min-w-[7rem] rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left: flip ? x - 140 : x + 12, top: Math.max(0, y - 12) }}
    >
      {children}
    </div>
  );
}

function EmptyPlot({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-line-strong bg-elevated/40 text-xs text-faint"
      style={{ height }}
    >
      {message}
    </div>
  );
}

/* ── Trend ───────────────────────────────────────────────────────────────── */

export type TrendPoint = { date: string; value: number };

/**
 * Change over time, as an area with a crosshair.
 *
 * Area rather than bars because the question is shape — is the cohort speeding
 * up or drifting — not the exact value of any one day.
 */
export function TrendChart({
  data,
  height = 180,
  color = SERIES[0],
  valueLabel = 'lessons',
  emptyMessage = 'No activity recorded yet.',
}: {
  data: TrendPoint[];
  height?: number;
  color?: string;
  valueLabel?: string;
  emptyMessage?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const uid = useId();
  const [hover, setHover] = useState<number | null>(null);

  const m = { top: 8, right: 8, bottom: 22, left: 30 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;

  const onMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (data.length === 0 || iw <= 0) return;
      const box = e.currentTarget.getBoundingClientRect();
      const rel = (e.clientX - box.left) / box.width;
      setHover(Math.min(data.length - 1, Math.max(0, Math.round(rel * (data.length - 1)))));
    },
    [data.length, iw],
  );

  if (data.length === 0) return <EmptyPlot height={height} message={emptyMessage} />;

  const x = scalePoint<number>()
    .domain(data.map((_, i) => i))
    .range([0, iw]);
  const peak = max(data, (d) => d.value) ?? 0;
  /* Never a zero-height domain: a flat all-zero series should read as a floor,
     not as a full-height band. */
  const y = scaleLinear().domain([0, Math.max(peak, 1)]).nice(4).range([ih, 0]);

  const px = (i: number) => x(i) ?? 0;
  const areaPath = d3Area<TrendPoint>().x((_, i) => px(i)).y0(ih).y1((d) => y(d.value)).curve(curveMonotoneX)(data);
  const linePath = d3Line<TrendPoint>().x((_, i) => px(i)).y((d) => y(d.value)).curve(curveMonotoneX)(data);
  /* Derived from React's own unique id, not from the colour: the colour is now
     a `var(--chart-1)` string, and slicing that produced an id containing
     parentheses, which is not a valid fragment reference for url(#…). */
  const gid = `trend-${uid.replace(/:/g, '')}`;
  const active = hover != null ? data[hover] : null;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          style={{ maxWidth: '100%' }}
          role="img"
          aria-label={`${valueLabel} per day over the last ${data.length} days`}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <g transform={`translate(${m.left},${m.top})`}>
            {/* Recessive grid, present enough to read a value against, quiet
                enough that the data stays the loudest thing in the frame. */}
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS}>
                  {t}
                </text>
              </g>
            ))}
            {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
            {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />}

            {active && hover != null && (
              <g>
                <line x1={px(hover)} x2={px(hover)} y1={0} y2={ih} stroke={color} strokeWidth={1} strokeDasharray="3 3" />
                {/* A surface-coloured ring keeps the marker legible where it
                    overlaps the filled area. */}
                <circle cx={px(hover)} cy={y(active.value)} r={5} fill={color} stroke={RING} strokeWidth={2} />
              </g>
            )}

            {data.map((d, i) =>
              i % Math.ceil(data.length / 6) === 0 ? (
                <text key={d.date} x={px(i)} y={ih + 15} textAnchor="middle" fontSize={10} fill={AXIS}>
                  {d.date.slice(5)}
                </text>
              ) : null,
            )}

            {/* One capture surface rather than per-point targets: the pointer
                never has to find a 4px dot. */}
            <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} style={{ cursor: 'crosshair' }} />
          </g>
        </svg>
      )}
      {active && hover != null && (
        <Tooltip x={m.left + px(hover)} y={m.top + y(active.value)} width={width}>
          <p className="font-semibold text-ink">{active.date}</p>
          <p className="text-muted">
            {active.value} {valueLabel}
          </p>
        </Tooltip>
      )}
    </div>
  );
}

/* ── Ranked bars ─────────────────────────────────────────────────────────── */

export type BarDatum = { label: string; value: number; sub?: string; color?: string };

/** Ranked magnitude. Horizontal because category names are words, not dates. */
export function RankedBars({
  data,
  height,
  color = SERIES[0],
  valueSuffix = '',
  onSelect,
  emptyMessage = 'Nothing to rank yet.',
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  valueSuffix?: string;
  onSelect?: (d: BarDatum) => void;
  emptyMessage?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) return <EmptyPlot height={height ?? 120} message={emptyMessage} />;

  const rowH = 28;
  const h = height ?? data.length * rowH + 8;
  const labelW = Math.min(150, Math.max(80, width * 0.32));
  const iw = Math.max(0, width - labelW - 48);

  const y = scaleBand<number>().domain(data.map((_, i) => i)).range([0, data.length * rowH]).padding(0.32);
  const x = scaleLinear().domain([0, Math.max(max(data, (d) => d.value) ?? 0, 1)]).range([0, iw]);

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && (
        <svg width={width} height={h} style={{ maxWidth: '100%' }} role="img" aria-label="Ranked comparison">
          {data.map((d, i) => {
            const bw = Math.max(2, x(d.value));
            const by = y(i) ?? 0;
            const fill = d.color ?? color;
            return (
              <g
                key={d.label}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onClick={() => onSelect?.(d)}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
              >
                {/* Full-row hit target: the pointer should not have to land on
                    a 6px bar to get a tooltip. */}
                <rect x={0} y={by - 4} width={width} height={rowH} fill={hover === i ? HOVER : 'transparent'} rx={6} />
                <text x={0} y={by + (y.bandwidth() ?? 8) / 2} dy="0.32em" fontSize={11} fill="var(--color-ink)">
                  {d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label}
                </text>
                {/* 4px rounded ends anchored to the baseline. */}
                <rect x={labelW} y={by} width={bw} height={y.bandwidth()} rx={4} fill={fill} opacity={hover === i ? 1 : 0.85} />
                <text x={labelW + bw + 6} y={by + y.bandwidth() / 2} dy="0.32em" fontSize={11} fill="var(--color-muted)">
                  {d.value}
                  {valueSuffix}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && data[hover].sub && (
        <Tooltip x={labelW} y={(y(hover) ?? 0) + 4} width={width}>
          <p className="font-semibold text-ink">{data[hover].label}</p>
          <p className="text-muted">{data[hover].sub}</p>
        </Tooltip>
      )}
    </div>
  );
}

/* ── Class health scatter ────────────────────────────────────────────────── */

export type HealthPoint = { id: string; label: string; x: number; y: number; size: number; sub?: string };

/**
 * Two measures at once, without a second y-axis.
 *
 * Dual-axis charts are the most common way a dashboard lies — the crossover
 * point is an artefact of two arbitrary scales. A scatter puts both measures in
 * real space, and the quadrant lines make "small but thriving" and "large but
 * stalling" legible at a glance.
 */
export function HealthScatter({
  data,
  height = 260,
  xLabel,
  yLabel,
  onSelect,
  emptyMessage = 'No classes to plot yet.',
}: {
  data: HealthPoint[];
  height?: number;
  xLabel: string;
  yLabel: string;
  onSelect?: (d: HealthPoint) => void;
  emptyMessage?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const m = { top: 10, right: 14, bottom: 34, left: 40 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;

  if (data.length === 0) return <EmptyPlot height={height} message={emptyMessage} />;

  const xd = extent(data, (d) => d.x) as [number, number];
  const x = scaleLinear().domain([0, Math.max(xd[1] ?? 1, 1)]).nice(4).range([0, iw]);
  const y = scaleLinear().domain([0, 100]).range([ih, 0]);
  const r = scaleSqrt().domain([0, Math.max(max(data, (d) => d.size) ?? 1, 1)]).range([4, 18]);

  /* Reference lines at the cohort's own midpoint, so "behind" means behind
     these peers rather than behind an invented benchmark. */
  const midX = x((xd[1] ?? 0) / 2);
  const midY = y(50);
  const active = data.find((d) => d.id === hover) ?? null;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && (
        <svg width={width} height={height} style={{ maxWidth: '100%' }} role="img" aria-label={`${yLabel} against ${xLabel}, one dot per class`}>
          <g transform={`translate(${m.left},${m.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS}>
                  {t}%
                </text>
              </g>
            ))}
            <line x1={midX} x2={midX} y1={0} y2={ih} stroke={AXIS} strokeDasharray="4 4" strokeWidth={1} opacity={0.5} />
            <line x1={0} x2={iw} y1={midY} y2={midY} stroke={AXIS} strokeDasharray="4 4" strokeWidth={1} opacity={0.5} />

            {data.map((d) => {
              /* Status, not identity: these are health states, so they use the
                 reserved status palette and are restated in the tooltip text. */
              const tone = d.y >= 60 ? STATUS.good : d.y >= 25 ? STATUS.warn : STATUS.bad;
              return (
                <circle
                  key={d.id}
                  cx={x(d.x)}
                  cy={y(d.y)}
                  r={r(d.size)}
                  fill={tone}
                  fillOpacity={hover === d.id ? 0.85 : 0.5}
                  stroke="#fff"
                  strokeWidth={2}
                  onPointerEnter={() => setHover(d.id)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => onSelect?.(d)}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                />
              );
            })}

            <text x={iw / 2} y={ih + 26} textAnchor="middle" fontSize={10} fill={AXIS}>
              {xLabel}
            </text>
            <text transform={`translate(${-30},${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill={AXIS}>
              {yLabel}
            </text>
          </g>
        </svg>
      )}
      {active && (
        <Tooltip x={m.left + x(active.x)} y={m.top + y(active.y)} width={width}>
          <p className="font-semibold text-ink">{active.label}</p>
          <p className="text-muted">
            {active.y}% {yLabel.toLowerCase()} · {active.x} {xLabel.toLowerCase()}
          </p>
          {active.sub && <p className="text-faint">{active.sub}</p>}
        </Tooltip>
      )}
    </div>
  );
}

/* ── Funnel ──────────────────────────────────────────────────────────────── */

export type FunnelStage = { label: string; value: number; hint?: string };

/**
 * Stage-to-stage conversion.
 *
 * Rendered as bars against a shared baseline rather than a tapering trapezoid:
 * a real funnel shape encodes the value in *area*, which people read badly and
 * which exaggerates every drop.
 */
export function Funnel({ stages, emptyMessage = 'No enrolments yet.' }: { stages: FunnelStage[]; emptyMessage?: string }) {
  const top = stages[0]?.value ?? 0;
  const [hover, setHover] = useState<number | null>(null);
  if (stages.length === 0 || top === 0) return <EmptyPlot height={120} message={emptyMessage} />;

  return (
    <ol className="space-y-3">
      {stages.map((s, i) => {
        const pct = Math.round((s.value / top) * 100);
        const prev = i > 0 ? stages[i - 1].value : null;
        const drop = prev != null && prev > 0 ? Math.round(((prev - s.value) / prev) * 100) : null;
        const color = SERIES[Math.min(i, SERIES.length - 1)];
        const active = hover === i;
        return (
          <li
            key={s.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="group cursor-default"
          >
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={`font-semibold transition-colors ${active ? 'text-ink' : 'text-ink/80'}`}>{s.label}</span>
              <span className="tabular-nums text-muted">
                <span className="font-bold text-ink">{s.value}</span> · {pct}%
                {active && prev != null && (
                  <span className="ml-1.5 text-faint">({s.value} of {prev} advanced)</span>
                )}
              </span>
            </div>
            {/* Depth from a layered gradient and an inner highlight; a sheen
                sweeps once on hover. Interactivity is the row, not a tooltip
                chasing the cursor. */}
            <div className={`mt-1.5 h-3.5 overflow-hidden rounded-full bg-elevated transition-shadow ${active ? 'shadow-[inset_0_0_0_1px_var(--color-line)]' : ''}`}>
              <div
                className="relative h-full overflow-hidden rounded-full transition-[width,filter] duration-700 ease-out"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: `linear-gradient(180deg, color-mix(in oklab, ${color} 82%, white) 0%, ${color} 55%, color-mix(in oklab, ${color} 78%, black) 100%)`,
                  filter: active ? 'brightness(1.08) saturate(1.1)' : 'none',
                }}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 w-16 -skew-x-12 bg-white/25 blur-[2px] transition-transform duration-700 ${
                    active ? 'translate-x-[400%]' : '-translate-x-24'
                  }`}
                />
              </div>
            </div>
            {drop != null && drop > 0 && (
              <p className={`mt-1 text-[11px] transition-colors ${active ? 'text-warn' : 'text-faint'}`}>
                {drop}% fell away here{s.hint ? `, ${s.hint}` : ''}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Distribution ────────────────────────────────────────────────────────── */

/**
 * Where the cohort actually sits.
 *
 * An average hides the shape that matters: "58% mean" reads identically for a
 * cohort clustered at 58 and one split between 20 and 95, and only the second
 * needs intervention.
 */
export function Histogram({
  values,
  bucketCount = 10,
  height = 140,
  color = SERIES[1],
  emptyMessage = 'No graded work yet.',
}: {
  values: number[];
  bucketCount?: number;
  height?: number;
  color?: string;
  emptyMessage?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (values.length === 0) return <EmptyPlot height={height} message={emptyMessage} />;

  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const v of values) {
    const i = Math.min(bucketCount - 1, Math.max(0, Math.floor((v / 100) * bucketCount)));
    buckets[i] += 1;
  }

  const m = { top: 6, right: 4, bottom: 18, left: 4 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;
  const x = scaleBand<number>().domain(buckets.map((_, i) => i)).range([0, iw]).padding(0.18);
  const y = scaleLinear().domain([0, Math.max(max(buckets) ?? 1, 1)]).range([ih, 0]);

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && (
        <svg width={width} height={height} style={{ maxWidth: '100%' }} role="img" aria-label="Distribution of scores across the cohort">
          <g transform={`translate(${m.left},${m.top})`}>
            {buckets.map((count, i) => {
              const bh = ih - y(count);
              return (
                <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <rect x={x(i)} y={0} width={x.bandwidth()} height={ih} fill="transparent" />
                  <rect
                    x={x(i)}
                    y={y(count)}
                    width={x.bandwidth()}
                    height={Math.max(bh, count > 0 ? 2 : 0)}
                    rx={4}
                    fill={color}
                    opacity={hover === null || hover === i ? 0.9 : 0.4}
                  />
                </g>
              );
            })}
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke={GRID} />
            <text x={0} y={ih + 13} fontSize={10} fill={AXIS}>
              0%
            </text>
            <text x={iw} y={ih + 13} textAnchor="end" fontSize={10} fill={AXIS}>
              100%
            </text>
          </g>
        </svg>
      )}
      {hover != null && (
        <Tooltip x={(x(hover) ?? 0) + m.left} y={m.top} width={width}>
          <p className="font-semibold text-ink">
            {hover * (100 / bucketCount)}–{(hover + 1) * (100 / bucketCount)}%
          </p>
          <p className="text-muted">
            {buckets[hover]} {buckets[hover] === 1 ? 'learner' : 'learners'}
          </p>
        </Tooltip>
      )}
    </div>
  );
}

/* ── Sparkline ───────────────────────────────────────────────────────────── */

/** A shape cue inside a stat tile. No axes — the number beside it is the value. */
export function Sparkline({ values, color = SERIES[0], width = 72, height = 22 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const x = scaleLinear().domain([0, values.length - 1]).range([1, width - 1]);
  const y = scaleLinear().domain([0, Math.max(max(values) ?? 1, 1)]).range([height - 2, 2]);
  const path = d3Line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)(values);
  return (
    <svg width={width} height={height} style={{ maxWidth: '100%' }} aria-hidden className="overflow-visible">
      {path && <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" opacity={0.85} />}
    </svg>
  );
}

/* ── Radial gauge ────────────────────────────────────────────────────────── */

/**
 * One percentage, as a ring with the number inside.
 *
 * This is a stat tile that happens to have a plot, not a chart: there is a
 * single value and no comparison, so the number carries the message and the arc
 * only gives it a sense of scale. The ring is deliberately open at the bottom —
 * a closed circle reads as a pie, which invites a comparison that is not there.
 */
export function RadialGauge({
  value,
  label,
  size = 104,
  color,
  sub,
}: {
  value: number;
  label: string;
  size?: number;
  color?: string;
  sub?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  /* 270 degrees of sweep starting bottom-left, so the gap sits under the
     number rather than cutting through the arc. */
  const START = 135;
  const SWEEP = 270;
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cx + r * Math.sin(rad)] as const;
  };
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = toXY(fromDeg);
    const [x2, y2] = toXY(toDeg);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${toDeg - fromDeg > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  /* Tone follows the value, from the reserved status palette: this is a state
     ("are they on track"), not a category. */
  const tone = color ?? (pct >= 75 ? STATUS.good : pct >= 40 ? SERIES[0] : STATUS.warn);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${label}: ${pct} percent`}>
          <path d={arc(START, START + SWEEP)} fill="none" stroke={GRID} strokeWidth={stroke} strokeLinecap="round" />
          <path
            d={arc(START, START + (SWEEP * pct) / 100)}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black tabular-nums text-ink">{pct}%</span>
        </div>
      </div>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
      {sub && <p className="text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

/* ── Grouped bars ────────────────────────────────────────────────────────── */

export type GroupedDatum = { group: string; values: number[] };

/**
 * Two or three measures per category, side by side.
 *
 * Grouped rather than stacked because the comparison being asked for is inside
 * each category. Stacking makes every segment except the bottom one start from
 * a different baseline, and nobody reads those accurately.
 */
export function GroupedBars({
  data,
  series,
  height = 220,
  valueSuffix = '',
  emptyMessage = 'Nothing to compare yet.',
}: {
  data: GroupedDatum[];
  series: string[];
  height?: number;
  valueSuffix?: string;
  emptyMessage?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);

  const m = { top: 10, right: 8, bottom: 34, left: 34 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;

  if (data.length === 0) return <EmptyPlot height={height} message={emptyMessage} />;

  const x0 = scaleBand<number>().domain(data.map((_, i) => i)).range([0, iw]).padding(0.28);
  const x1 = scaleBand<number>().domain(series.map((_, i) => i)).range([0, x0.bandwidth()]).padding(0.18);
  const peak = max(data, (d) => max(d.values) ?? 0) ?? 0;
  const y = scaleLinear().domain([0, Math.max(peak, 1)]).nice(4).range([ih, 0]);
  const active = hover ? data[hover.g] : null;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && (
        <svg width={width} height={height} style={{ maxWidth: '100%' }} role="img" aria-label={`${series.join(' and ')} by category`}>
          <g transform={`translate(${m.left},${m.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={-7} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS}>
                  {t}
                </text>
              </g>
            ))}

            {data.map((d, gi) =>
              d.values.map((v, si) => {
                const bx = (x0(gi) ?? 0) + (x1(si) ?? 0);
                const bh = Math.max(ih - y(v), v > 0 ? 2 : 0);
                const on = hover != null && hover.g === gi;
                return (
                  <rect
                    key={`${gi}-${si}`}
                    x={bx}
                    y={y(v)}
                    width={x1.bandwidth()}
                    height={bh}
                    rx={4}
                    fill={SERIES[si % SERIES.length]}
                    opacity={hover == null || on ? 0.92 : 0.38}
                    onPointerEnter={() => setHover({ g: gi, s: si })}
                    onPointerLeave={() => setHover(null)}
                  />
                );
              }),
            )}

            {data.map((d, gi) => (
              <text
                key={d.group}
                x={(x0(gi) ?? 0) + x0.bandwidth() / 2}
                y={ih + 16}
                textAnchor="middle"
                fontSize={10}
                fill={AXIS}
              >
                {d.group.length > 12 ? `${d.group.slice(0, 11)}…` : d.group}
              </text>
            ))}
          </g>
        </svg>
      )}
      {active && hover && (
        <Tooltip x={m.left + (x0(hover.g) ?? 0)} y={m.top} width={width}>
          <p className="font-semibold text-ink">{active.group}</p>
          {active.values.map((v, i) => (
            <p key={i} className="flex items-center gap-1.5 text-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
              {series[i]}: {v}
              {valueSuffix}
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/* ── Multi-series trend ──────────────────────────────────────────────────── */

export type MultiTrendPoint = { label: string; values: number[] };

/**
 * Two measures over the same period, on one shared axis.
 *
 * Both series are plotted against a single y-scale, never two. A second axis
 * would let the lines cross wherever the scales happened to put them, which
 * invents a "crossover moment" that is an artefact of the axis choice rather
 * than anything in the data.
 */
export function MultiTrend({
  data,
  series,
  height = 220,
  emptyMessage = 'No history yet.',
}: {
  data: MultiTrendPoint[];
  series: string[];
  height?: number;
  emptyMessage?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const uid = useId();
  const [hover, setHover] = useState<number | null>(null);

  const m = { top: 10, right: 12, bottom: 28, left: 34 };
  const iw = Math.max(0, width - m.left - m.right);
  const ih = height - m.top - m.bottom;

  const onMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (data.length === 0) return;
      const b = e.currentTarget.getBoundingClientRect();
      const rel = (e.clientX - b.left) / b.width;
      setHover(Math.min(data.length - 1, Math.max(0, Math.round(rel * (data.length - 1)))));
    },
    [data.length],
  );

  if (data.length === 0) return <EmptyPlot height={height} message={emptyMessage} />;

  const gid = uid.replace(/:/g, '');
  const x = scalePoint<number>().domain(data.map((_, i) => i)).range([0, iw]);
  const peak = max(data, (d) => max(d.values) ?? 0) ?? 0;
  const y = scaleLinear().domain([0, Math.max(peak, 1)]).nice(4).range([ih, 0]);
  const px = (i: number) => x(i) ?? 0;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          style={{ maxWidth: '100%' }}
          role="img"
          aria-label={`${series.join(' and ')} over ${data.length} periods`}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {series.map((_, si) => (
              <linearGradient key={si} id={`mt-${gid}-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[si % SERIES.length]} stopOpacity={0.24} />
                <stop offset="100%" stopColor={SERIES[si % SERIES.length]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <g transform={`translate(${m.left},${m.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={-7} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS}>
                  {t}
                </text>
              </g>
            ))}

            {series.map((_, si) => {
              const pts = data.map((d) => d.values[si] ?? 0);
              const areaPath = d3Area<number>().x((_, i) => px(i)).y0(ih).y1((v) => y(v)).curve(curveMonotoneX)(pts);
              const linePath = d3Line<number>().x((_, i) => px(i)).y((v) => y(v)).curve(curveMonotoneX)(pts);
              return (
                <g key={si}>
                  {areaPath && <path d={areaPath} fill={`url(#mt-${gid}-${si})`} />}
                  {linePath && (
                    <path d={linePath} fill="none" stroke={SERIES[si % SERIES.length]} strokeWidth={2} strokeLinecap="round" />
                  )}
                </g>
              );
            })}

            {hover != null && (
              <g>
                <line x1={px(hover)} x2={px(hover)} y1={0} y2={ih} stroke={AXIS} strokeDasharray="3 3" />
                {series.map((_, si) => (
                  <circle
                    key={si}
                    cx={px(hover)}
                    cy={y(data[hover].values[si] ?? 0)}
                    r={4.5}
                    fill={SERIES[si % SERIES.length]}
                    stroke={RING}
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}

            {data.map((d, i) =>
              i % Math.ceil(data.length / 5) === 0 ? (
                <text key={d.label} x={px(i)} y={ih + 16} textAnchor="middle" fontSize={10} fill={AXIS}>
                  {d.label}
                </text>
              ) : null,
            )}

            <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} style={{ cursor: 'crosshair' }} />
          </g>
        </svg>
      )}
      {hover != null && (
        <Tooltip x={m.left + px(hover)} y={m.top} width={width}>
          <p className="font-semibold text-ink">{data[hover].label}</p>
          {series.map((s, i) => (
            <p key={s} className="flex items-center gap-1.5 text-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
              {s}: {data[hover].values[i] ?? 0}
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/* ── Donut breakdown ─────────────────────────────────────────────────────── */

export type Slice = { label: string; value: number };

/**
 * Parts of a whole.
 *
 * Every slice is directly labelled with its share, because angle is the hardest
 * encoding to read accurately — the labels are what make this legible, not the
 * arcs. Use it when the point is "these sum to everything"; to rank the parts
 * against each other, `RankedBars` is the honest form.
 */
export function DonutBreakdown({
  slices,
  size = 150,
  centerLabel,
  emptyMessage = 'Nothing recorded yet.',
}: {
  slices: Slice[];
  size?: number;
  centerLabel?: string;
  emptyMessage?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (slices.length === 0 || total === 0) return <EmptyPlot height={size} message={emptyMessage} />;

  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  /* Each segment's start offset, precomputed. A running `let` mutated inside
     the map would be reassigned during render, which the React compiler
     rejects, and rightly, since a re-render would resume from a stale value. */
  const arcs = slices.reduce<{ dash: number; offset: number }[]>((acc, s) => {
    const prev = acc[acc.length - 1];
    const start = prev ? prev.offset + prev.dash : 0;
    acc.push({ dash: (s.value / total) * circumference, offset: start });
    return acc;
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)} percent`).join(', ')}
        >
          <g transform={`rotate(-90 ${c} ${c})`}>
            {slices.map((s, i) => {
              const { dash, offset } = arcs[i];
              /* A 2px gap between segments so adjacent hues never touch — the
                 amber/teal pair is only 6.4 dE apart under tritan vision and
                 needs the separation to stay distinguishable. */
              const visible = Math.max(dash - 2, 0);
              return (
                <circle
                  key={s.label}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={SERIES[i % SERIES.length]}
                  strokeWidth={hover === i ? stroke + 4 : stroke}
                  strokeDasharray={`${visible} ${circumference - visible}`}
                  strokeDashoffset={-offset}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              );
            })}
          </g>
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-black tabular-nums text-ink">{centerLabel}</span>
          </div>
        )}
      </div>

      {/* Direct labels, always, an arc without its number is a guess. */}
      <ul className="space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.label}
            className="flex items-center gap-2 text-xs"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
            <span className={hover === i ? 'font-semibold text-ink' : 'text-muted'}>{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
