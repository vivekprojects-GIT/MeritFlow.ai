'use client';

import { useEffect, useState } from 'react';
import type { ActivityDay, DormantClass } from '@/lib/analytics';
import { AlertTriangleIcon, CheckIcon, LayersIcon, UserIcon } from './icons';
import { TrendChart } from './charts';

/**
 * University-wide activity for an admin.
 *
 * An admin's real questions are about adoption, not averages: is the platform
 * being used, which classes have gone quiet, and which professors never got
 * started. Those are answerable from real events; a "health score" is not.
 */

type Insights = {
  hasData: boolean;
  activeLearners7: number;
  activeLearners30: number;
  neverStarted: number;
  professorsWithoutClass: number;
  dormantClasses: DormantClass[];
  activity: ActivityDay[];
};

export function AdminInsights({ embedded = false }: { embedded?: boolean } = {}) {
  const [data, setData] = useState<Insights | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/insights');
        if (!res.ok) {
          if (!cancelled) setState('hidden');
          return;
        }
        const json = (await res.json()) as Insights;
        if (cancelled) return;
        setData(json);
        setState('ready');
      } catch {
        if (!cancelled) setState('hidden');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return <div className={embedded ? 'h-36 animate-pulse rounded-2xl border border-line bg-canvas' : 'h-36 animate-pulse rounded-2xl border border-line bg-surface'} />;
  }
  if (state === 'hidden' || !data) return null;

  return (
    <section className={embedded ? 'rounded-2xl border border-line bg-canvas p-4' : 'rounded-2xl border border-line bg-surface p-5'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">Adoption across your university</h2>
        <span className="text-xs text-muted">Last 30 days of real learner activity</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active this week" value={String(data.activeLearners7)} sub="learners" tone="good" />
        <Stat label="Active this month" value={String(data.activeLearners30)} sub="learners" tone="neutral" />
        <Stat
          label="Enrolled, never started"
          value={String(data.neverStarted)}
          sub="onboarding gap"
          tone={data.neverStarted > 0 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Professors with no class"
          value={String(data.professorsWithoutClass)}
          sub="adoption gap"
          tone={data.professorsWithoutClass > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {!data.hasData && (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-canvas px-4 py-6 text-center text-sm text-muted">
          No learner activity recorded yet. This fills in once students start completing lessons.
        </p>
      )}

      {data.dormantClasses.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-2.5">
            <AlertTriangleIcon className="h-4 w-4 text-warn" />
            <h3 className="text-sm font-bold text-ink">Classes that have gone quiet</h3>
            <span className="ml-auto text-xs text-muted">{data.dormantClasses.length}</span>
          </div>
          <ul className="divide-y divide-line bg-canvas">
            {data.dormantClasses.slice(0, 6).map((klass) => (
              <li key={klass.classId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint text-accent">
                  <LayersIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{klass.title}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <UserIcon className="h-3 w-3" />
                    {klass.professorEmail}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-warn">
                  {klass.daysQuiet === null ? 'never used' : `quiet ${klass.daysQuiet}d`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.hasData && data.dormantClasses.length === 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <CheckIcon className="h-4 w-4" />
          Every class has had activity in the last two weeks.
        </p>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">
          Lessons completed · last 30 days
        </p>
        {/* Area rather than the bar strip this replaced: over 30 days the
            question is the trajectory, and 30 hairline bars gave a shape you
            had to squint at and a value you could only get from a title
            attribute. */}
        <div className="mt-1">
          <TrendChart
            data={data.activity.map((d) => ({ date: d.date, value: d.lessons }))}
            height={150}
            valueLabel="lessons completed"
            emptyMessage="No lessons completed in the last 30 days."
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'good' | 'warn' | 'neutral' }) {
  return (
    <div
      className={[
        'rounded-xl border px-3.5 py-3',
        tone === 'warn' ? 'border-warn/35 bg-warn-soft' : tone === 'good' ? 'border-success/30 bg-success-soft' : 'border-line bg-canvas',
      ].join(' ')}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className={['mt-1 text-2xl font-black tabular-nums', tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-success' : 'text-ink'].join(' ')}>
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}
