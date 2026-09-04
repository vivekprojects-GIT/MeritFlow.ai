'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import type { StudentAssignment } from '@/lib/assignments-store';
import { dueInfo, formatDueDate, DUE_TONE_CLASS } from '@/lib/due';
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, ClockIcon, PencilIcon } from './icons';

const FILE_MAX = 2.5 * 1024 * 1024;

/** "Due Mar 5, 2026" / "No due date". */
function dueLabel(ms: number | null): string {
  return ms == null ? 'No due date' : `Due ${formatDueDate(ms)}`;
}
function subState(a: StudentAssignment): { submittedAt: number | null; graded: boolean } | null {
  return a.submission ? { submittedAt: a.submission.submittedAt, graded: a.submission.grade != null } : null;
}
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function StatusBadge({ a, now }: { a: StudentAssignment; now: number }) {
  if (a.submission?.grade != null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-bold text-accent">
        <CheckIcon className="h-3 w-3" />
        {a.submission.grade}/{a.points}
      </span>
    );
  }
  const info = dueInfo(a.dueAt, now, subState(a));
  if (a.submission) {
    const late = info.tone === 'late';
    return (
      <span
        className={[
          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
          late ? 'bg-orange-400/15 text-orange-400' : 'bg-mint text-accent',
        ].join(' ')}
      >
        {late ? 'Submitted late' : 'Submitted'}
      </span>
    );
  }
  if (info.tone === 'overdue') {
    return <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-400">{info.label}</span>;
  }
  if (info.tone === 'soon') {
    return <span className="rounded-full bg-orange-400/15 px-2.5 py-1 text-[11px] font-semibold text-orange-400">{info.label}</span>;
  }
  return <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-faint">Not started</span>;
}

export function ClassAssignments({
  classId,
  initialAssignmentId,
}: {
  classId: string;
  initialAssignmentId?: string;
}) {
  const [items, setItems] = useState<StudentAssignment[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialAssignmentId ?? null);
  const [loading, setLoading] = useState(true);

  function load() {
    return fetch(`/api/classes/${classId}/assignments`)
      .then((r) => r.json())
      .then((d: { assignments?: StudentAssignment[] }) => setItems(d.assignments ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const list = items ?? [];
  const [now] = useState(() => Date.now());
  const open = openId ? list.find((a) => a.id === openId) : null;

  if (open) {
    return (
      <AssignmentDetail
        key={open.id}
        a={open}
        onBack={() => setOpenId(null)}
        onSubmitted={() => load()}
      />
    );
  }

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl">
      <span className="eyebrow">Coursework</span>
      <h1 className="display mt-3 text-[2.2rem] text-ink">Assignments</h1>
      {loading ? (
        <p className="mt-5 text-sm text-muted">Loading assignments…</p>
      ) : list.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No assignments yet, your professor hasn’t posted any.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {list.map((a) => (
            <button
              key={a.id}
              onClick={() => setOpenId(a.id)}
              className="card-edit ring-focus group block w-full rounded-2xl p-5 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-serif text-lg font-medium leading-snug text-ink">{a.title}</h3>
                <StatusBadge a={a} now={now} />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {dueLabel(a.dueAt)}
                </span>
                <span>{a.points} pts</span>
              </p>
              {a.submission?.feedback && (
                <p className="mt-2 line-clamp-1 text-xs text-muted">Feedback: {a.submission.feedback}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentDetail({
  a,
  onBack,
  onSubmitted,
}: {
  a: StudentAssignment;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const graded = a.submission?.grade != null;
  const [now] = useState(() => Date.now());
  const info = dueInfo(a.dueAt, now, subState(a));
  const [text, setText] = useState(a.submission?.text ?? '');
  const [link, setLink] = useState(a.submission?.link ?? '');
  const [fileName, setFileName] = useState<string | null>(a.submission?.fileName ?? null);
  const [fileData, setFileData] = useState<string | null>(a.submission?.fileData ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > FILE_MAX) {
      setError('File is too large (max 2.5 MB).');
      return;
    }
    setError(null);
    setFileName(f.name);
    setFileData(await readDataUrl(f));
  }

  async function submit() {
    if (saving) return;
    if (!text.trim() && !link.trim() && !fileData) {
      setError('Add a written response, a link, or a file.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${a.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, link, fileName, fileData }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not submit.');
      setDone(true);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl">
      <button onClick={onBack} className="u-link mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted">
        <ChevronLeftIcon className="h-4 w-4" />
        All assignments
      </button>

      <span className="eyebrow">Assignment · {a.points} pts · {dueLabel(a.dueAt)}</span>
      <h1 className="display mt-3 text-[2rem] text-ink">{a.title}</h1>
      {info.tone !== 'none' && (
        <p className={['mt-2 text-sm font-semibold', DUE_TONE_CLASS[info.tone]].join(' ')}>{info.label}</p>
      )}

      {a.instructions && (
        <div className="mt-5 whitespace-pre-wrap font-serif text-[16px] leading-relaxed text-ink/85">{a.instructions}</div>
      )}
      {a.rubric && (
        <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
          <p className="eyebrow">Rubric</p>
          <p className="mt-2 whitespace-pre-wrap text-[15px] text-ink/80">{a.rubric}</p>
        </div>
      )}

      {/* Graded result */}
      {graded && (
        <div className="mt-6 rounded-2xl border border-accent/25 bg-accent/[0.07] p-6">
          <p className="eyebrow">Your grade</p>
          <p className="mt-2 text-3xl font-bold text-accent">
            {a.submission!.grade}
            <span className="text-lg text-muted"> / {a.points}</span>
          </p>
          {a.submission!.feedback && (
            <>
              <p className="eyebrow mt-4">Feedback</p>
              <p className="mt-2 whitespace-pre-wrap text-[15px] text-ink/85">{a.submission!.feedback}</p>
            </>
          )}
        </div>
      )}

      {/* Submission form (locked once graded) */}
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <PencilIcon className="h-4 w-4 text-accent" />
          {graded ? 'Your submission' : a.submission ? 'Edit your submission' : 'Submit your work'}
        </h2>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={graded}
          rows={5}
          placeholder="Write your response…"
          className="thin-scroll ring-focus mt-3 w-full resize-y rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-70"
        />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={graded}
          placeholder="Optional link (Google Doc, GitHub, …)"
          className="ring-focus mt-2 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-70"
        />
        <div className="mt-2 flex items-center gap-3">
          {!graded && (
            <label className="press ring-focus cursor-pointer rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink hover:border-accent/40">
              {fileName ? 'Change file' : 'Attach file'}
              <input type="file" onChange={onFile} className="hidden" />
            </label>
          )}
          {fileName &&
            (fileData && fileData.startsWith('data:') ? (
              <a href={fileData} download={fileName} className="u-link truncate text-sm text-accent">
                {fileName}
              </a>
            ) : (
              <span className="truncate text-sm text-muted">{fileName}</span>
            ))}
        </div>

        {error && <p className="mt-3 text-sm text-accent">{error}</p>}

        {!graded && (
          <button
            onClick={submit}
            disabled={saving}
            className="press ring-focus mt-4 inline-flex items-center gap-2 rounded-full bg-accent-fill px-5 py-2.5 text-sm font-semibold text-canvas disabled:opacity-60"
          >
            {saving ? 'Submitting…' : done || a.submission ? 'Update submission' : 'Submit assignment'}
            {!saving && <ArrowRightIcon className="h-4 w-4" />}
          </button>
        )}
        {(done || a.submission) && !graded && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent">
            <CheckIcon className="h-4 w-4" /> Submitted, you can update it until it’s graded.
          </p>
        )}
      </div>
    </div>
  );
}
