'use client';

import { useEffect, useState } from 'react';
import { Button } from './button';
import { CheckIcon, LockIcon, LockOpenIcon, UserIcon } from './icons';
import type { GateRow } from '@/lib/assessment-gates';

type Roster = { studentId: string; email: string }[];

/**
 * Assessment access controls.
 *
 * Two levers, and the distinction between them is the whole point:
 *
 *  - The **class switch** is the normal case. Open the quiz on Monday, close it
 *    Friday, done.
 *  - A **per-learner exception** is for the cases that actually arrive: an
 *    accommodation, a make-up after illness, a retake for one person. Without
 *    it a professor has to reopen the assessment for thirty people to help one.
 *
 * Exceptions are shown inline under the gate they belong to rather than on a
 * separate settings page, because "who has different access to this quiz" is
 * only ever asked while looking at that quiz.
 */
export function AssessmentGatesPanel({ classId, roster }: { classId: string; roster: Roster }) {
  const [gates, setGates] = useState<GateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/classes/${classId}/gates`)
      .then(async (r) => {
        const d = (await r.json()) as { gates?: GateRow[]; error?: string };
        if (!alive) return;
        if (!r.ok) setError(d.error ?? 'Could not load assessment settings.');
        else setGates(d.gates ?? []);
      })
      .catch(() => {
        if (alive) setError('Could not load assessment settings.');
      });
    return () => {
      alive = false;
    };
  }, [classId, reloadKey]);

  async function post(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/gates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) setError(d.error ?? 'That change did not save.');
      else setReloadKey((k) => k + 1);
    } catch {
      setError('That change did not save.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !gates) return <p className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">{error}</p>;
  if (!gates)
    return (
      <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-canvas p-6 text-sm text-muted">
        Loading assessment settings…
      </p>
    );

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">Assessment access</h4>
        <p className="mt-0.5 text-xs text-muted">
          Open or close each quiz and the final exam for the whole class, or for one learner.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {gates.map((gate) => {
          const available = roster.filter((r) => !gate.exceptions.some((e) => e.studentId === r.studentId));
          return (
            <li key={gate.key} className="rounded-2xl border border-line bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {gate.classOpen ? (
                    <LockOpenIcon className="h-4 w-4 text-success" />
                  ) : (
                    <LockIcon className="h-4 w-4 text-faint" />
                  )}
                  {gate.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">{gate.classOpen ? 'Open to the class' : 'Closed'}</span>
                  <Button
                    size="sm"
                    variant={gate.classOpen ? 'secondary' : 'primary'}
                    loading={busy === gate.key}
                    onClick={() => void post({ gate: gate.key, open: !gate.classOpen }, gate.key)}
                  >
                    {gate.classOpen ? 'Close' : 'Open'}
                  </Button>
                </div>
              </div>

              {gate.exceptions.length > 0 && (
                <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
                  {gate.exceptions.map((ex) => (
                    <li key={ex.studentId} className="flex flex-wrap items-center gap-2 text-xs">
                      <UserIcon className="h-3.5 w-3.5 text-faint" />
                      <span className="text-ink">{ex.email}</span>
                      <span className={ex.open ? 'font-semibold text-success' : 'font-semibold text-warn'}>
                        {ex.open ? 'open for them' : 'closed for them'}
                      </span>
                      {ex.reason && <span className="text-faint">({ex.reason})</span>}
                      <button
                        type="button"
                        onClick={() => void post({ gate: gate.key, studentId: ex.studentId, open: null }, ex.studentId + gate.key)}
                        className="ml-auto text-accent hover:underline"
                      >
                        Remove exception
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {available.length > 0 && (
                <div className="mt-2.5">
                  {addingFor === gate.key ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Learner to override for ${gate.label}`}
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          /* The exception is always the opposite of the class
                             default: that is the only reason to create one. */
                          void post(
                            { gate: gate.key, studentId: e.target.value, open: !gate.classOpen, reason: 'Set by your professor' },
                            e.target.value + gate.key,
                          );
                          setAddingFor(null);
                        }}
                        className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                      >
                        <option value="">Choose a learner…</option>
                        {available.map((r) => (
                          <option key={r.studentId} value={r.studentId}>
                            {r.email}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setAddingFor(null)} className="text-xs text-muted hover:text-ink">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingFor(gate.key)}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      {gate.classOpen ? 'Close for one learner' : 'Open for one learner'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {gates.every((g) => g.classOpen) && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <CheckIcon className="h-3.5 w-3.5" />
          Everything is open to the class.
        </p>
      )}
    </div>
  );
}
