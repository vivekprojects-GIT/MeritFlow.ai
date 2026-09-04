'use client';

import { useEffect, useState } from 'react';
import type { InstructorAssignment, SubmissionEntry } from '@/lib/assignments-store';
import { formatDueDate } from '@/lib/due';
import { ChevronLeftIcon, PlusIcon, TrashIcon } from './icons';
import { Modal } from './modal';

export function ManageAssignments({
  classId,
  className,
  onClose,
}: {
  classId: string;
  className: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<InstructorAssignment[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // create form
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [rubric, setRubric] = useState('');
  const [points, setPoints] = useState(100);
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    return fetch(`/api/classes/${classId}/assignments`)
      .then((r) => r.json())
      .then((d: { assignments?: InstructorAssignment[] }) => setItems(d.assignments ?? []))
      .catch(() => setItems([]));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function create() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const dueAt = due ? new Date(due).getTime() : null;
      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), instructions, rubric, points, dueAt }),
      });
      if (res.ok) {
        setTitle('');
        setInstructions('');
        setRubric('');
        setPoints(100);
        setDue('');
        setCreating(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setItems((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    await fetch(`/api/assignments/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  const list = items ?? [];

  return (
    <Modal open onClose={onClose} size="md" eyebrow="Assignments" title={className}>
        {openId ? (
          <SubmissionsView assignmentId={openId} onBack={() => { setOpenId(null); load(); }} />
        ) : (
          <>
            {/* Create */}
            {creating ? (
              <div className="mt-5 rounded-2xl border border-line bg-canvas/40 p-4">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Assignment title"
                  className="ring-focus w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={3}
                  placeholder="Instructions for students…"
                  className="thin-scroll ring-focus mt-2 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <textarea
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  rows={2}
                  placeholder="Rubric / grading notes (optional)"
                  className="thin-scroll ring-focus mt-2 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    Points
                    <input
                      type="number"
                      value={points}
                      onChange={(e) => setPoints(Math.max(0, Number(e.target.value)))}
                      className="ring-focus w-20 rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    Due
                    <input
                      type="datetime-local"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                      className="ring-focus rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                    />
                  </label>
                  <button
                    onClick={create}
                    disabled={saving || !title.trim()}
                    className="press ring-focus ml-auto rounded-lg bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50"
                  >
                    {saving ? 'Creating…' : 'Create'}
                  </button>
                  <button onClick={() => setCreating(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="press ring-focus mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas"
              >
                <PlusIcon className="h-4 w-4" />
                New assignment
              </button>
            )}

            {/* List */}
            {items === null ? (
              <p className="mt-5 text-sm text-muted">Loading…</p>
            ) : list.length === 0 ? (
              <p className="mt-5 text-sm text-muted">No assignments yet.</p>
            ) : (
              <div className="mt-5 space-y-2">
                {list.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-canvas/40 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{a.title}</p>
                      <p className="text-xs text-faint">
                        {a.points} pts · {a.dueAt == null ? 'No due date' : `Due ${formatDueDate(a.dueAt)}`} · {a.gradedCount}/{a.submissionCount} graded
                      </p>
                    </div>
                    <button
                      onClick={() => setOpenId(a.id)}
                      className="ring-focus rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent/40"
                    >
                      Submissions ({a.submissionCount})
                    </button>
                    <button
                      onClick={() => remove(a.id)}
                      className="ring-focus rounded-lg p-1.5 text-faint hover:text-accent"
                      aria-label="Delete assignment"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
    </Modal>
  );
}

function fmtSubmitted(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function SubmissionsView({ assignmentId, onBack }: { assignmentId: string; onBack: () => void }) {
  const [data, setData] = useState<{
    assignment: { title: string; points: number; dueAt: number | null };
    submissions: SubmissionEntry[];
  } | null>(null);
  const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/assignments/${assignmentId}/submissions`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setData(d?.submissions ? d : { assignment: { title: 'Assignment', points: 100, dueAt: null }, submissions: [] });
        const init: Record<string, { grade: string; feedback: string }> = {};
        (d?.submissions ?? []).forEach((s: SubmissionEntry) => {
          init[s.studentId] = { grade: s.grade == null ? '' : String(s.grade), feedback: s.feedback ?? '' };
        });
        setGrades(init);
      })
      .catch(() => setData({ assignment: { title: 'Assignment', points: 100, dueAt: null }, submissions: [] }));
    return () => {
      alive = false;
    };
  }, [assignmentId]);

  async function save(studentId: string) {
    const g = grades[studentId];
    if (!g) return;
    setSavingId(studentId);
    try {
      await fetch(`/api/assignments/${assignmentId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, grade: Number(g.grade) || 0, feedback: g.feedback }),
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <button onClick={onBack} className="u-link mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted">
        <ChevronLeftIcon className="h-4 w-4" />
        Back to assignments
      </button>
      <h3 className="text-xl font-semibold text-ink">{data?.assignment.title ?? 'Submissions'}</h3>
      {!data ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : data.submissions.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No submissions yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.submissions.map((s) => {
            const late = data.assignment.dueAt != null && s.submittedAt > data.assignment.dueAt;
            return (
            <div key={s.studentId} className="rounded-2xl border border-line bg-canvas/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{s.email}</p>
                {late && (
                  <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-400">
                    Late
                  </span>
                )}
                <span className="text-[11px] text-faint">Submitted {fmtSubmitted(s.submittedAt)}</span>
              </div>
              {s.text && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{s.text}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="u-link text-accent">
                    Open link
                  </a>
                )}
                {s.fileName && s.fileData && (
                  <a href={s.fileData} download={s.fileName} className="u-link text-accent">
                    {s.fileName}
                  </a>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  Grade
                  <input
                    type="number"
                    value={grades[s.studentId]?.grade ?? ''}
                    onChange={(e) =>
                      setGrades((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], grade: e.target.value } }))
                    }
                    className="ring-focus w-20 rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                  <span className="text-faint">/ {data.assignment.points}</span>
                </label>
                <input
                  value={grades[s.studentId]?.feedback ?? ''}
                  onChange={(e) =>
                    setGrades((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], feedback: e.target.value } }))
                  }
                  placeholder="Feedback"
                  className="ring-focus min-w-[180px] flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <button
                  onClick={() => save(s.studentId)}
                  disabled={savingId === s.studentId}
                  className="press ring-focus rounded-lg bg-accent-fill px-3.5 py-1.5 text-xs font-semibold text-canvas disabled:opacity-50"
                >
                  {savingId === s.studentId ? 'Saving…' : s.grade != null ? 'Update' : 'Save grade'}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </>
  );
}
