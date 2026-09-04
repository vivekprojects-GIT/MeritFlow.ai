'use client';

import { useEffect, useState } from 'react';
import { ChartFrame, RankedBars, SERIES } from './charts';
import type { Cohort } from '@/lib/pacing';
import type { AuditEntry } from '@/lib/audit-log';

/**
 * Term-over-term outcomes, and the access trail.
 *
 * Everything else on the admin dashboard is a snapshot, which can tell you the
 * completion rate is 41% but never whether that is better or worse than last
 * time. Without this there is no way to answer "did the change we made help?" —
 * the question that separates improvement from reporting.
 */
export function AdminCohorts() {
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [trail, setTrail] = useState<AuditEntry[]>([]);
  const [showTrail, setShowTrail] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/cohorts')
      .then((r) => r.json())
      .then((d: { cohorts?: Cohort[]; trail?: AuditEntry[] }) => {
        if (!alive) return;
        setCohorts(d.cohorts ?? []);
        setTrail(d.trail ?? []);
      })
      .catch(() => {
        if (alive) setCohorts([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!cohorts) {
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading cohorts…
      </p>
    );
  }

  const latest = cohorts[cohorts.length - 1];
  const previous = cohorts.length > 1 ? cohorts[cohorts.length - 2] : null;
  const delta = latest && previous ? latest.completionPct - previous.completionPct : null;

  return (
    <div className="space-y-4">
      <ChartFrame
        title="Term over term"
        hint={
          cohorts.length < 2
            ? 'Comparison unlocks once a second term has classes. Label a term on each class to group them.'
            : 'Completion rate by term. Set a term label on each class to control the grouping.'
        }
      >
        {cohorts.length === 0 ? (
          <p className="text-sm text-muted">No classes yet.</p>
        ) : (
          <div className="space-y-3">
            {/* The comparison is withheld, not faked, when there is only one
                term, a single bar labelled "trend" would be a lie. */}
            {delta != null && (
              <p className="text-sm">
                <span className="font-semibold text-ink">{latest.label}</span> completed{' '}
                <span className={delta >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                  {delta >= 0 ? '+' : ''}
                  {delta} points
                </span>{' '}
                {delta >= 0 ? 'more' : 'less'} than {previous?.label}.
              </p>
            )}
            <RankedBars
              data={cohorts.map((c, i) => ({
                label: c.label,
                value: c.completionPct,
                sub: `${c.completed}/${c.enrolled} learners · ${c.classes} ${c.classes === 1 ? 'class' : 'classes'}${
                  c.examPct == null ? '' : ` · exam avg ${c.examPct}%`
                }`,
                color: SERIES[i % SERIES.length],
              }))}
              valueSuffix="%"
              emptyMessage="No cohorts yet."
            />
          </div>
        )}
      </ChartFrame>

      {/* Audit trail */}
      <div className="rounded-2xl border border-line bg-canvas p-4">
        <button
          type="button"
          onClick={() => setShowTrail((v) => !v)}
          aria-expanded={showTrail}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div>
            <h4 className="text-sm font-semibold text-ink">Your access trail</h4>
            <p className="mt-0.5 text-xs text-muted">
              Reading individual student records is logged. {trail.length} recent{' '}
              {trail.length === 1 ? 'entry' : 'entries'}.
            </p>
          </div>
          <span className="text-xs font-semibold text-accent">{showTrail ? 'Hide' : 'Show'}</span>
        </button>

        {showTrail && (
          <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-line">
            {trail.length === 0 ? (
              <p className="p-4 text-sm text-muted">Nothing logged yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-elevated uppercase tracking-wider text-faint">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {trail.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink">{e.action}</td>
                      <td className="px-3 py-2 text-muted">{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
