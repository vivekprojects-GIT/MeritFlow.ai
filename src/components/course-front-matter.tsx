'use client';

import type { ReactNode } from 'react';
import type { EnrichedCourse } from '@/lib/course-schema';
import { isLessonLocked, isModuleLocked, isQuizLocked } from '@/lib/course-schema';
import { buildPagination } from '@/lib/pagination';
import {
  ArrowRightIcon,
  AwardIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  LayersIcon,
  LockIcon,
  PlayIcon,
  QuizIcon,
  SparklesIcon,
} from './icons';

/**
 * The first thing you see inside a course: what it is, and every way in.
 *
 * ## Why cards rather than the book front matter this replaced
 *
 * This used to be three printed pages — a title page, a syllabus in prose, and
 * a table of contents with leader dots and page numbers. It was handsome, and
 * it answered the wrong question. A learner arriving at a course they are
 * halfway through wants to see where they stopped and get back to it; a
 * contents list rendered as a printed index makes them read the whole thing to
 * find one line.
 *
 * The chapters are now cards, laid out on the same grid as the course library,
 * so a module carries its own progress and its own way in. It also means the
 * app has one visual language instead of two: the shelf, the catalogue and the
 * inside of a course now look like the same product.
 *
 * ## What was kept
 *
 * The order — what the course is, what you will be able to do, then how it is
 * built — because that is the order the questions arrive in. And every entry
 * point the contents page had: each lesson, each workshop, each set of review
 * questions, and the final examination.
 */

const MODULE_HUES = ['#125c4d', '#9c6b1f', '#8a2b2b', '#2a6f62', '#5b3a6b', '#3a4a52', '#7c3aed'];

const moduleHue = (index: number): string => MODULE_HUES[index % MODULE_HUES.length];

export function CourseFrontMatter({
  course,
  totalLessons,
  totalVideos,
  completedCount,
  pct,
  startLabel,
  onStart,
  upNext,
  hasExam,
  examCount,
  certId,
  onExam,
  completed,
  onSelectLesson,
  onLab,
  onQuiz,
  keyOf,
}: {
  course: EnrichedCourse;
  totalLessons: number;
  totalVideos: number;
  completedCount: number;
  pct: number;
  startLabel: string;
  onStart: () => void;
  /** The lesson the start button would open, when there is one left. */
  upNext: string | null;
  hasExam: boolean;
  examCount: number;
  certId: string | null;
  onExam: () => void;
  completed: Set<string>;
  onSelectLesson: (m: number, l: number) => void;
  onLab: (m: number) => void;
  onQuiz: (m: number) => void;
  keyOf: (m: number, l: number) => string;
}) {
  const pagination = buildPagination(course);

  return (
    <div className="animate-fade-in-up mx-auto max-w-5xl space-y-5 px-4 pb-12 sm:px-6">
      {/* ── The course itself ─────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        {/* The library's plate, at the scale of a page rather than a card. */}
        <div
          className="relative flex h-32 items-end overflow-hidden px-6 pb-4 sm:h-40 sm:px-8"
          style={{
            background: `linear-gradient(130deg, ${moduleHue(0)}, color-mix(in srgb, ${moduleHue(0)} 72%, #ffffff))`,
          }}
        >
          <span
            aria-hidden
            className="absolute -right-4 -top-10 select-none font-serif text-[170px] font-medium leading-none text-white/15"
          >
            {(course.title.trim().charAt(0) || 'C').toUpperCase()}
          </span>
          {course.level && (
            <span className="relative rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
              {course.level}
            </span>
          )}
          {completedCount > 0 && (
            <span className="relative ml-auto inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-accent">
              {pct === 100 ? (
                <>
                  <CheckIcon className="h-3 w-3" />
                  Complete
                </>
              ) : (
                `${pct}%`
              )}
            </span>
          )}
        </div>

        <div className="p-6 sm:p-8">
          <h1 className="font-serif text-[clamp(1.7rem,1.2rem+2vw,2.5rem)] font-medium leading-tight text-ink">
            {course.title}
          </h1>
          {course.subtitle && <p className="mt-2 text-base text-muted">{course.subtitle}</p>}

          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink/90">{course.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <Stat icon={<LayersIcon className="h-3.5 w-3.5" />} value={`${course.modules.length} modules`} />
            <Stat icon={<BookIcon className="h-3.5 w-3.5" />} value={`${totalLessons} lessons`} />
            {course.estimatedHours > 0 && (
              <Stat icon={<ClockIcon className="h-3.5 w-3.5" />} value={`~${course.estimatedHours} h`} />
            )}
            {totalVideos > 0 && (
              <span className="inline-flex items-center gap-1.5 text-accent">
                <PlayIcon className="h-3 w-3" />
                {totalVideos} videos
              </span>
            )}
            {hasExam && (
              <span className="inline-flex items-center gap-1.5">
                <AwardIcon className="h-3.5 w-3.5" />
                Certificate on examination
              </span>
            )}
          </div>

          {completedCount > 0 && (
            <div className="mt-5 max-w-sm">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-ink">
                  {completedCount} of {totalLessons} lessons
                </span>
                <span className="tabular-nums text-muted">{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-accent-fill transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              onClick={onStart}
              className="press ring-focus inline-flex items-center gap-2 rounded-full bg-accent-fill px-6 py-3 text-sm font-bold text-white transition"
            >
              {startLabel}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            {/* Naming the lesson, so the button says where it goes rather than
                only that it goes somewhere. */}
            {upNext && (
              <p className="min-w-0 text-sm text-muted">
                Up next: <span className="font-semibold text-ink">{upNext}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── What it is for, and what it assumes ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">By the end you will be able to</p>
          <ol className="mt-3 space-y-2.5">
            {course.outcomes.map((outcome, index) => (
              <li key={index} className="flex items-start gap-3 text-sm leading-relaxed text-ink">
                <span className="mt-px shrink-0 font-semibold tabular-nums text-accent">{index + 1}.</span>
                {outcome}
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-4">
          {course.prerequisites.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Before you begin</p>
              <ul className="mt-3 space-y-2">
                {course.prerequisites.map((item, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink">
                    <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasExam && (
            <section className="rounded-2xl border border-line bg-mint/40 p-6">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                <AwardIcon className="h-3.5 w-3.5" />
                Examination
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                {certId
                  ? 'You have passed the final examination. Your certificate is available any time.'
                  : `A final examination of ${examCount} questions draws on every module. Pass it to earn a verifiable certificate.`}
              </p>
              {certId ? (
                <a
                  href={`/certificate/${certId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-4 py-2 text-[13px] font-semibold text-ink"
                >
                  View certificate
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              ) : (
                <button
                  onClick={onExam}
                  className="press mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-fill px-4 py-2 text-[13px] font-bold text-white"
                >
                  Sit the examination
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </section>
          )}
        </div>
      </div>

      {/* ── The modules, on the library's grid ────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <span className="eyebrow">What is inside</span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Modules</h2>
          </div>
          <p className="text-sm text-muted">
            {course.modules.length} modules · {totalLessons} lessons · {pagination.totalPages} pages
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {course.modules.map((mod, m) => {
            const hue = moduleHue(m);
            const moduleLocked = isModuleLocked(course, m);
            const done = mod.lessons.filter((_, l) => completed.has(keyOf(m, l))).length;
            const modulePct = mod.lessons.length ? Math.round((done / mod.lessons.length) * 100) : 0;

            return (
              <article
                key={m}
                className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all ${
                  moduleLocked ? 'opacity-60' : 'hover:border-accent/30 hover:shadow-soft'
                }`}
              >
                <div
                  className="relative flex h-20 items-end overflow-hidden px-5 pb-3"
                  style={{ background: `linear-gradient(130deg, ${hue}, color-mix(in srgb, ${hue} 72%, #ffffff))` }}
                >
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-6 select-none font-serif text-[92px] font-medium leading-none text-white/15"
                  >
                    {m + 1}
                  </span>
                  <span className="relative rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                    Module {m + 1}
                  </span>
                  {moduleLocked ? (
                    <span className="relative ml-auto inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-muted">
                      <LockIcon className="h-3 w-3" />
                      Locked
                    </span>
                  ) : (
                    done > 0 && (
                      <span className="relative ml-auto inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-accent">
                        {modulePct === 100 ? (
                          <>
                            <CheckIcon className="h-3 w-3" />
                            Done
                          </>
                        ) : (
                          `${done}/${mod.lessons.length}`
                        )}
                      </span>
                    )
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-serif text-lg font-medium leading-snug text-ink">{mod.title}</h3>
                  {mod.summary && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{mod.summary}</p>}

                  {/* Every lesson, because this is the navigation the contents
                      page used to be — not a summary of it. */}
                  <ul className="mt-4 space-y-0.5">
                    {mod.lessons.map((lesson, l) => {
                      const locked = isLessonLocked(course, m, l);
                      const isDone = completed.has(keyOf(m, l));
                      return (
                        <li key={l}>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => onSelectLesson(m, l)}
                            className="ring-focus flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink transition hover:bg-elevated disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold tabular-nums ${
                                isDone ? 'border-accent bg-accent-fill text-white' : 'border-line text-faint'
                              }`}
                            >
                              {isDone ? <CheckIcon className="h-2.5 w-2.5" /> : l + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                            {lesson.video && !locked && <PlayIcon className="h-2.5 w-2.5 shrink-0 text-faint" />}
                            {locked && <LockIcon className="h-3 w-3 shrink-0 text-faint" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    <button
                      type="button"
                      disabled={moduleLocked}
                      onClick={() => onLab(m)}
                      className="ring-focus inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent/40 disabled:cursor-not-allowed disabled:text-faint"
                    >
                      <SparklesIcon className="h-3 w-3 text-accent" />
                      Workshop
                    </button>
                    {(mod.quiz?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        disabled={isQuizLocked(course, m)}
                        onClick={() => onQuiz(m)}
                        className="ring-focus inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent/40 disabled:cursor-not-allowed disabled:text-faint"
                      >
                        <QuizIcon className="h-3 w-3 text-accent" />
                        Review ({mod.quiz.length})
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {hasExam && (
          <button
            type="button"
            onClick={onExam}
            className="ring-focus mt-4 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition hover:border-accent/30 hover:shadow-soft"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-accent">
              <AwardIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink">Final examination</span>
              <span className="block text-sm text-muted">
                {examCount} questions drawing on every module{certId ? ' · passed' : ''}
              </span>
            </span>
            <ArrowRightIcon className="ml-auto h-4 w-4 shrink-0 text-accent" />
          </button>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {value}
    </span>
  );
}
