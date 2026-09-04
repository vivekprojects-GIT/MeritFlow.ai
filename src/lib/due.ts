/**
 * Due-date status helpers, shared by the student assignment views, the instructor
 * submissions list, and the cross-class deadlines panel. Pure + framework-agnostic
 * (no JSX, no Tailwind) so it's testable and usable on client or server.
 *
 * `now` is always passed in (callers use Date.now()) so the functions stay pure.
 */

export type DueTone = 'graded' | 'submitted' | 'late' | 'overdue' | 'soon' | 'upcoming' | 'none';

export type DueInfo = { tone: DueTone; label: string };

const DAY = 86_400_000;

/** A short absolute date, e.g. "Mar 5, 2026". */
export function formatDueDate(ms: number | null | undefined): string {
  if (ms == null) return 'No due date';
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'No due date';
  }
}

/**
 * Status of an assignment relative to its due date and the student's submission.
 * Precedence: graded → submitted (late or on-time) → overdue / due-soon / upcoming.
 * The label is always self-describing text, so colour is never the only signal.
 */
export function dueInfo(
  dueAt: number | null | undefined,
  now: number,
  submission?: { submittedAt: number | null; graded: boolean } | null,
): DueInfo {
  const sub = submission ?? null;
  if (sub?.graded) return { tone: 'graded', label: 'Graded' };
  if (sub && sub.submittedAt != null) {
    if (dueAt != null && sub.submittedAt > dueAt) return { tone: 'late', label: 'Submitted late' };
    return { tone: 'submitted', label: 'Submitted' };
  }
  if (dueAt == null) return { tone: 'none', label: 'No due date' };

  // Anchor "today / tomorrow / N days" to local calendar midnight (not a rolling 24h
  // window), so the words match the reader's calendar regardless of time of day.
  const dayDiff = Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY);
  if (dueAt < now) {
    if (dayDiff === 0) return { tone: 'overdue', label: 'Overdue' }; // due earlier today
    const d = -dayDiff;
    return { tone: 'overdue', label: `${d} day${d === 1 ? '' : 's'} overdue` };
  }
  if (dayDiff === 0) return { tone: 'soon', label: 'Due today' };
  if (dayDiff === 1) return { tone: 'soon', label: 'Due tomorrow' };
  return { tone: dayDiff <= 3 ? 'soon' : 'upcoming', label: `Due in ${dayDiff} days` };
}

/** Local-midnight timestamp for the day containing `ms` (uses the runtime's timezone). */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Tailwind text-colour for a tone. The label text carries the meaning; colour reinforces it. */
export const DUE_TONE_CLASS: Record<DueTone, string> = {
  graded: 'text-accent',
  submitted: 'text-accent',
  late: 'text-orange-400',
  overdue: 'text-red-400',
  soon: 'text-orange-400',
  upcoming: 'text-muted',
  none: 'text-faint',
};
