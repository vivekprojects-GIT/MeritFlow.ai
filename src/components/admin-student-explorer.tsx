'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChartFrame, Histogram, RankedBars, HealthScatter, STATUS, type HealthPoint } from './charts';
import type { StudentAnalytics, StudentRow } from '@/lib/student-analytics';

type ClassRow = { id: string; title: string; professorEmail: string; enrolled: number; completed: number };

type StatusKey = StudentRow['status'] | 'all';

const STATUS_META: Record<StudentRow['status'], { label: string; color: string; note: string }> = {
  'at-risk': { label: 'At risk', color: STATUS.bad, note: 'Started, then nothing for 10+ days' },
  'never-started': { label: 'Never started', color: STATUS.warn, note: 'Enrolled but no lesson completed' },
  active: { label: 'Active', color: STATUS.good, note: 'Completed a lesson recently' },
  completed: { label: 'Completed', color: STATUS.neutral, note: 'Finished every enrolled class' },
};

/**
 * The learner-level view an administrator was missing.
 *
 * The dashboard above this one answers "is the platform being used". This one
 * answers "who needs a phone call", which is the question that changes an
 * outcome. It is therefore built as a worklist — filterable, sortable, and
 * ordered so the people in trouble surface first — rather than as a report.
 */
export function AdminStudentExplorer({ classes }: { classes: ClassRow[] }) {
  const [data, setData] = useState<StudentAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [sort, setSort] = useState<'status' | 'progress' | 'quiet' | 'email'>('status');
  const [drilldown, setDrilldown] = useState<StudentRow | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/students')
      .then(async (r) => {
        const d = (await r.json()) as StudentAnalytics & { error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load learners.');
        else setData(d);
      })
      .catch(() => {
        if (alive) setError('Could not load learners.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = data.students.filter(
      (s) => (status === 'all' || s.status === status) && (!q || s.email.toLowerCase().includes(q)),
    );
    const sorted = [...rows];
    if (sort === 'progress') sorted.sort((a, b) => a.progressPct - b.progressPct);
    else if (sort === 'quiet') sorted.sort((a, b) => (b.daysQuiet ?? -1) - (a.daysQuiet ?? -1));
    else if (sort === 'email') sorted.sort((a, b) => a.email.localeCompare(b.email));
    return sorted;
  }, [data, query, status, sort]);

  /* Class health: enrolment against completion rate. Two measures, one plot,
     no second y-axis. */
  const health: HealthPoint[] = useMemo(
    () =>
      classes
        .filter((c) => c.enrolled > 0)
        .map((c) => ({
          id: c.id,
          label: c.title,
          x: c.enrolled,
          y: Math.round((c.completed / c.enrolled) * 100),
          size: c.enrolled,
          sub: c.professorEmail,
        })),
    [classes],
  );

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        <p className="font-semibold text-ink">Learners unavailable</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading learners…
      </div>
    );
  }

  const { counts } = data;
  const needsAttention = counts.atRisk + counts.neverStarted;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">Learners</h3>
          <p className="mt-0.5 text-sm text-muted">
            {counts.total === 0
              ? 'No enrolments yet across your university.'
              : `${counts.total} enrolled · ${needsAttention} need attention`}
          </p>
        </div>
      </header>

      {/* Status chips double as the filter. One row, above the charts. */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={status === 'all'} onClick={() => setStatus('all')} label="Everyone" count={counts.total} />
        {(Object.keys(STATUS_META) as StudentRow['status'][]).map((k) => {
          const n = k === 'at-risk' ? counts.atRisk : k === 'never-started' ? counts.neverStarted : k === 'active' ? counts.active : counts.completed;
          return (
            <FilterChip
              key={k}
              active={status === k}
              onClick={() => setStatus(status === k ? 'all' : k)}
              label={STATUS_META[k].label}
              count={n}
              color={STATUS_META[k].color}
              title={STATUS_META[k].note}
            />
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Where the cohort actually sits"
          hint="Progress distribution. An average would hide a split cohort, this does not."
        >
          <Histogram values={data.progressValues} emptyMessage="No progress recorded yet." />
        </ChartFrame>

        <ChartFrame
          title="Class health"
          hint="Completion rate against enrolment. Bubble size is class size; dashed lines mark the cohort midpoint."
          legend={[
            { label: '60%+ completing', color: STATUS.good },
            { label: '25–59%', color: STATUS.warn },
            { label: 'Under 25%', color: STATUS.bad },
          ]}
        >
          <HealthScatter data={health} xLabel="Enrolled" yLabel="Completion" emptyMessage="No classes with enrolments yet." />
        </ChartFrame>
      </div>

      {counts.total > 0 && (
        <ChartFrame title="Quietest learners" hint="Days since their last completed lesson. The top of this list is the call list.">
          <RankedBars
            data={data.students
              .filter((s) => s.daysQuiet != null && s.daysQuiet > 0)
              .slice(0, 8)
              .map((s) => ({
                label: s.email,
                value: s.daysQuiet ?? 0,
                sub: `${s.progressPct}% through ${s.classes} ${s.classes === 1 ? 'class' : 'classes'}`,
                color: (s.daysQuiet ?? 0) >= 10 ? STATUS.bad : STATUS.warn,
              }))}
            valueSuffix="d"
            emptyMessage="Everyone has been active recently."
          />
        </ChartFrame>
      )}

      {/* The table is the accessible equivalent of every chart above, the same
          numbers, readable by a screen reader and copyable. */}
      <div className="rounded-2xl border border-line bg-canvas">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email…"
            aria-label="Search learners by email"
            className="min-w-[12rem] flex-1 rounded-full border border-line bg-canvas px-3.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-full border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent"
            >
              <option value="status">Needs attention</option>
              <option value="quiet">Days quiet</option>
              <option value="progress">Progress</option>
              <option value="email">Email</option>
            </select>
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No learners match that filter.</p>
        ) : (
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-elevated text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Learner</th>
                  <th className="px-4 py-2.5 font-semibold">Progress</th>
                  <th className="px-4 py-2.5 font-semibold">Classes</th>
                  <th className="px-4 py-2.5 font-semibold">Exam</th>
                  <th className="px-4 py-2.5 font-semibold">Last active</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((s) => {
                  const meta = STATUS_META[s.status];
                  return (
                    <tr key={s.id} className="hover:bg-elevated/50">
                      <td className="max-w-[200px] truncate px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setDrilldown(s)}
                          className="truncate text-left text-ink underline decoration-line underline-offset-2 hover:decoration-accent"
                        >
                          {s.email}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-elevated">
                            <div className="h-full rounded-full" style={{ width: `${s.progressPct}%`, background: meta.color }} />
                          </div>
                          <span className="text-xs text-muted">{s.progressPct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {s.completions}/{s.classes}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{s.examPct == null ? '--' : `${s.examPct}%`}</td>
                      <td className="px-4 py-2.5 text-muted">
                        {s.daysQuiet == null ? 'Never' : s.daysQuiet === 0 ? 'Today' : `${s.daysQuiet}d ago`}
                      </td>
                      <td className="px-4 py-2.5">
                        {/* Status carries a dot and a word, never colour alone. */}
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: meta.color }}>
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drilldown && <LearnerDrilldown student={drilldown} onClose={() => setDrilldown(null)} />}
    </section>
  );
}

/**
 * One learner, plus the thing you would do about them.
 *
 * A dashboard that surfaces a stalled student and then offers no way to reach
 * them has only moved the work elsewhere. The message box is the point of this
 * panel; the numbers are context for what to write.
 */
function LearnerDrilldown({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const [body, setBody] = useState(suggestedMessage(student));
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const meta = STATUS_META[student.status];

  async function send() {
    if (!body.trim()) return;
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: student.id, body }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'That message did not send.');
        setState('idle');
        return;
      }
      setState('sent');
    } catch {
      setError('That message did not send.');
      setState('idle');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label={`Learner ${student.email}`}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-line bg-canvas p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-ink">{student.email}</h4>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: meta.color }}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
              {meta.label} · {meta.note}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Progress" value={`${student.progressPct}%`} />
          <Fact label="Lessons" value={`${student.lessonsDone}/${student.lessonsTotal}`} />
          <Fact label="Classes done" value={`${student.completions}/${student.classes}`} />
          <Fact label="Exam" value={student.examPct == null ? '--' : `${student.examPct}%`} />
        </dl>

        <div className="mt-4">
          <label htmlFor="drill-msg" className="text-xs font-bold uppercase tracking-[0.14em] text-faint">
            Send them a message
          </label>
          <textarea
            id="drill-msg"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="mt-1.5 w-full rounded-xl border border-line bg-canvas p-3 text-sm text-ink outline-none focus:border-accent"
          />
          {/* Drafted, never auto-sent: the wording is the part that matters and
              it should be the human's. */}
          <p className="mt-1 text-[11px] text-faint">A draft, edit it before sending.</p>

          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-danger">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={state !== 'idle' || !body.trim()}
              className="rounded-full bg-accent-fill px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent' : 'Send message'}
            </button>
            {state === 'sent' && <span className="text-xs text-success">Delivered to their inbox.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-0.5 text-lg font-black tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** A starting point matched to why they are on the list. */
function suggestedMessage(s: StudentRow): string {
  if (s.status === 'never-started') {
    return `Hi. I noticed you are enrolled but haven't opened a lesson yet. Is anything blocking you from getting started? Happy to help.`;
  }
  if (s.status === 'at-risk') {
    return `Hi, it has been ${s.daysQuiet} days since your last lesson and I wanted to check in. One lesson is usually enough to get the habit back. Anything I can help with?`;
  }
  return `Hi, just checking in on how the course is going for you.`;
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  color,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:bg-elevated'
      }`}
    >
      {color && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {label}
      <span className="text-faint">{count}</span>
    </button>
  );
}
