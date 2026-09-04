'use client';

import { useEffect, useState } from 'react';
import type { ActivityDay, LearnerPulse } from '@/lib/analytics';
import { AwardIcon, BookIcon, ClockIcon, SparklesIcon } from './icons';

/**
 * The learner's own study pattern.
 *
 * Same rule as the teaching dashboard: every number traces to something that
 * actually happened, and where there is no data it says so instead of showing
 * a confident zero. Nothing here is predicted or scored.
 */

export function LearnerPulsePanel({ embedded = false }: { embedded?: boolean } = {}) {
  const [pulse, setPulse] = useState<LearnerPulse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/pulse');
        if (!res.ok) {
          if (!cancelled) setState('hidden');
          return;
        }
        const json = (await res.json()) as LearnerPulse;
        if (cancelled) return;
        setPulse(json);
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
    return <div className={embedded ? 'h-32 animate-pulse rounded-2xl border border-line bg-canvas' : 'h-32 animate-pulse rounded-2xl border border-line bg-surface'} />;
  }
  if (state === 'hidden' || !pulse) return null;

  /* Nothing completed yet: one honest line, not a wall of zeroes. */
  if (!pulse.hasData) {
    return (
      <div className={embedded ? 'rounded-2xl border border-dashed border-line bg-canvas px-5 py-6 text-center' : 'rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-6 text-center'}>
        <p className="text-sm font-medium text-ink">Your learning stats appear here</p>
        <p className="mt-1 text-sm text-muted">
          Finish your first lesson and this fills in with your streak, your pace, and when you study best.
        </p>
      </div>
    );
  }

  const cold = (pulse.daysSinceLastLesson ?? 0) >= 3;

  return (
    <section className={embedded ? 'rounded-2xl border border-line bg-canvas p-4' : 'rounded-2xl border border-line bg-surface p-5'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">Your learning</h2>
        <p className="text-xs text-muted">
          {pulse.daysSinceLastLesson === 0
            ? 'You studied today'
            : pulse.daysSinceLastLesson === 1
              ? 'Last lesson yesterday'
              : `Last lesson ${pulse.daysSinceLastLesson} days ago`}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<SparklesIcon className="h-3.5 w-3.5" />}
          label="Streak"
          value={pulse.currentStreak > 0 ? `${pulse.currentStreak} day${pulse.currentStreak === 1 ? '' : 's'}` : '--'}
          sub={pulse.longestStreak > 1 ? `best ${pulse.longestStreak}` : 'start one today'}
          tone={pulse.currentStreak >= 3 ? 'good' : 'neutral'}
        />
        <Stat
          icon={<BookIcon className="h-3.5 w-3.5" />}
          label="Lessons done"
          value={String(pulse.lessonsCompleted)}
          sub="all courses"
          tone="neutral"
        />
        <Stat
          icon={<ClockIcon className="h-3.5 w-3.5" />}
          label="Your pace"
          value={pulse.lessonsPerWeek > 0 ? `${pulse.lessonsPerWeek}/wk` : '--'}
          sub="when you're active"
          tone="neutral"
        />
        <Stat
          icon={<AwardIcon className="h-3.5 w-3.5" />}
          label="Days studied"
          value={`${pulse.activeDays30}`}
          sub="of the last 30"
          tone={pulse.activeDays30 >= 10 ? 'good' : 'neutral'}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-faint">
          <span>30 days ago</span>
          <span>today</span>
        </div>
        <ActivityStrip activity={pulse.activity} />
      </div>

      {cold && (
        <p className="mt-3 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-sm text-ink">
          It has been {pulse.daysSinceLastLesson} days. One lesson today restarts the habit, that is usually all it
          takes.
        </p>
      )}
    </section>
  );
}

/** One cell per day. Empty days are drawn, because the gaps are the point. */
function ActivityStrip({ activity }: { activity: ActivityDay[] }) {
  const peak = Math.max(1, ...activity.map((d) => d.lessons));
  return (
    <div className="mt-1.5 flex gap-[3px]" role="img" aria-label="Lessons completed each day over the last 30 days">
      {activity.map((day) => {
        const share = day.lessons / peak;
        return (
          <span
            key={day.date}
            title={`${day.date}: ${day.lessons} lesson${day.lessons === 1 ? '' : 's'}`}
            className={[
              'h-7 flex-1 rounded-[3px]',
              day.lessons === 0
                ? 'bg-black/[0.06]'
                : share > 0.66
                  ? 'bg-accent'
                  : share > 0.33
                    ? 'bg-accent/70'
                    : 'bg-accent/40',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'good' | 'neutral';
}) {
  return (
    <div className={['rounded-xl border px-3.5 py-3', tone === 'good' ? 'border-success/30 bg-success-soft' : 'border-line bg-canvas'].join(' ')}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
        {icon}
        {label}
      </p>
      <p className={['mt-1 text-xl font-black tabular-nums', tone === 'good' ? 'text-success' : 'text-ink'].join(' ')}>
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}
