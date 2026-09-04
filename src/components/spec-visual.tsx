'use client';

import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { max, extent } from 'd3-array';
import { SERIES, ChartFrame, GroupedBars, MultiTrend, DonutBreakdown } from './charts';
import type { VisualizationSpec } from '@/lib/visualization-spec';

/**
 * The trusted renderers.
 *
 * Nothing here is generated. The model supplies a validated `VisualizationSpec`
 * and these components decide how it is drawn — which means colour, type,
 * spacing, interaction and dark-mode behaviour are the app's, not the model's,
 * and they are identical across every visual in the product.
 *
 * Where a form already exists in the chart kit, this delegates to it rather
 * than drawing a second version. A "line chart the assistant made" and a "line
 * chart the dashboard made" should not be two different line charts.
 */

export function SpecVisual({ spec }: { spec: VisualizationSpec }) {
  const legend =
    (spec.type === 'bar' || spec.type === 'line') && spec.series.length > 1
      ? spec.series.map((s, i) => ({ label: s, color: SERIES[i % SERIES.length] }))
      : undefined;

  return (
    <ChartFrame title={spec.title} hint={spec.caption} legend={legend}>
      <Body spec={spec} />
      {spec.annotations.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2.5">
          {spec.annotations.map((a, i) => (
            <li key={i} className="text-xs text-muted">
              <span className="font-semibold text-ink">{a.target}:</span> {a.text}
            </li>
          ))}
        </ul>
      )}
    </ChartFrame>
  );
}

function Body({ spec }: { spec: VisualizationSpec }) {
  switch (spec.type) {
    case 'bar':
      return (
        <GroupedBars
          data={spec.data.map((d) => ({ group: d.category, values: d.values }))}
          series={spec.series}
        />
      );
    case 'line':
      return <MultiTrend data={spec.data.map((d) => ({ label: d.x, values: d.values }))} series={spec.series} />;
    case 'parts':
      return <DonutBreakdown slices={spec.data.map((d) => ({ label: d.label, value: d.value }))} />;
    case 'scatter':
      return <SpecScatter spec={spec} />;
    case 'process':
      return <SpecProcess spec={spec} />;
    case 'timeline':
      return <SpecTimeline spec={spec} />;
    case 'network':
      return <SpecNetwork spec={spec} />;
    case 'compare':
      return <SpecCompare spec={spec} />;
  }
}

/* ── Scatter ─────────────────────────────────────────────────────────────── */

function SpecScatter({ spec }: { spec: Extract<VisualizationSpec, { type: 'scatter' }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 320;
  const m = { top: 12, right: 16, bottom: 42, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const xd = extent(spec.data, (d) => d.x) as [number, number];
  const yd = extent(spec.data, (d) => d.y) as [number, number];
  const x = scaleLinear().domain(xd).nice(5).range([0, iw]);
  const y = scaleLinear().domain(yd).nice(5).range([ih, 0]);
  const rMax = max(spec.data, (d) => d.size ?? 0) ?? 0;
  const r = (v?: number) => (rMax > 0 && v != null ? 4 + (v / rMax) * 10 : 5);

  const active = hover != null ? spec.data[hover] : null;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={`${spec.yLabel} against ${spec.xLabel}`}>
        <g transform={`translate(${m.left},${m.top})`}>
          {y.ticks(5).map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--chart-axis)">
                {t}
              </text>
            </g>
          ))}
          {x.ticks(6).map((t) => (
            <text key={t} x={x(t)} y={ih + 16} textAnchor="middle" fontSize={10} fill="var(--chart-axis)">
              {t}
            </text>
          ))}
          {spec.data.map((d, i) => (
            <circle
              key={`${d.label}-${i}`}
              cx={x(d.x)}
              cy={y(d.y)}
              r={r(d.size)}
              fill={SERIES[0]}
              fillOpacity={hover === null || hover === i ? 0.75 : 0.25}
              stroke="var(--chart-ring)"
              strokeWidth={1.5}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
          <text x={iw / 2} y={ih + 34} textAnchor="middle" fontSize={11} fill="var(--chart-axis)">
            {spec.xLabel}
          </text>
          <text transform={`translate(${-38},${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--chart-axis)">
            {spec.yLabel}
          </text>
        </g>
      </svg>
      {active && (
        <p role="status" className="mt-1 text-xs text-muted">
          <span className="font-semibold text-ink">{active.label}</span> · {spec.xLabel} {active.x} · {spec.yLabel}{' '}
          {active.y}
        </p>
      )}
    </div>
  );
}

/* ── Process ─────────────────────────────────────────────────────────────── */

function SpecProcess({ spec }: { spec: Extract<VisualizationSpec, { type: 'process' }> }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ol className="space-y-2">
      {spec.steps.map((s, i) => {
        const on = open === i;
        return (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => setOpen(on ? null : i)}
              aria-expanded={on}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                on ? 'border-accent/40 bg-accent/8' : 'border-line hover:bg-elevated'
              }`}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white"
                style={{ background: SERIES[i % SERIES.length] }}
              >
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-semibold text-ink">{s.label}</span>
            </button>
            {on && s.detail && <p className="mt-1.5 pl-10 pr-2 text-sm text-muted">{s.detail}</p>}
            {/* A connector, so the steps read as a sequence rather than a list. */}
            {i < spec.steps.length - 1 && <span aria-hidden className="ml-[1.4rem] block h-2 w-px bg-line-strong" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Timeline ────────────────────────────────────────────────────────────── */

function SpecTimeline({ spec }: { spec: Extract<VisualizationSpec, { type: 'timeline' }> }) {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="relative pl-4">
      <span aria-hidden className="absolute inset-y-1 left-[7px] w-px bg-line-strong" />
      <ol className="space-y-3">
        {spec.events.map((e, i) => (
          <li key={`${e.when}-${i}`} className="relative">
            <button
              type="button"
              onClick={() => setSel(sel === i ? null : i)}
              className="flex w-full items-start gap-3 rounded-lg p-1 text-left transition hover:bg-elevated"
            >
              <span
                aria-hidden
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2"
                style={{ background: SERIES[i % SERIES.length], ['--tw-ring-color' as string]: 'var(--chart-ring)' }}
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-faint">{e.when}</span>
                <span className="block text-sm font-semibold text-ink">{e.label}</span>
                {(sel === i || !e.detail) && e.detail && <span className="mt-0.5 block text-sm text-muted">{e.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Network ─────────────────────────────────────────────────────────────── */

/**
 * Concepts and their relationships.
 *
 * Laid out on a circle rather than with a force simulation: a force layout
 * settles somewhere different on every render, so the same concept map would
 * look different each time a learner opened it — and "where things are" is part
 * of how people remember a diagram.
 */
function SpecNetwork({ spec }: { spec: Extract<VisualizationSpec, { type: 'network' }> }) {
  const [sel, setSel] = useState<string | null>(null);
  const W = 640;
  const H = 420;

  const positions = useMemo(() => {
    const n = spec.nodes.length;
    const cx = W / 2;
    const cy = H / 2;
    const rad = Math.min(W, H) / 2 - 70;
    const map = new Map<string, { x: number; y: number }>();
    spec.nodes.forEach((node, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      map.set(node.id, { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
    });
    return map;
  }, [spec.nodes]);

  const groups = [...new Set(spec.nodes.map((n) => n.group ?? 'default'))];
  const neighbours = useMemo(() => {
    if (!sel) return null;
    const s = new Set<string>([sel]);
    for (const e of spec.edges) {
      if (e.from === sel) s.add(e.to);
      if (e.to === sel) s.add(e.from);
    }
    return s;
  }, [sel, spec.edges]);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={spec.caption}>
        {spec.edges.map((e, i) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const dim = neighbours != null && !(neighbours.has(e.from) && neighbours.has(e.to));
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--chart-axis)"
              strokeWidth={1.25}
              opacity={dim ? 0.12 : 0.45}
            />
          );
        })}
        {spec.nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const gi = groups.indexOf(n.group ?? 'default');
          const dim = neighbours != null && !neighbours.has(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              opacity={dim ? 0.25 : 1}
              onClick={() => setSel(sel === n.id ? null : n.id)}
              style={{ cursor: 'pointer' }}
            >
              <circle r={sel === n.id ? 13 : 10} fill={SERIES[gi % SERIES.length]} stroke="var(--chart-ring)" strokeWidth={2} />
              <text y={26} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-ink)">
                {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-faint">
        {sel ? `Showing ${sel} and its direct connections.` : 'Select a concept to isolate its connections.'}
      </p>
    </div>
  );
}

/* ── Compare ─────────────────────────────────────────────────────────────── */

function SpecCompare({ spec }: { spec: Extract<VisualizationSpec, { type: 'compare' }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2 pr-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Attribute</th>
            {spec.items.map((it, i) => (
              <th key={it} className="py-2 pr-3 text-sm font-bold text-ink">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
                  {it}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {spec.rows.map((r) => (
            <tr key={r.attribute}>
              <td className="py-2.5 pr-3 align-top text-xs font-medium text-muted">{r.attribute}</td>
              {r.values.map((v, i) => (
                <td key={i} className="py-2.5 pr-3 align-top text-ink">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
