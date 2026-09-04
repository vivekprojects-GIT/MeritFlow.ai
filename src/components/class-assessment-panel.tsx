'use client';

import { useEffect, useState } from 'react';
import { ChartFrame, RankedBars, STATUS } from './charts';
import { AlertTriangleIcon, CheckIcon, TargetIcon } from './icons';
import type { ItemAnalysis, ItemStat } from '@/lib/item-analysis';
import type { ClassPacing, ClassDigest } from '@/lib/pacing';

type Payload = { items: ItemAnalysis; pacing: ClassPacing; digest: ClassDigest | null };

const FLAG_META: Record<Exclude<ItemStat['flag'], 'ok'>, { label: string; color: string }> = {
  'mis-keyed': { label: 'Check the answer key', color: STATUS.bad },
  'too-hard': { label: 'Nobody got this', color: STATUS.warn },
  'no-signal': { label: 'Everyone got this', color: STATUS.neutral },
};

/**
 * Assessment quality, pacing, and the Monday summary for one class.
 *
 * These three answer questions the rest of the dashboard cannot: is the *test*
 * any good, is the class behind *the schedule* rather than behind each other,
 * and what would I put in an email about it.
 */
export function ClassAssessmentPanel({ classId }: { classId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/classes/${classId}/items`)
      .then(async (r) => {
        const d = (await r.json()) as Payload & { error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load assessment data.');
        else setData(d);
      })
      .catch(() => {
        if (alive) setError('Could not load assessment data.');
      });
    return () => {
      alive = false;
    };
  }, [classId]);

  if (error) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!data)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading assessment data…
      </p>
    );

  const { items, pacing, digest } = data;

  return (
    <div className="space-y-4">
      {/* The digest first: it is the summary a professor would actually read. */}
      {digest && digest.items.length > 0 && (
        <section className="rounded-2xl border border-accent/30 bg-mint p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <TargetIcon className="h-3.5 w-3.5" />
            This week, in one paragraph
          </h4>
          <ul className="mt-2 space-y-1.5">
            {digest.items.map((d, i) => (
              <li key={i} className="text-sm text-ink">
                {d.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pacing */}
      <ChartFrame
        title="Pace against the schedule"
        hint={
          pacing.hasData
            ? `Week ${Math.ceil(pacing.weeksElapsed)} of ${pacing.paceWeeks}${pacing.overrun ? ', the term has overrun' : ''}.`
            : 'Set a class length to track pace.'
        }
      >
        {!pacing.hasData ? (
          <p className="text-sm text-muted">No enrolments or lessons yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4">
              <Figure label="Expected by now" value={`${pacing.expectedByNow}`} sub={`of ${pacing.lessonCount} lessons`} />
              <Figure label="Class average" value={`${pacing.actualMean}`} sub="lessons completed" />
              <Figure
                label="Cohort gap"
                value={pacing.cohortGap > 0 ? `${pacing.cohortGap} behind` : 'On track'}
                sub={pacing.cohortGap > 0 ? 'the whole class, not one learner' : 'against the schedule'}
                tone={pacing.cohortGap >= 2 ? 'bad' : 'good'}
              />
            </div>
            {pacing.behindSchedule.length > 0 && (
              <RankedBars
                data={pacing.behindSchedule.slice(0, 6).map((l) => ({
                  label: l.email,
                  value: l.behind,
                  sub: `${l.done} done, ${l.expected} expected`,
                  color: l.behind >= 4 ? STATUS.bad : STATUS.warn,
                }))}
                valueSuffix=" behind"
              />
            )}
          </div>
        )}
      </ChartFrame>

      {/* Item analysis */}
      <ChartFrame
        title="Question quality"
        hint={
          items.hasData
            ? `${items.responders} ${items.responders === 1 ? 'learner has' : 'learners have'} answered. A low score is not always a weak class, sometimes it is a bad question.`
            : 'Fills in once learners submit an exam.'
        }
      >
        {!items.hasData ? (
          <p className="text-sm text-muted">
            No answers recorded yet. This fills in automatically as learners submit the final exam.
          </p>
        ) : items.flagged.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CheckIcon className="h-4 w-4" />
            Every question with enough responses is behaving normally.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {items.flagged.map((it) => {
              const meta = FLAG_META[it.flag as Exclude<ItemStat['flag'], 'ok'>];
              return (
                <li key={`${it.quizKey}-${it.qIndex}`} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-bold"
                      style={{ color: meta.color }}
                    >
                      {/* Icon plus words: a status is never colour alone. */}
                      <AlertTriangleIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                    <span className="text-xs text-muted">
                      {it.difficulty}% correct · {it.responses} answered
                      {it.discrimination != null && ` · discrimination ${it.discrimination > 0 ? '+' : ''}${it.discrimination}`}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-ink">
                    Q{it.qIndex + 1}. {it.prompt}
                  </p>
                  <p className="mt-1 text-xs text-muted">{it.note}</p>
                  {it.topDistractor && (
                    <p className="mt-1 text-xs text-faint">
                      Most common wrong answer: option {it.topDistractor.index + 1} ({it.topDistractor.count} learners) -
                      that is the misconception to address.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ChartFrame>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p
        className="mt-0.5 text-xl font-black tabular-nums"
        style={{ color: tone === 'bad' ? STATUS.bad : tone === 'good' ? STATUS.good : 'var(--color-ink)' }}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}
