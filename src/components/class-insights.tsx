'use client';

import { useEffect, useState } from 'react';
import type { ActivityDay, StalledLearner } from '@/lib/analytics';
import { AlertTriangleIcon, CheckIcon, TargetIcon, UserIcon } from './icons';
import { ChartFrame, Funnel, TrendChart } from './charts';

/**
 * Teaching insights for one class.
 *
 * Built around a rule: every element must answer "what should I do differently
 * on Monday?". A completion percentage does not. A named list of learners who
 * have gone quiet does, and so does the lesson the class is stuck on.
 *
 * Where there is not enough data, this says so rather than showing a confident
 * zero — a dashboard that invents precision is worse than one that admits it
 * is early.
 */

type Insights = {
  hasData: boolean;
  enrolled: number;
  started: number;
  activeThisWeek: number;
  neverStarted: number;
  stalled: StalledLearner[];
  stickingPoint: {
    lessonKey: string;
    stoppedHere: number;
    moduleIndex: number;
    lessonIndex: number;
    moduleTitle: string;
    lessonTitle: string;
  } | null;
  activity: ActivityDay[];
};

export function ClassInsights({
  classId,
  className,
  onMessage,
}: {
  classId: string;
  className: string;
  /** Opens the inbox on this learner — the insights list finds who to contact,
      so contacting them should not mean leaving the app. */
  onMessage?: (learner: { userId: string; email: string }) => void;
}) {
  const [data, setData] = useState<Insights | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/classes/${classId}/insights`);
        const json = (await res.json()) as Insights & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setState('error');
          return;
        }
        setData(json);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  if (state === 'loading') {
    return <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (state === 'error' || !data) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
        Insights are unavailable for this class right now.
      </div>
    );
  }

  const engaged = data.enrolled > 0 ? Math.round((data.activeThisWeek / data.enrolled) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* The three numbers that describe a cohort honestly. */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Active this week" value={String(data.activeThisWeek)} sub={`of ${data.enrolled} enrolled`} tone="good" />
        <Stat label="Gone quiet" value={String(data.stalled.length)} sub="7+ days silent" tone={data.stalled.length > 0 ? 'warn' : 'neutral'} />
        <Stat label="Never started" value={String(data.neverStarted)} sub="no lesson opened" tone={data.neverStarted > 0 ? 'warn' : 'neutral'} />
      </div>

      {!data.hasData && (
        <p className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-6 text-center text-sm text-muted">
          No one has completed a lesson in <span className="font-medium text-ink">{className}</span> yet. Insights
          appear as soon as learners start.
        </p>
      )}

      {/* The single most useful thing on this page. */}
      {data.stickingPoint && (
        <div className="rounded-2xl border border-warn/35 bg-warn-soft p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-warn">
            <TargetIcon className="h-3.5 w-3.5" />
            Where the class gets stuck
          </p>
          <p className="mt-2 text-[15px] leading-6 text-ink">
            <strong className="font-semibold">{data.stickingPoint.stoppedHere} learners</strong> stopped advancing at{' '}
            <strong className="font-semibold">
              {data.stickingPoint.moduleIndex + 1}.{data.stickingPoint.lessonIndex + 1} {data.stickingPoint.lessonTitle}
            </strong>
            .
          </p>
          <p className="mt-1 text-sm text-muted">
            That is the lesson to look at first. It is usually pacing or a missing prerequisite, not effort.
          </p>
        </div>
      )}

      {/* Named people, not a percentage. */}
      {data.stalled.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
            <AlertTriangleIcon className="h-4 w-4 text-warn" />
            <h4 className="text-sm font-bold text-ink">Worth a message this week</h4>
            <span className="ml-auto text-xs text-muted">{data.stalled.length} learners</span>
          </div>
          <ul className="divide-y divide-line">
            {data.stalled.slice(0, 6).map((learner) => (
              <li key={learner.studentId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-accent">
                  <UserIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{learner.email}</span>
                <span className="shrink-0 text-xs text-muted">
                  {learner.lessonsCompleted} done · quiet {learner.daysSinceLastLesson}d
                </span>
                <button
                  type="button"
                  onClick={() => onMessage?.({ userId: learner.studentId, email: learner.email })}
                  className="press ring-focus shrink-0 rounded-full border border-line px-3 py-1 text-xs font-semibold text-accent hover:border-accent/40"
                >
                  Message
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.hasData && data.stalled.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <CheckIcon className="h-4 w-4" />
          Nobody has gone quiet. Every learner who started is still moving.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Where the class leaks. Enrolling is not starting, and starting is not
            sticking, three different fixes, so they get three stages. */}
        <ChartFrame title="Where the class is losing people" hint="Each drop is a different problem to solve.">
          <Funnel
            stages={[
              { label: 'Enrolled', value: data.enrolled },
              { label: 'Opened a lesson', value: data.started, hint: 'they never got going' },
              { label: 'Active this week', value: data.activeThisWeek, hint: 'they started, then drifted' },
            ]}
            emptyMessage="Nobody has enrolled yet."
          />
        </ChartFrame>

        {/* 30 days of real completions. Gaps are the point, so they are drawn. */}
        <ChartFrame
          title="Lessons completed · last 30 days"
          hint={`${engaged}% of the class was active this week.`}
        >
          <TrendChart
            data={data.activity.map((d) => ({ date: d.date, value: d.lessons }))}
            height={150}
            valueLabel="lessons completed"
            emptyMessage="No lessons completed in the last 30 days."
          />
        </ChartFrame>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'good' | 'warn' | 'neutral';
}) {
  return (
    <div
      className={[
        'rounded-2xl border px-3.5 py-3',
        tone === 'warn' ? 'border-warn/35 bg-warn-soft' : tone === 'good' ? 'border-success/30 bg-success-soft' : 'border-line bg-surface',
      ].join(' ')}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p
        className={[
          'mt-1 text-2xl font-black tabular-nums',
          tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-success' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}
