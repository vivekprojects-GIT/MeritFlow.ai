import type { ReactNode } from 'react';

type ModeAnalyticsRow = {
  label: string;
  value: string;
  pct: number;
  tone?: 'good' | 'warn' | 'neutral';
};

export type ModeAnalyticsColumn = {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  rows: ModeAnalyticsRow[];
  signals: string[];
  tone?: 'good' | 'warn' | 'neutral';
};

export type ModeAnalyticsInsight = {
  label: string;
  value: string;
  detail: string;
  tone?: 'good' | 'warn' | 'neutral';
};

export function ModeAnalyticsPanel({
  title,
  subtitle,
  columns,
  insights = [],
}: {
  title: string;
  subtitle: string;
  columns: ModeAnalyticsColumn[];
  insights?: ModeAnalyticsInsight[];
}) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">{title}</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{subtitle}</p>
        </div>
        <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-accent">Create + Learn</span>
      </div>

      {insights.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {insights.map((insight) => (
            <div
              key={insight.label}
              className={[
                'rounded-xl border px-3.5 py-3',
                insight.tone === 'warn'
                  ? 'border-warn/30 bg-warn-soft'
                  : insight.tone === 'good'
                    ? 'border-success/30 bg-success-soft'
                    : 'border-line bg-surface',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{insight.label}</p>
                <p
                  className={[
                    'shrink-0 text-sm font-black tabular-nums',
                    insight.tone === 'warn' ? 'text-warn' : insight.tone === 'good' ? 'text-success' : 'text-ink',
                  ].join(' ')}
                >
                  {insight.value}
                </p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{insight.detail}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {columns.map((column) => (
          <div
            key={column.title}
            className={[
              'rounded-2xl border p-4',
              column.tone === 'warn'
                ? 'border-warn/30 bg-warn-soft'
                : column.tone === 'good'
                  ? 'border-success/30 bg-success-soft'
                  : 'border-line bg-surface',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{column.eyebrow}</p>
                <h3 className="mt-1 text-base font-bold text-ink">{column.title}</h3>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-accent shadow-soft">
                {column.icon}
              </span>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-black tabular-nums tracking-tight text-ink">{column.value}</p>
                <p className="text-xs text-muted">{column.detail}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {column.rows.map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-ink">{row.label}</span>
                    <span
                      className={[
                        'font-semibold',
                        row.tone === 'warn' ? 'text-warn' : row.tone === 'good' ? 'text-success' : 'text-accent',
                      ].join(' ')}
                    >
                      {row.value}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className={[
                        'h-full rounded-full',
                        row.tone === 'warn' ? 'bg-warn' : row.tone === 'good' ? 'bg-success' : 'bg-accent-fill',
                      ].join(' ')}
                      style={{ width: `${clampPct(row.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {column.signals.map((signal) => (
                <span key={signal} className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-muted">
                  {signal}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
