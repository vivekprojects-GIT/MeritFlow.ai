'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * What the learner's finished courses are adding up to.
 *
 * ## Why the goal box comes first for a new learner
 *
 * A student who has finished nothing has nothing to be told, and an empty
 * "you could become" panel is worse than no panel — it implies the answer is
 * none. So a learner without a goal is asked for one, with real examples in
 * the box, because "what do you want to become?" is a hard question to answer
 * into an empty field.
 *
 * ## Why coverage, never a verdict
 *
 * Three courses do not make a structural engineer. Every row here is a
 * proportion with the missing pieces named, so the learner sees how far it is
 * as well as which way. A page that told students they were ready would cost
 * them interviews.
 */

type Skill = { skill: string; fromCourses: string[] };
type RoleRow = {
  roleId: string;
  title: string;
  discipline?: string;
  summary: string;
  coverage: number;
  held: string[];
  missing: string[];
};
type Payload = {
  goalText: string;
  completedCourses: number;
  skills: Skill[];
  /** Every goal, newest first. */
  goals: RoleRow[];
  /** The newest one, for the places that show a single heading. */
  goal: RoleRow | null;
  couldBecome: RoleRow[];
  learnNext: { skill: string; why: string }[];
  needsChoice?: boolean;
  options?: { roleId: string; title: string; summary: string }[];
  message?: string;
  error?: string;
};

/* Real sentences, because an empty box with "what do you want to become?"
   above it is a harder question than it looks. */
const EXAMPLES = [
  'I want to become an AI engineer',
  'I want to design bridges and roads',
  'I want to design buildings',
  'I want to work with data and statistics',
  'I want to build websites people use',
];

export function CareerPath() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState('');
  const [choices, setChoices] = useState<Payload['options']>(undefined);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/career/path')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(
    async (text: string, roleId?: string) => {
      setBusy(true);
      setNote('');
      const res = await fetch('/api/career/path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, roleId }),
      }).catch(() => null);
      setBusy(false);
      if (!res) return setNote('Could not reach the server.');

      const d = (await res.json().catch(() => ({}))) as Payload;
      if (d.error) return setNote(d.error);

      if (d.needsChoice) {
        /* Several careers fit the words. Ask rather than pick: civil and
           structural engineering are different jobs. */
        setChoices(d.options ?? []);
        setNote(d.message ?? '');
        return;
      }

      setData(d);
      setChoices(undefined);
      setEditing(false);
      setDraft('');
    },
    [],
  );

  if (!data) return null;

  const goals = data.goals ?? (data.goal ? [data.goal] : []);
  const hasGoal = goals.length > 0 || Boolean(data.goalText);
  const askingGoal = editing || !hasGoal;

  return (
    <section className="space-y-4">
      {/* ── The goal ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-canvas p-5">
        {askingGoal ? (
          <>
            <h2 className="text-lg font-bold text-ink">What do you want to become?</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Write it however you think about it — a job title, or just the work you want to do. We will tell you what
              you already have and what is left.
            </p>

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

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save(draft)}
                disabled={busy || draft.trim().length < 3}
                className="inline-flex h-9 items-center rounded-full bg-accent-fill px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Set my goal'}
              </button>
              {hasGoal && (
                <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted hover:text-ink">
                  Cancel
                </button>
              )}
            </div>

            {choices !== undefined && choices.length > 0 && (
              <div className="mt-4 rounded-xl border border-line bg-elevated/40 p-3">
                <p className="text-sm font-semibold text-ink">Which one did you mean?</p>
                <p className="mt-0.5 text-xs text-muted">These are different jobs, so we would rather ask than guess.</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {choices.map((c) => (
                    <button
                      key={c.roleId}
                      type="button"
                      onClick={() => void save(draft, c.roleId)}
                      className="rounded-lg border border-line bg-canvas px-3 py-2 text-left transition hover:border-accent"
                    >
                      <span className="block text-sm font-semibold text-ink">{c.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">{c.summary}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {note && <p className="mt-2 text-sm text-muted">{note}</p>}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
                  {goals.length > 1 ? `Your goals · ${goals.length}` : 'Your goal'}
                </p>
                {goals.length === 0 && <h2 className="mt-0.5 text-lg font-bold text-ink">{data.goalText}</h2>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setDraft(data.goalText);
                }}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-elevated"
              >
                {goals.length > 0 ? 'Add another' : 'Change'}
              </button>
            </div>

            {/*
              * Every goal, not just the newest.
              *
              * Showing one while the goals page showed three meant the two
              * screens disagreed about what the learner was working on, and a
              * learner who had just added a second goal saw no sign of it here
              * at all. They are separated by a rule rather than boxed, because
              * they are one answer to "where am I" rather than a set of cards
              * to choose between.
              */}
            <div className="mt-4 divide-y divide-line">
              {goals.map((goal) => (
                <div key={goal.roleId} className="py-3 first:pt-0 last:pb-0">
                  <h2 className="text-base font-bold text-ink">{goal.title}</h2>
                  <p className="mt-0.5 text-sm text-muted">{goal.summary}</p>

                  <div className="mt-2.5 flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-ink">
                      {goal.held.length} of {goal.held.length + goal.missing.length} essentials
                    </span>
                    <span className="tabular-nums text-muted">{goal.coverage}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-accent-fill transition-all"
                      style={{ width: `${goal.coverage}%` }}
                    />
                  </div>

                  {goal.missing.length > 0 ? (
                    <p className="mt-2.5 text-sm text-muted">
                      Still to learn: <span className="font-semibold text-ink">{goal.missing.join(', ')}</span>
                    </p>
                  ) : (
                    <p className="mt-2.5 text-sm text-accent">
                      You have every essential for this role. Supporting skills are what deepen it from here.
                    </p>
                  )}
                </div>
              ))}
            </div>

          </>
        )}
      </div>

      {/* ── What the finished work already points to ──────────────────────── */}
      {data.completedCourses === 0 ? (
        <div className="rounded-2xl border border-line bg-canvas p-5">
          <h3 className="text-base font-bold text-ink">Finish a course to see where it leads</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your skill file is built from courses you complete, not ones you start — so it always reflects what you have
            actually done. Nothing here yet.
          </p>
        </div>
      ) : (
        <>
          {data.couldBecome.length > 0 && (
            <div className="rounded-2xl border border-line bg-canvas p-5">
              <h3 className="text-base font-bold text-ink">What you could become</h3>
              <p className="mt-1 text-sm text-muted">
                From {data.completedCourses} finished course{data.completedCourses === 1 ? '' : 's'}. The percentage is
                how much of each role&apos;s essentials you already hold.
              </p>

              <ul className="mt-3 divide-y divide-line">
                {data.couldBecome.map((r) => (
                  <li key={r.roleId} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-semibold text-ink">{r.title}</span>
                      <span className="text-sm tabular-nums text-muted">{r.coverage}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                      <div className="h-full rounded-full bg-accent-fill" style={{ width: `${r.coverage}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted">{r.summary}</p>
                    {r.missing.length > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        Missing: <span className="text-ink">{r.missing.join(', ')}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.learnNext.length > 0 && (
            <div className="rounded-2xl border border-line bg-canvas p-5">
              <h3 className="text-base font-bold text-ink">Learn next</h3>
              <p className="mt-1 text-sm text-muted">In the order that moves you furthest.</p>
              <ul className="mt-3 flex flex-col gap-2">
                {data.learnNext.map((n) => (
                  <li key={n.skill} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-line px-3 py-2">
                    <span className="text-sm font-semibold capitalize text-ink">{n.skill}</span>
                    <span className="text-xs text-muted">{n.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.skills.length > 0 && (
            <div className="rounded-2xl border border-line bg-canvas p-5">
              <h3 className="text-base font-bold text-ink">Your skill file</h3>
              <p className="mt-1 text-sm text-muted">
                {data.skills.length} skill{data.skills.length === 1 ? '' : 's'}, each with the course that evidences it.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {data.skills.map((s) => (
                  <li
                    key={s.skill}
                    title={`From: ${s.fromCourses.join(', ')}`}
                    className="rounded-full border border-line bg-mint px-2.5 py-1 text-xs font-semibold capitalize text-accent"
                  >
                    {s.skill}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
