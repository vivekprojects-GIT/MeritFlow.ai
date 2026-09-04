'use client';

import { useEffect, useState } from 'react';
import type { Gradebook, GradebookCell } from '@/lib/gradebook-store';
import { CheckIcon, DownloadIcon } from './icons';
import { Modal } from './modal';

/**
 * A grade band, so pass/mid/fail is conveyed by an icon + label + distinct hue —
 * never colour alone (WCAG 1.4.1). Mid uses orange so it doesn't read as the blue
 * "pass" accent for colour-blind users.
 */
type Band = 'pass' | 'mid' | 'fail' | 'none';
const BAND: Record<Band, { cls: string; glyph: string; label: string }> = {
  pass: { cls: 'text-accent', glyph: '✓', label: 'at or above pass mark' },
  mid: { cls: 'text-orange-500', glyph: '•', label: 'below pass mark' },
  fail: { cls: 'text-red-500', glyph: '✕', label: 'failing' },
  none: { cls: 'text-faint', glyph: '', label: '' },
};
function bandOf(pct: number | null, passPct: number): Band {
  if (pct == null) return 'none';
  if (pct >= passPct) return 'pass';
  if (pct >= passPct - 20) return 'mid';
  return 'fail';
}

/** A graded percentage with a non-colour band cue (glyph + screen-reader label). */
function Pct({ pct, passPct, big = false }: { pct: number; passPct: number; big?: boolean }) {
  const b = BAND[bandOf(pct, passPct)];
  return (
    <span className={[big ? 'text-base font-bold' : 'font-medium', b.cls].join(' ')}>
      <span aria-hidden="true">{b.glyph} </span>
      {pct}%<span className="sr-only"> ({b.label})</span>
    </span>
  );
}

function CellGrade({ cell, passPct }: { cell: GradebookCell; passPct: number }) {
  if (cell.grade != null) {
    const b = BAND[bandOf(cell.pct, passPct)];
    return (
      <span className={['font-medium', b.cls].join(' ')}>
        <span aria-hidden="true">{b.glyph} </span>
        {cell.grade}
        <span className="text-faint">/{cell.points}</span>
        <span className="sr-only"> ({b.label})</span>
      </span>
    );
  }
  if (cell.submitted) return <span className="text-[11px] font-medium text-orange-500">Submitted</span>;
  return <span className="text-faint">--</span>;
}

export function GradebookModal({
  classId,
  className,
  onClose,
}: {
  classId: string;
  className: string;
  onClose: () => void;
}) {
  const [gb, setGb] = useState<Gradebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/classes/${classId}/gradebook`)
      .then((r) => r.json())
      .then((d: { gradebook?: Gradebook; error?: string }) => {
        if (!alive) return;
        if (d.gradebook) setGb(d.gradebook);
        else setError(d.error ?? 'Could not load the gradebook.');
      })
      .catch(() => alive && setError('Could not load the gradebook.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [classId]);

  const passPct = gb ? Math.round(gb.passThreshold * 100) : 70;
  const hasRows = !!gb && gb.rows.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      eyebrow="Gradebook"
      title={className}
      subtitle={
        gb
          ? `${gb.rows.length} ${gb.rows.length === 1 ? 'student' : 'students'} · ${gb.assignments.length} ${gb.assignments.length === 1 ? 'assignment' : 'assignments'} · pass mark ${passPct}%`
          : undefined
      }
      headerRight={
        hasRows ? (
          <a
            href={`/api/classes/${classId}/gradebook?format=csv`}
            className="press ring-focus inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-fill px-3 py-2 text-sm font-semibold text-canvas elev-1"
          >
            <DownloadIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Export&nbsp;</span>CSV
          </a>
        ) : undefined
      }
    >
      {loading ? (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Loading gradebook…
        </p>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
          {error}
        </p>
      ) : hasRows && gb ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-elevated text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="sticky left-0 z-10 bg-elevated px-4 py-3 font-semibold">Student</th>
                  <th className="px-3 py-3 text-center font-semibold">Progress</th>
                  <th className="px-3 py-3 text-center font-semibold">Final exam</th>
                  {gb.assignments.map((a) => (
                    <th key={a.id} className="px-3 py-3 text-center font-semibold" title={a.title}>
                      <span className="block max-w-[120px] truncate normal-case">{a.title}</span>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold">Overall</th>
                  <th className="px-3 py-3 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {gb.rows.map((r) => (
                  <tr key={r.studentId} className="hover:bg-mint/60">
                    <td className="sticky left-0 z-10 max-w-[200px] truncate bg-surface px-4 py-2.5 text-ink">{r.email}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-ink">{r.progressPct}%</span>
                      <span className="block text-[11px] text-faint">
                        {r.lessonsCompleted}/{gb.lessonCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {r.examPct != null ? (
                        <>
                          <Pct pct={r.examPct} passPct={passPct} />
                          <span className="block text-[11px] text-faint">
                            {r.examScore}/{r.examTotal}
                          </span>
                        </>
                      ) : (
                        <span className="text-faint">--</span>
                      )}
                    </td>
                    {r.assignments.map((cell, i) => (
                      <td key={gb.assignments[i].id} className="px-3 py-2.5 text-center">
                        <CellGrade cell={cell} passPct={passPct} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center">
                      {r.overallPct != null ? (
                        <Pct pct={r.overallPct} passPct={passPct} big />
                      ) : (
                        <span className="text-faint">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {r.completedAt != null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-bold text-accent">
                          <CheckIcon className="h-3 w-3" /> Done
                        </span>
                      ) : (
                        <span className="text-[11px] text-faint">In progress</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line-strong bg-elevated/70 text-sm font-semibold">
                <tr>
                  <td className="sticky left-0 z-10 bg-elevated px-4 py-3 text-faint">Class average</td>
                  <td className="px-3 py-3 text-center text-ink">{gb.averages.progressPct ?? '--'}%</td>
                  <td className="px-3 py-3 text-center text-ink">
                    {gb.averages.examPct != null ? `${gb.averages.examPct}%` : '--'}
                  </td>
                  {gb.averages.perAssignmentPct.map((p, i) => (
                    <td key={gb.assignments[i].id} className="px-3 py-3 text-center text-ink">
                      {p != null ? `${p}%` : '--'}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center text-accent">
                    {gb.averages.overallPct != null ? `${gb.averages.overallPct}%` : '--'}
                  </td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            Overall is the average of each student&apos;s graded performance components (final exam + graded
            assignments). Lesson progress is shown as completion and isn&apos;t folded into the grade. Per-module quiz
            scores aren&apos;t recorded yet.
          </p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong bg-canvas p-10 text-center">
          <p className="font-semibold text-ink">No students enrolled yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Once students join with your email and code, their progress, exam results, and assignment grades show up
            here.
          </p>
        </div>
      )}
    </Modal>
  );
}
