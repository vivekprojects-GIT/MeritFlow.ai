'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The goals a learner is working toward, and the courses that close them.
 *
 * ## Two levels, deliberately
 *
 * The list answers "what am I working on and how far am I", which is the
 * question between study sessions. Opening one answers "what do I do next",
 * which is the question at the start of one. Putting every skill of every goal
 * on one screen would answer neither.
 *
 * ## Why a started card looks different from a missing one
 *
 * A learner three lessons into a surveying course is not missing surveying.
 * Showing it as a gap hides the work and invites them to generate it twice, so
 * started cards carry their own progress and open the course rather than
 * offering to build it.
 */

type SkillCard = {
  skill: string;
  state: 'earned' | 'started' | 'not-started';
  essential: boolean;
  fromCourses: string[];
  course: { id: string; title: string; lessonsDone: number; lessonsTotal: number } | null;
};

type GoalSummary = {
  goalId: string;
  goalText: string;
  unresolved?: true;
  role?: { id: string; title: string; summary: string };
  cards?: SkillCard[];
  earned?: number;
  total?: number;
  coverage?: number;
  inProgress?: number;
};

/*
 * The library's plate colours, reused so a skill card belongs to the same
 * family as a course card. Keyed on the skill name rather than on position, so
 * a card keeps its colour when the goal's list is filtered or reordered — a
 * card that changes colour reads as a different skill.
 */
const SKILL_HUES = ['#125c4d', '#9c6b1f', '#8a2b2b', '#2a6f62', '#5b3a6b', '#3a4a52', '#7c3aed'];

function skillHue(skill: string): string {
  let n = 0;
  for (const ch of skill.trim().toLowerCase()) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return SKILL_HUES[n % SKILL_HUES.length];
}

const EXAMPLES = [
  'I want to become an AI engineer',
  'I want to design bridges and roads',
  'I want to design buildings',
  'I want to work with data and statistics',
];

export function CareerGoals({ onOpenCourse }: { onOpenCourse?: (courseId: string) => void }) {
  const [goals, setGoals] = useState<GoalSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [choices, setChoices] = useState<{ roleId: string; title: string; summary: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  /* Fetched in the effect and applied in its callback, rather than awaited in
     the effect body: setting state synchronously there cascades renders, and
     the linter is right to refuse it. */
  useEffect(() => {
    let alive = true;
    fetch('/api/career/goals')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { goals?: GoalSummary[] } | null) => {
        if (alive) setGoals(d?.goals ?? []);
      })
      .catch(() => {
        if (alive) setGoals([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const addGoal = useCallback(
    async (text: string, roleId?: string) => {
      setBusy('add');
      setNote('');
      const res = await fetch('/api/career/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, roleId }),
      }).catch(() => null);
      setBusy(null);
      if (!res) return setNote('Could not reach the server.');

      const d = (await res.json().catch(() => ({}))) as {
        goals?: GoalSummary[];
        needsChoice?: boolean;
        options?: { roleId: string; title: string; summary: string }[];
        error?: string;
      };
      if (d.error) return setNote(d.error);
      if (d.needsChoice) return setChoices(d.options ?? []);

      setGoals(d.goals ?? []);
      setAdding(false);
      setDraft('');
      setChoices(null);
    },
    [],
  );

  const removeGoal = useCallback(async (goalId: string) => {
    setBusy(goalId);
    const res = await fetch('/api/career/goals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId }),
    }).catch(() => null);
    setBusy(null);
    if (!res) return;
    const d = (await res.json().catch(() => ({}))) as { goals?: GoalSummary[] };
    setGoals(d.goals ?? []);
    setOpen(null);
  }, []);

  const buildCourse = useCallback(
    async (goalId: string, skill: string) => {
      setBusy(`${goalId}:${skill}`);
      setNote('');
      const res = await fetch(`/api/career/goals/${goalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill }),
      }).catch(() => null);
      setBusy(null);
      if (!res) return setNote('Could not reach the server.');

      const d = (await res.json().catch(() => ({}))) as { courseId?: string; goal?: GoalSummary; error?: string };
      if (d.error) return setNote(d.error);

      if (d.goal) setGoals((prev) => (prev ?? []).map((g) => (g.goalId === d.goal!.goalId ? d.goal! : g)));
      if (d.courseId) onOpenCourse?.(d.courseId);
    },
    [onOpenCourse],
  );

  if (goals === null) return null;

  const active = goals.find((g) => g.goalId === open) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Your goals</h2>
          <p className="mt-1 text-sm text-muted">
            What you are working toward, and exactly how far you are. Progress comes from courses you finish.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center rounded-full bg-accent-fill px-4 text-sm font-bold text-white transition hover:brightness-110"
          >
            Add a goal
          </button>
        )}
      </div>

      {/* ── Adding ───────────────────────────────────────────────────────── */}
      {adding && (
        <div className="rounded-2xl border border-line bg-canvas p-5">
          <h3 className="text-base font-bold text-ink">What do you want to become?</h3>
          <p className="mt-1 text-sm text-muted">A job title, or just the work you want to do.</p>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={EXAMPLES[0]}
            className="mt-3 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDraft(ex)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>

          {choices && choices.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-elevated/40 p-3">
              <p className="text-sm font-semibold text-ink">Which one did you mean?</p>
              <p className="mt-0.5 text-xs text-muted">These are different jobs, so we would rather ask than guess.</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {choices.map((c) => (
                  <button
                    key={c.roleId}
                    type="button"
                    onClick={() => void addGoal(draft, c.roleId)}
                    className="rounded-lg border border-line bg-canvas px-3 py-2 text-left transition hover:border-accent"
                  >
                    <span className="block text-sm font-semibold text-ink">{c.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{c.summary}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void addGoal(draft)}
              disabled={busy === 'add' || draft.trim().length < 3}
              className="inline-flex h-9 items-center rounded-full bg-accent-fill px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {busy === 'add' ? 'Adding…' : 'Add goal'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setChoices(null);
                setNote('');
              }}
              className="text-sm text-muted hover:text-ink"
            >
              Cancel
            </button>
            {note && <span className="text-sm text-danger">{note}</span>}
          </div>
        </div>
      )}

      {/* ── The list ─────────────────────────────────────────────────────── */}
      {goals.length === 0 && !adding && (
        <div className="rounded-2xl border border-line bg-canvas p-8 text-center">
          <p className="text-sm text-muted">
            No goals yet. Add one and we will show you exactly which skills stand between you and it.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {goals.map((g) => (
          <button
            key={g.goalId}
            type="button"
            onClick={() => setOpen(open === g.goalId ? null : g.goalId)}
            className={`rounded-2xl border p-4 text-left transition ${
              open === g.goalId ? 'border-accent bg-mint/30' : 'border-line bg-canvas hover:border-line-strong'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-bold text-ink">{g.role?.title ?? g.goalText}</span>
              {!g.unresolved && <span className="text-sm tabular-nums text-muted">{g.coverage}%</span>}
            </div>

            {g.unresolved ? (
              <p className="mt-1 text-xs text-muted">
                We could not match this to a career we track. It is saved as you wrote it.
              </p>
            ) : (
              <>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{g.role?.summary}</p>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div className="h-full rounded-full bg-accent-fill transition-all" style={{ width: `${g.coverage}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {g.earned} of {g.total} essentials
                  {(g.inProgress ?? 0) > 0 && ` · ${g.inProgress} under way`}
                </p>
              </>
            )}
          </button>
        ))}
      </div>

      {/* ── One goal, opened ─────────────────────────────────────────────── */}
      {active && !active.unresolved && active.cards && (
        <div className="rounded-2xl border border-line bg-canvas p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-ink">{active.role?.title}</h3>
              <p className="mt-0.5 text-sm text-muted">
                {active.earned} of {active.total} essentials covered
                {(active.inProgress ?? 0) > 0 && ` · ${active.inProgress} under way`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void removeGoal(active.goalId)}
              disabled={busy === active.goalId}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-danger hover:text-danger"
            >
              Remove goal
            </button>
          </div>

          {note && <p className="mt-3 text-sm text-danger">{note}</p>}

          {/*
            * Three groups, not one list.
            *
            * A learner who finished a surveying course before ever setting the
            * goal was being shown "surveying" in the same grid as five skills
            * they have never touched — the work they already did read as
            * another chore. What they have is now stated first, and what is
            * left is a shorter list because of it.
            */}
          {(['earned', 'started', 'not-started'] as const).map((state) => {
            const group = active.cards!.filter((c) => c.state === state);
            if (group.length === 0) return null;

            const heading = {
              earned: 'Already covered',
              started: 'Under way',
              'not-started': 'Still to learn',
            }[state];
            const caption = {
              earned: 'Courses you finished that count toward this goal.',
              started: 'Courses you opened for this goal but have not finished.',
              'not-started': 'Nothing covers these yet. Build a course for any of them.',
            }[state];

            return (
              <div key={state} className="mt-5">
                <div className="flex items-baseline gap-2">
                  <h4 className="text-sm font-bold text-ink">{heading}</h4>
                  <span className="text-xs tabular-nums text-faint">{group.length}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{caption}</p>

                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((card) => {
                    const key = `${active.goalId}:${card.skill}`;
                    const working = busy === key;

                    const hue = skillHue(card.skill);

                    return (
                      <div
                        key={card.skill}
                        className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all hover:border-accent/30 hover:shadow-soft"
                      >
                        {/* The course card's plate, at card-in-a-card scale.
                            An earned skill is a course the learner finished, so
                            it should look like one. */}
                        <div
                          className="relative flex h-14 items-end overflow-hidden px-3 pb-2"
                          style={{
                            background: `linear-gradient(130deg, ${hue}, color-mix(in srgb, ${hue} 72%, #ffffff))`,
                          }}
                        >
                          <span
                            aria-hidden
                            className="absolute -right-1 -top-4 select-none font-serif text-[64px] font-medium leading-none text-white/15"
                          >
                            {card.skill.trim().charAt(0).toUpperCase()}
                          </span>
                          <span className="relative rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                            {card.essential ? 'Essential' : 'Supporting'}
                          </span>
                          {card.state === 'earned' && (
                            <span className="relative ml-auto inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-accent">
                              Covered
                            </span>
                          )}
                          {card.state === 'started' && card.course && (
                            <span className="relative ml-auto rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold tabular-nums text-accent">
                              {card.course.lessonsDone}/{card.course.lessonsTotal}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-1 flex-col p-3.5">
                          <h5 className="font-serif text-base font-medium capitalize leading-snug text-ink">
                            {card.skill}
                          </h5>

                          {card.state === 'earned' && (
                            <p className="mt-1 text-xs text-muted">
                              {card.fromCourses.length > 0 ? `From ${card.fromCourses.join(', ')}` : 'Completed'}
                            </p>
                          )}

                          {card.state === 'started' && card.course && (
                            <>
                              <p className="mt-1 text-xs text-muted">
                                {card.course.lessonsDone} of {card.course.lessonsTotal} lessons
                              </p>
                              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-elevated">
                                <div
                                  className="h-full rounded-full bg-accent-fill"
                                  style={{
                                    width: `${card.course.lessonsTotal ? Math.round((card.course.lessonsDone / card.course.lessonsTotal) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => onOpenCourse?.(card.course!.id)}
                                className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-semibold text-accent"
                              >
                                Continue
                                <span aria-hidden>→</span>
                              </button>
                            </>
                          )}

                          {card.state === 'not-started' && (
                            <button
                              type="button"
                              onClick={() => void buildCourse(active.goalId, card.skill)}
                              disabled={working}
                              className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-semibold text-accent disabled:opacity-40"
                            >
                              {working ? 'Building…' : 'Build this course'}
                              <span aria-hidden>→</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
