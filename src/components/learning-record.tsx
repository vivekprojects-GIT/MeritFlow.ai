'use client';

import { useEffect, useState } from 'react';

/**
 * What the learner has to show for their study, written to be pasted.
 *
 * ## Why this page exists
 *
 * A student finishes six courses and has nothing that leaves the app. Every
 * line here is a sentence they can put on a CV, in a LinkedIn summary, or in
 * an email — and each carries the basis it rests on, so when an interviewer
 * asks "says who?" the answer is in front of them.
 *
 * ## Why the wording is restrained
 *
 * These lines go on a document someone is judged by. "Expert in Python" from
 * one course is a claim a candidate has to defend in a room and cannot, so
 * nothing here is upgraded on the way out: courses completed, subjects
 * covered, progress toward a stated goal. That restraint is also what makes it
 * credible — a reader discounts self-assessment and does not discount a
 * finished course.
 */

type RecordLine = { text: string; basis: string };
type Payload = {
  record: {
    summary: string;
    bullets: RecordLine[];
    skills: string[];
    courses: { title: string; level: string; completedAt: number }[];
    goals: { title: string; earned: number; total: number; coverage: number }[];
    empty: boolean;
  };
  text: string;
};

export function LearningRecord() {
  const [data, setData] = useState<Payload | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/career/record')
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

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* A browser that refuses the clipboard is not an error worth a banner —
         the text is on screen and can be selected. */
    }
  };

  if (!data) return null;

  if (data.record.empty) {
    return (
      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Learning record</h2>
        <p className="mt-1 text-sm text-muted">
          Lines you can put on a CV, built from courses you finish. Nothing here yet — finish a course and it fills in.
        </p>
        <div className="mt-4 rounded-2xl border border-line bg-canvas p-8 text-center">
          <p className="text-sm text-muted">
            This is built only from completed courses, so everything on it is something you can defend in an interview.
          </p>
        </div>
      </section>
    );
  }

  const { record } = data;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Learning record</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Built from courses you finished, so every line is something you can be asked about and answer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copy(data.text, 'all')}
          className="inline-flex h-9 items-center rounded-full bg-accent-fill px-4 text-sm font-bold text-white transition hover:brightness-110"
        >
          {copied === 'all' ? 'Copied' : 'Copy all'}
        </button>
      </div>

      {record.summary && (
        <div className="rounded-2xl border border-line bg-canvas p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">Summary</p>
            <button
              type="button"
              onClick={() => void copy(record.summary, 'summary')}
              className="text-xs font-semibold text-muted transition hover:text-ink"
            >
              {copied === 'summary' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{record.summary}</p>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-canvas p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">For your CV</p>
        <ul className="mt-2 divide-y divide-line">
          {record.bullets.map((b) => (
            <li key={b.text} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm text-ink">{b.text}</span>
                {/* The evidence, so "says who?" has an answer on the same line. */}
                <span className="mt-0.5 block text-xs text-muted">{b.basis}</span>
              </span>
              <button
                type="button"
                onClick={() => void copy(b.text, b.text)}
                className="shrink-0 text-xs font-semibold text-muted transition hover:text-ink"
              >
                {copied === b.text ? 'Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {record.skills.length > 0 && (
        <div className="rounded-2xl border border-line bg-canvas p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
              Skills covered · {record.skills.length}
            </p>
            <button
              type="button"
              onClick={() => void copy(record.skills.join(' · '), 'skills')}
              className="text-xs font-semibold text-muted transition hover:text-ink"
            >
              {copied === 'skills' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {record.skills.map((s) => (
              <li
                key={s}
                className="rounded-full border border-line bg-mint px-2.5 py-1 text-xs font-semibold capitalize text-accent"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {record.courses.length > 0 && (
        <div className="rounded-2xl border border-line bg-canvas p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
            Completed · {record.courses.length}
          </p>
          <ul className="mt-2 divide-y divide-line">
            {record.courses.map((c) => (
              <li key={c.title} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                <span className="text-sm text-ink">{c.title}</span>
                <span className="text-xs text-muted">{c.level}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
