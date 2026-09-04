'use client';

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { EnrichedCourse, EnrichedLesson, QuizQuestion, VideoInfo } from '@/lib/course-schema';
import { buildExam, courseHasExam, isLessonLocked, isModuleLocked, isQuizLocked, PASS_THRESHOLD } from '@/lib/course-schema';
import { Confetti, ScoreRing } from './celebrate';
import { CodePlayground, toRunLang } from './code-playground';
import { LessonAssistant } from './lesson-assistant';
import { LessonProse, CodeBlock, parseBlocks } from './lesson-prose';
import { lessonContextFrom } from '@/lib/lesson-assistant';
import { CourseFrontMatter } from './course-front-matter';
import { ClassAssignments } from './class-assignments';
import { LessonMindmap } from './lesson-mindmap';
import { usePersisted } from '@/lib/use-persisted';
import { ReadingControls, useReadingPrefs } from './reading-prefs';
import { ModuleActivityLab } from './module-activity-lab';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  AwardIcon,
  BookIcon,
  ChatIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CodeIcon,
  ExternalLinkIcon,
  LayersIcon,
  LightbulbIcon,
  LockIcon,
  MenuIcon,
  PencilIcon,
  PlayIcon,
  QuizIcon,
  RefreshIcon,
  SparklesIcon,
} from './icons';

type Selection =
  | { kind: 'lesson'; m: number; l: number }
  | { kind: 'lab'; m: number }
  | { kind: 'quiz'; m: number }
  | { kind: 'exam' }
  | { kind: 'assignments' }
  | null;

const keyOf = (m: number, l: number) => `${m}:${l}`;

/** True when a selection still points at something that exists in `course`. */
function selectionExists(selection: Selection, course: EnrichedCourse): boolean {
  if (!selection) return true;
  switch (selection.kind) {
    case 'lesson':
      return Boolean(course.modules[selection.m]?.lessons[selection.l]);
    case 'lab':
      return Boolean(course.modules[selection.m]);
    case 'quiz':
      return (course.modules[selection.m]?.quiz?.length ?? 0) > 0;
    default:
      return true;
  }
}

export function CourseReader({
  course: initialCourse,
  onReset,
  courseId,
  classId,
  examLocked = false,
  initialCompleted = [],
  onProgress,
  onCourseUpdated,
  initialAssignmentId,
}: {
  course: EnrichedCourse;
  onReset: () => void;
  courseId?: string;
  classId?: string;
  examLocked?: boolean;
  initialCompleted?: string[];
  onProgress?: (completedCount: number) => void;
  /** Fired when the course assistant edits the course, so the shell can keep up. */
  onCourseUpdated?: (course: EnrichedCourse) => void;
  initialAssignmentId?: string;
}) {
  /* The course is state, not just a prop: the assistant can rewrite it mid-read.
     The parent remounts this component (via key) when a different course opens. */
  const [course, setCourse] = useState<EnrichedCourse>(initialCourse);
  // Arriving from a deadline shortcut opens the Assignments tab directly.
  const [selection, setSelection] = useState<Selection>(initialAssignmentId ? { kind: 'assignments' } : null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set(initialCompleted));
  const [quizPassed, setQuizPassed] = useState<Set<number>>(() => new Set());
  const [certId, setCertId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  /* On large screens the assistant is a docked third column rather than an
     overlay, so it can sit beside the lesson while you read. */
  const chatDocked = chatOpen;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const exam = buildExam(course);
  const hasExam = courseHasExam(course);

  const flat = course.modules.flatMap((mod, m) =>
    mod.lessons.map((lesson, l) => ({ m, l, lesson, moduleTitle: mod.title })),
  );
  const totalLessons = flat.length;
  const totalVideos = flat.filter((x) => x.lesson.video).length;
  const completedCount = completed.size;
  const pct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;
  const xp = completedCount * 10;
  const courseKey = classId ?? courseId ?? course.title;

  const currentIndex =
    selection?.kind === 'lesson' ? flat.findIndex((x) => x.m === selection.m && x.l === selection.l) : -1;
  const prev = currentIndex > 0 ? flat[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null;

  const firstIncomplete = flat.find(
    (x) => !completed.has(keyOf(x.m, x.l)) && !isLessonLocked(course, x.m, x.l),
  );
  const startTarget: Selection = firstIncomplete
    ? { kind: 'lesson', m: firstIncomplete.m, l: firstIncomplete.l }
    : { kind: 'lesson', m: 0, l: 0 };
  const startLabel =
    completedCount === 0 ? 'Start the course' : completedCount >= totalLessons ? 'Review course' : 'Continue learning';

  function select(s: Selection) {
    setSelection(s);
    setDrawerOpen(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function markComplete(m: number, l: number, value: boolean) {
    const k = keyOf(m, l);
    const nextSet = new Set(completed);
    if (value) nextSet.add(k);
    else nextSet.delete(k);
    setCompleted(nextSet);
    onProgress?.(nextSet.size);
    const url = classId
      ? `/api/classes/${classId}/progress`
      : courseId
        ? `/api/courses/${courseId}/progress`
        : null;
    if (url) {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonKey: k, completed: value }),
      }).catch(() => {
        /* best-effort */
      });
    }
  }

  function toggle(m: number, l: number) {
    markComplete(m, l, !completed.has(keyOf(m, l)));
  }

  function completeAndContinue() {
    if (selection?.kind !== 'lesson') return;
    markComplete(selection.m, selection.l, true);
    if (next) select({ kind: 'lesson', m: next.m, l: next.l });
  }

  function passQuiz(m: number) {
    setQuizPassed((prev) => new Set(prev).add(m));
  }

  /**
   * Adopt a course the assistant just rewrote. An edit can delete the very
   * thing being read, so any selection that no longer exists falls back to the
   * overview rather than indexing into nothing.
   */
  function applyCourseUpdate(next: EnrichedCourse) {
    setCourse(next);
    onCourseUpdated?.(next);
    setSelection((current) => (selectionExists(current, next) ? current : null));
  }

  /* The assistant's context, rebuilt whenever the reader moves. Assembled here
     rather than inside the assistant so the model can never be handed a
     position the reader is not actually on. Null off a lesson, there is
     nothing lesson-specific to ground an answer in on an overview page. */
  const assistantContext =
    selection?.kind === 'lesson'
      ? lessonContextFrom(course, selection.m, selection.l, {
          lessonsDone: completedCount,
          lessonsTotal: totalLessons,
        })
      : null;

  /* An accepted rewrite is applied to the course the same way any other edit
     is, so undo, persistence and the sidebar all behave identically. */
  function applySectionRewrite(sectionIndex: number, body: string) {
    if (selection?.kind !== 'lesson') return;
    const next = structuredClone(course) as EnrichedCourse;
    const section = next.modules?.[selection.m]?.lessons?.[selection.l]?.sections?.[sectionIndex];
    if (!section) return;
    section.body = body;
    applyCourseUpdate(next);
  }

  /* Questions are appended, never replaced. An author asking for "more" means
     more, and silently dropping the existing quiz would lose work that the
     certification exam is already sampling from. */
  function applyQuizAddition(moduleIndex: number, questions: QuizQuestion[]) {
    const next = structuredClone(course) as EnrichedCourse;
    const mod = next.modules?.[moduleIndex];
    if (!mod) return;
    mod.quiz = [...(mod.quiz ?? []), ...questions];
    applyCourseUpdate(next);
  }

  function applyLessonMeta(patch: { title?: string; objective?: string; keyPoints?: string[] }) {
    if (selection?.kind !== 'lesson') return;
    const next = structuredClone(course) as EnrichedCourse;
    const lesson = next.modules?.[selection.m]?.lessons?.[selection.l];
    if (!lesson) return;
    if (patch.title) lesson.title = patch.title;
    if (patch.objective) lesson.objective = patch.objective;
    if (patch.keyPoints) lesson.keyPoints = patch.keyPoints;
    applyCourseUpdate(next);
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-surface lg:hidden"
            aria-label="Open contents"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent">
              <SparklesIcon className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-semibold text-ink">{course.title}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="hidden rounded-lg border border-line p-2 text-muted transition-colors hover:text-ink lg:inline-flex"
              aria-label={sidebarCollapsed ? 'Show contents' : 'Focus mode'}
              title={sidebarCollapsed ? 'Show contents' : 'Focus mode'}
            >
              <LayersIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="press ring-focus inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.07] px-3 py-1.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/[0.12]"
              title={courseId ? 'Ask about this course. Use /edit inside chat to change it.' : 'Ask about this course'}
            >
              <ChatIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Ask</span>
            </button>
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-bold text-accent sm:inline-flex">
              <SparklesIcon className="h-3.5 w-3.5" />
              {xp} XP
            </span>
            <div className="flex items-center gap-2">
              <ProgressRing pct={pct} />
              <span className="hidden text-xs font-medium text-muted sm:inline">
                {completedCount}/{totalLessons}
              </span>
            </div>
            <button
              onClick={onReset}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink"
            >
              <SparklesIcon className="h-4 w-4 text-accent" />
              <span className="hidden sm:inline">New course</span>
            </button>
          </div>
        </div>
      </header>

      <div
        className={[
          'mx-auto grid max-w-[1680px] grid-cols-1',
          /* Four literal class strings so Tailwind can see them — a template
             built at runtime would never be generated. */
          sidebarCollapsed
            ? chatDocked
              ? 'lg:grid-cols-[60px_minmax(0,1fr)_380px]'
              : 'lg:grid-cols-[60px_minmax(0,1fr)]'
            : chatDocked
              ? 'lg:grid-cols-[290px_minmax(0,1fr)_380px]'
              : 'lg:grid-cols-[300px_minmax(0,1fr)]',
        ].join(' ')}
      >
        {/* Collapsed rail, the contents never disappear entirely, they shrink
            to numbered stops you can still navigate and click to reopen. */}
        {sidebarCollapsed && (
          <aside className="hidden lg:block lg:border-r lg:border-line">
            <div className="sticky top-[57px] flex max-h-[calc(100vh-57px)] flex-col items-center gap-1 overflow-y-auto py-4">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="ring-focus mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
                aria-label="Expand contents"
                title="Expand contents"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
              {course.modules.map((mod, m) => {
                const done = mod.lessons.filter((_, l) => completed.has(keyOf(m, l))).length;
                const complete = done === mod.lessons.length;
                const current = selection && 'm' in selection && selection.m === m;
                return (
                  <button
                    key={m}
                    onClick={() => select({ kind: 'lesson', m, l: 0 })}
                    title={`${m + 1}. ${mod.title}`}
                    aria-label={`${m + 1}. ${mod.title}`}
                    className={[
                      'ring-focus flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold transition-colors',
                      current
                        ? 'bg-accent text-canvas'
                        : complete
                          ? 'bg-success-soft text-success hover:bg-success/20'
                          : 'text-muted hover:bg-surface hover:text-ink',
                    ].join(' ')}
                  >
                    {m + 1}
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* Sidebar (desktop) */}
        <aside className={sidebarCollapsed ? 'hidden' : 'hidden lg:block lg:border-r lg:border-line'}>
          <div className="thin-scroll sticky top-[57px] max-h-[calc(100vh-57px)] overflow-y-auto px-4 py-4">
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="ring-focus mb-3 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-faint transition-colors hover:bg-surface hover:text-ink"
              title="Collapse contents"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
              Collapse
            </button>
            <SidebarContent
              course={course}
              selection={selection}
              onSelect={select}
              onToggle={toggle}
              completed={completed}
              completedCount={completedCount}
              totalLessons={totalLessons}
              pct={pct}
              quizPassed={quizPassed}
              hasExam={hasExam}
              certId={certId}
              classId={classId}
            />
          </div>
        </aside>

        {/* Sidebar (mobile drawer) */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
            <div className="thin-scroll absolute left-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto border-r border-line bg-surface px-4 py-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Contents</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-lg p-2 text-muted hover:bg-surface"
                  aria-label="Close contents"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent
                course={course}
                selection={selection}
                onSelect={select}
                onToggle={toggle}
                completed={completed}
                completedCount={completedCount}
                totalLessons={totalLessons}
                pct={pct}
                quizPassed={quizPassed}
                hasExam={hasExam}
                certId={certId}
                classId={classId}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 px-4 py-8 sm:px-8">
          {selection === null ? (
            <Overview
              course={course}
              totalLessons={totalLessons}
              totalVideos={totalVideos}
              completedCount={completedCount}
              pct={pct}
              startLabel={startLabel}
              onStart={() => select(startTarget)}
              hasExam={hasExam}
              examCount={exam.length}
              certId={certId}
              onExam={() => select({ kind: 'exam' })}
              completed={completed}
              onSelectLesson={(m, l) => select({ kind: 'lesson', m, l })}
              onLab={(m) => select({ kind: 'lab', m })}
              onQuiz={(m) => select({ kind: 'quiz', m })}
            />
          ) : (selection.kind === 'lesson' && isLessonLocked(course, selection.m, selection.l)) ||
            (selection.kind === 'lab' && isModuleLocked(course, selection.m)) ||
            (selection.kind === 'quiz' && isQuizLocked(course, selection.m)) ? (
            <LockedView onBack={() => select(null)} />
          ) : selection.kind === 'lab' ? (
            <ModuleActivityLab
              key={`lab-${selection.m}`}
              module={course.modules[selection.m]}
              moduleIndex={selection.m}
              courseKey={courseKey}
              quizLocked={isQuizLocked(course, selection.m)}
              onQuiz={() => select({ kind: 'quiz', m: selection.m })}
              onBackToOverview={() => select(null)}
            />
          ) : selection.kind === 'quiz' ? (
            <ModuleQuiz
              key={`quiz-${selection.m}`}
              moduleIndex={selection.m}
              moduleTitle={course.modules[selection.m].title}
              questions={course.modules[selection.m].quiz ?? []}
              alreadyPassed={quizPassed.has(selection.m)}
              onPassed={() => passQuiz(selection.m)}
              onBackToOverview={() => select(null)}
            />
          ) : selection.kind === 'exam' ? (
            <FinalExam
              course={course}
              questions={exam}
              certId={certId}
              classId={classId}
              examLocked={examLocked}
              onCertified={(id) => setCertId(id)}
              onBackToOverview={() => select(null)}
            />
          ) : selection.kind === 'assignments' ? (
            classId ? <ClassAssignments classId={classId} initialAssignmentId={initialAssignmentId} /> : null
          ) : (
            <LessonView
              key={`${selection.m}:${selection.l}`}
              lesson={course.modules[selection.m].lessons[selection.l]}
              moduleTitle={course.modules[selection.m].title}
              moduleIndex={selection.m}
              lessonIndex={selection.l}
              isCompleted={completed.has(keyOf(selection.m, selection.l))}
              onCompleteContinue={completeAndContinue}
              onPrev={prev ? () => select({ kind: 'lesson', m: prev.m, l: prev.l }) : undefined}
              onNext={next ? () => select({ kind: 'lesson', m: next.m, l: next.l }) : undefined}
              prevTitle={prev?.lesson.title}
              nextTitle={next?.lesson.title}

              courseKey={courseKey}
              lessonsInModule={course.modules[selection.m].lessons.length}
              pageNumber={currentIndex + 1}
              totalPages={totalLessons}
            />
          )}
        </main>

        {/* The one assistant. Docked beside the lesson, never over it: reading
            the text and the answer together is the whole point. */}
        {assistantContext && (
          <div className={chatOpen ? 'w-full max-w-full lg:w-[26rem] lg:shrink-0' : 'hidden'}>
            <LessonAssistant
              context={assistantContext}
              canEdit={Boolean(courseId)}
              open={chatOpen}
              onClose={() => setChatOpen(false)}
              onApplyEdit={applySectionRewrite}
              onAddQuiz={applyQuizAddition}
              onEditMeta={applyLessonMeta}
            />
          </div>
        )}
      </div>

    </div>
  );
}

function SidebarContent({
  course,
  selection,
  onSelect,
  onToggle,
  completed,
  completedCount,
  totalLessons,
  pct,
  quizPassed,
  hasExam,
  certId,
  classId,
}: {
  course: EnrichedCourse;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onToggle: (m: number, l: number) => void;
  completed: Set<string>;
  completedCount: number;
  totalLessons: number;
  pct: number;
  quizPassed: Set<number>;
  hasExam: boolean;
  certId: string | null;
  classId?: string;
}) {
  return (
    <nav className="space-y-5">
      <div className="rounded-xl border border-line bg-surface/50 px-3.5 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            {completedCount} / {totalLessons} complete
          </span>
          <span className="font-medium text-accent">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <button
        onClick={() => onSelect(null)}
        className={[
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
          selection === null ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface hover:text-ink',
        ].join(' ')}
      >
        <BookIcon className="h-4 w-4" />
        Course overview
      </button>

      {classId && (
        <button
          onClick={() => onSelect({ kind: 'assignments' })}
          className={[
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
            selection?.kind === 'assignments'
              ? 'bg-accent/12 text-accent'
              : 'text-muted hover:bg-surface hover:text-ink',
          ].join(' ')}
        >
          <PencilIcon className="h-4 w-4" />
          Assignments
        </button>
      )}

      {course.modules.map((mod, m) => {
        const hasQuiz = (mod.quiz?.length ?? 0) > 0;
        const labActive = selection?.kind === 'lab' && selection.m === m;
        const quizActive = selection?.kind === 'quiz' && selection.m === m;
        const moduleDone = mod.lessons.filter((_, l) => completed.has(keyOf(m, l))).length;
        return (
          /* Each module is its own card in the rail, so the flat checklist this
             used to be reads as a course with parts rather than one long list. */
          <div key={m} className="overflow-hidden rounded-xl border border-line bg-surface/50">
            <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Module {m + 1}</p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">{mod.title}</p>
              </div>
              <span className="mt-0.5 shrink-0 text-[11px] font-semibold tabular-nums text-muted">
                {moduleDone}/{mod.lessons.length}
              </span>
            </div>
            <ul className="space-y-0.5 p-1.5">
              {mod.lessons.map((lesson, l) => {
                const active = selection?.kind === 'lesson' && selection.m === m && selection.l === l;
                const done = completed.has(keyOf(m, l));
                const locked = isLessonLocked(course, m, l);
                if (locked) {
                  return (
                    <li key={l} className="flex items-center rounded-lg opacity-70">
                      <span className="shrink-0 py-2 pl-3">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-faint/40 text-faint">
                          <LockIcon className="h-3 w-3" />
                        </span>
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 pr-3" title="Locked by your professor">
                        <span className="flex-1 text-sm leading-snug text-faint">{lesson.title}</span>
                        <LockIcon className="h-3 w-3 shrink-0 text-faint" />
                      </div>
                    </li>
                  );
                }
                return (
                  <li
                    key={l}
                    className={[
                      'flex items-center rounded-lg transition-colors',
                      active ? 'bg-accent/12' : 'hover:bg-surface',
                    ].join(' ')}
                  >
                    <button
                      onClick={() => onToggle(m, l)}
                      className="shrink-0 py-2 pl-3"
                      aria-label={done ? 'Mark as not complete' : 'Mark as complete'}
                    >
                      <span
                        className={[
                          'flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
                          done
                            ? 'border-accent bg-accent text-canvas'
                            : 'border-faint/50 text-transparent hover:border-accent/70',
                        ].join(' ')}
                      >
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    </button>
                    <button
                      onClick={() => onSelect({ kind: 'lesson', m, l })}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 pr-3 text-left"
                    >
                      <span
                        className={[
                          'flex-1 text-sm leading-snug',
                          active ? 'font-medium text-accent' : done ? 'text-faint' : 'text-muted',
                        ].join(' ')}
                      >
                        {lesson.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-faint">
                        {lesson.video && <PlayIcon className="h-2.5 w-2.5" />}
                        {lessonDuration(lesson)}
                      </span>
                    </button>
                  </li>
                );
              })}
              {isModuleLocked(course, m) ? (
                <li className="flex items-center gap-2 rounded-lg py-2 pl-3 pr-3 opacity-70" title="Locked by your professor">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-faint/40 text-faint">
                    <LockIcon className="h-3 w-3" />
                  </span>
                  <span className="flex-1 text-sm text-faint">Practice lab</span>
                  <LockIcon className="h-3 w-3 shrink-0 text-faint" />
                </li>
              ) : (
                <li className={['rounded-lg transition-colors', labActive ? 'bg-accent/12' : 'hover:bg-surface'].join(' ')}>
                  <button
                    onClick={() => onSelect({ kind: 'lab', m })}
                    className="flex w-full items-center gap-2 py-2 pl-3 pr-3 text-left"
                  >
                    <span
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        labActive ? 'border-accent bg-accent text-canvas' : 'border-faint/50 text-faint',
                      ].join(' ')}
                    >
                      <SparklesIcon className="h-3 w-3" />
                    </span>
                    <span className={['flex-1 text-sm', labActive ? 'font-medium text-accent' : 'text-muted'].join(' ')}>
                      Practice lab
                    </span>
                  </button>
                </li>
              )}
              {hasQuiz &&
                (isQuizLocked(course, m) ? (
                  <li className="flex items-center gap-2 rounded-lg py-2 pl-3 pr-3 opacity-70" title="Locked by your professor">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-faint/40 text-faint">
                      <LockIcon className="h-3 w-3" />
                    </span>
                    <span className="flex-1 text-sm text-faint">Module quiz</span>
                    <LockIcon className="h-3 w-3 shrink-0 text-faint" />
                  </li>
                ) : (
                  <li className={['rounded-lg transition-colors', quizActive ? 'bg-accent/12' : 'hover:bg-surface'].join(' ')}>
                    <button
                      onClick={() => onSelect({ kind: 'quiz', m })}
                      className="flex w-full items-center gap-2 py-2 pl-3 pr-3 text-left"
                    >
                      <span
                        className={[
                          'flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
                          quizPassed.has(m) ? 'border-accent bg-accent text-canvas' : 'border-faint/50 text-faint',
                        ].join(' ')}
                      >
                        {quizPassed.has(m) ? <CheckIcon className="h-3 w-3" /> : <QuizIcon className="h-3 w-3" />}
                      </span>
                      <span className={['flex-1 text-sm', quizActive ? 'font-medium text-accent' : 'text-muted'].join(' ')}>
                        Module quiz
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        );
      })}

      {hasExam && (
        <div className="border-t border-line pt-4">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-faint">Certification</p>
          <button
            onClick={() => onSelect({ kind: 'exam' })}
            className={[
              'mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
              selection?.kind === 'exam' ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface hover:text-ink',
            ].join(' ')}
          >
            <AwardIcon className="h-4 w-4" />
            Final exam
          </button>
          {certId && (
            <a
              href={`/certificate/${certId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-accent hover:bg-surface"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              View certificate
            </a>
          )}
        </div>
      )}
    </nav>
  );
}

/**
 * The landing view inside a course.
 *
 * It used to render the front matter and then a second, larger panel that
 * listed the same modules again with the same entry points. Two navigations
 * for one course is not twice the help: a learner who clicks the wrong one
 * still gets there, but has to read both to know they are the same. The front
 * matter now carries the module cards, so the panel is gone and the one thing
 * only it did — naming the lesson you would resume at — moved into the header.
 */
function Overview({
  course,
  totalLessons,
  totalVideos,
  completedCount,
  pct,
  startLabel,
  onStart,
  hasExam,
  examCount,
  certId,
  onExam,
  completed,
  onSelectLesson,
  onLab,
  onQuiz,
}: {
  course: EnrichedCourse;
  totalLessons: number;
  totalVideos: number;
  completedCount: number;
  pct: number;
  startLabel: string;
  onStart: () => void;
  hasExam: boolean;
  examCount: number;
  certId: string | null;
  onExam: () => void;
  completed: Set<string>;
  onSelectLesson: (m: number, l: number) => void;
  onLab: (m: number) => void;
  onQuiz: (m: number) => void;
}) {
  /* The first lesson that is open and unread — where "continue" actually goes. */
  const upNext = course.modules
    .flatMap((mod, m) => mod.lessons.map((lesson, l) => ({ m, l, lesson })))
    .find((item) => !isLessonLocked(course, item.m, item.l) && !completed.has(keyOf(item.m, item.l)));

  return (
    <CourseFrontMatter
      course={course}
      totalLessons={totalLessons}
      totalVideos={totalVideos}
      completedCount={completedCount}
      pct={pct}
      startLabel={startLabel}
      onStart={onStart}
      upNext={upNext ? upNext.lesson.title : null}
      hasExam={hasExam}
      examCount={examCount}
      certId={certId}
      onExam={onExam}
      completed={completed}
      onSelectLesson={onSelectLesson}
      onLab={onLab}
      onQuiz={onQuiz}
      keyOf={keyOf}
    />
  );
}

function LockedView({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-accent">
        <LockIcon className="h-7 w-7" />
      </span>
      <h2 className="display mt-5 text-2xl text-ink">Locked by your professor</h2>
      <p className="mx-auto mt-2 max-w-sm text-muted">
        This part of the course isn&rsquo;t available yet. Your professor will unlock it when the class is ready for it.
      </p>
      <button
        onClick={onBack}
        className="press ring-focus mt-6 inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent/40"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back to overview
      </button>
    </div>
  );
}

/** Gamified circular progress indicator for the header. */
function ProgressRing({ pct }: { pct: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative h-9 w-9">
      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-black/[0.08]" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="36" y2="36">
            <stop offset="0" stopColor="#125c4d" />
            <stop offset="1" stopColor="#c08a2e" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink">{pct}%</span>
    </div>
  );
}

/** Per-lesson notepad, autosaved to localStorage. */
function NotesPanel({ noteKey }: { noteKey: string }) {
  const storageKey = `lumora_notes:${noteKey}`;
  const [note, setNote] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (note) localStorage.setItem(storageKey, note);
        else localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(id);
  }, [note, storageKey]);
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <PencilIcon className="h-3.5 w-3.5 text-accent" />
          Your notes
        </h2>
        <span className="text-[10px] text-faint">Autosaved</span>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Quick note from this lesson..."
        className="thin-scroll mt-2 w-full resize-y rounded-lg border border-line bg-canvas/50 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function ReaderModal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={[
          'thin-scroll animate-fade-in-up relative max-h-[88vh] w-full overflow-auto rounded-3xl border border-line bg-canvas p-6 shadow-2xl',
          wide ? 'max-w-3xl' : 'max-w-md',
        ].join(' ')}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <SparklesIcon className="h-4 w-4 text-accent" />
            {title}
          </h3>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LessonView({
  lesson,
  moduleTitle,
  moduleIndex,
  lessonIndex,
  isCompleted,
  onCompleteContinue,
  onPrev,
  onNext,
  prevTitle,
  nextTitle,

  courseKey,
  lessonsInModule,
  pageNumber,
  totalPages,
}: {
  lesson: EnrichedLesson;
  moduleTitle: string;
  moduleIndex: number;
  lessonIndex: number;
  isCompleted: boolean;
  onCompleteContinue: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevTitle?: string;
  nextTitle?: string;

  courseKey: string;
  /** For the running head — "Lesson 2 of 4". */
  lessonsInModule: number;
  /** Position across the whole course, so the footer shows a real page number. */
  pageNumber: number;
  totalPages: number;
}) {
  const reading = useReadingPrefs();
  const [railOpen, setRailOpen] = usePersisted<boolean>('courseai:rail-open', false);
  const introBlocks = parseBlocks(lesson.intro);
  const firstProse = introBlocks.findIndex((b) => b.kind === 'prose');
  const [editorOpen, setEditorOpen] = useState(false);
  const [mindmapOpen, setMindmapOpen] = useState(false);
  const [active, setActive] = useState(0);
  const firstExample = lesson.codeExamples[0];
  const canPractice = lesson.codeExamples.length > 0;
  const minutes = lessonMinutes(lesson);

  // Highlight the section currently in view, for the "On this page" rail.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number(e.target.getAttribute('data-section')));
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [lesson]);

  function goToSection(i: number) {
    document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMindmapOpen(false);
  }

  return (
    <>
      <div
        className={[
          'animate-fade-in-up grid grid-cols-1',
          railOpen ? 'gap-8 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]' : '',
        ].join(' ')}
      >
        <article
          className={[
            'mx-auto w-full overflow-hidden rounded-2xl border border-line bg-surface',
            railOpen ? 'max-w-3xl xl:mx-0 xl:max-w-4xl' : 'max-w-4xl',
          ].join(' ')}
          style={reading.style}
        >
          {/* Where you are, on a bar rather than a printed running head. */}
          <div className="running-head border-b border-line bg-elevated/40 px-5 py-2.5 sm:px-8">
            <span className="truncate">
              Module {moduleIndex + 1} · {moduleTitle}
            </span>
            <span className="ml-auto hidden shrink-0 sm:block">
              Lesson {lessonIndex + 1} of {lessonsInModule}
            </span>
          </div>

          <div className="px-5 py-7 sm:px-8 sm:py-10 xl:px-12">
          {/* Title block */}
          <header>
            {/* The reading page keeps its own typography. The card is the
                surface; the type on it is still the reader's. */}
            <p className="chapter-num">{lessonIndex === 0 ? 'Opening lesson' : `Lesson ${lessonIndex + 1}`}</p>
            <h1 className="chapter-title mt-2 text-left">{lesson.title}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
              <span>~{minutes} min read</span>
              <span aria-hidden>·</span>
              <span>
                {lesson.sections.length} {lesson.sections.length === 1 ? 'section' : 'sections'}
              </span>
              {lesson.video && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1 text-accent">
                    <PlayIcon className="h-3 w-3" />
                    Video
                  </span>
                </>
              )}
              <span className="ml-auto hidden items-center gap-2 sm:flex">
                {!railOpen && (
                  <button
                    onClick={() => setRailOpen(true)}
                    className="ring-focus hidden items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted transition-colors hover:border-accent/40 hover:text-accent xl:inline-flex"
                    title="Show contents, lesson map and tutor"
                  >
                    <LayersIcon className="h-3.5 w-3.5" />
                    Tools
                  </button>
                )}
                <ReadingControls prefs={reading.prefs} onChange={reading.setPrefs} />
              </span>
            </div>

            {/* What this lesson is for, stated before it starts. */}
            <p className="epigraph book-measure mt-6">{lesson.objective}</p>
          </header>

          {/* Video-first: the player is the hero when a lesson has one */}
          {lesson.video && (
            <div className="mt-7">
              <VideoBlock video={lesson.video} />
            </div>
          )}

          {/* Opening prose, with a drop cap */}
          <div className="book-measure mt-8">
            {introBlocks.map((b, i) =>
              b.kind === 'code' ? (
                <CodeBlock key={i} lang={b.lang} code={b.text} />
              ) : (
                <div key={i} className={reading.bodyClass}>
                  {/* The drop cap belongs on the first line of prose, which is
                      not necessarily the first block if the lesson opens with
                      a snippet. */}
                  <p className={i === firstProse ? 'drop-cap' : undefined}>{b.text}</p>
                </div>
              ),
            )}
          </div>

          {lesson.sections.map((section, i) => (
            <section key={i} id={`sec-${i}`} data-section={i} className="mt-10 scroll-mt-24">
              <h2 className="book-h2 book-measure">
                <span className="book-h2-num">
                  {moduleIndex + 1}.{i + 1}{' '}
                </span>
                {section.heading}
              </h2>
              <div className="book-measure mt-4">
                {/* Blocks, not paragraphs: a `<p>` collapses the newlines in a
                    code snippet and turns a function into a run-on sentence. */}
                <LessonProse body={section.body} proseClass={reading.bodyClass} />

                {/* Set apart rather than folded into the prose. A worked example
                    is the thing a reader scrolls back to find, and burying it in
                    paragraph four is why it gets missed. Absent on older library
                    courses, which is why both are conditional. */}
                {section.example && (
                  <aside className="mt-5 rounded-xl border-l-[3px] border-accent bg-mint/60 py-3 pl-4 pr-3">
                    <p className="sidenote-label">Worked example</p>
                    <div className="mt-1.5">
                      <LessonProse body={section.example} proseClass={reading.bodyClass} />
                    </div>
                  </aside>
                )}

                {section.pitfall && (
                  <aside className="mt-3 rounded-xl border-l-[3px] border-warn bg-warn-soft py-3 pl-4 pr-3">
                    <p className="sidenote-label !text-warn">Where this goes wrong</p>
                    <div className="mt-1.5">
                      <LessonProse body={section.pitfall} proseClass={reading.bodyClass} />
                    </div>
                  </aside>
                )}
              </div>
            </section>
          ))}

      {lesson.codeExamples.length > 0 && (
        <div className="mt-7 space-y-4">
          {lesson.codeExamples.map((ex, i) => (
            <figure key={i} className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0d13]">
              <figcaption className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs">
                <CodeIcon className="h-4 w-4 text-accent" />
                <span className="font-mono uppercase tracking-wider text-zinc-400">{ex.language}</span>
                <span className="ml-auto text-zinc-500">{ex.caption}</span>
              </figcaption>
              <pre className="thin-scroll overflow-x-auto px-4 py-4 text-[13px] leading-relaxed">
                <code className="font-mono text-zinc-100">{ex.code}</code>
              </pre>
            </figure>
          ))}
        </div>
      )}

      {lesson.keyPoints.length > 0 && (
        <>
          <div className="book-measure mt-9 rounded-2xl border border-line bg-mint/30 p-5">
            <h2 className="sidenote-label flex items-center gap-1.5">
              <LightbulbIcon className="h-3.5 w-3.5 text-accent" />
              In short
            </h2>
            <ul className="mt-3 space-y-2.5">
              {lesson.keyPoints.map((k, i) => (
                <li key={i} className="book-body flex items-start gap-2.5 text-[0.94em] leading-[1.6]">
                  <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {k}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {lesson.commonMistakes.length > 0 && (
        <div className="book-measure mt-4 rounded-2xl border border-line bg-warn-soft p-5">
          <h2 className="sidenote-label !text-warn flex items-center gap-1.5">
            <AlertTriangleIcon className="h-3.5 w-3.5 text-warn" />
            Where people go wrong
          </h2>
          <ul className="mt-3 space-y-2.5">
            {lesson.commonMistakes.map((m, i) => (
              <li key={i} className="book-body flex items-start gap-2.5 text-[0.94em] leading-[1.6]">
                <span className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-warn" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lesson.practice.trim() && (
        <div className="book-measure mt-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="sidenote-label flex items-center gap-1.5">
            <PencilIcon className="h-3.5 w-3.5 text-accent" />
            Exercise {moduleIndex + 1}.{lessonIndex + 1}
          </h2>
          <p className="book-body mt-2 text-[0.98em]">{lesson.practice}</p>
        </div>
      )}

      {/* Practice IDE, hidden until the learner opens it. */}
      {canPractice && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <CodeIcon className="h-3.5 w-3.5 text-accent" />
              Try it yourself
            </h2>
            {!editorOpen && (
              <button
                onClick={() => setEditorOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-canvas transition-all hover:brightness-110"
              >
                <PlayIcon className="h-3 w-3" />
                Open editor
              </button>
            )}
          </div>
          {editorOpen ? (
            <div className="mt-3">
              <CodePlayground initialCode={firstExample.code} language={toRunLang(firstExample.language)} />
              <p className="mt-2 text-xs text-faint">Edit, run, and experiment in the browser.</p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-muted">Practice with the lesson example when you are ready.</p>
          )}
        </div>
      )}

      {/* Your notes, saved per lesson on this device */}
      <NotesPanel noteKey={`${courseKey}:${moduleIndex}:${lessonIndex}`} />

      {/* There is one assistant and one way in: the Ask control in the lesson
          toolbar, which opens the docked panel. This used to also live as a
          card here and as a button in the rail, so a lesson offered three
          doors to the same room and each looked like a different feature. */}

      {/* Completion + navigation */}
      <div className="mt-10 border-t border-line pt-6">
        {!isCompleted ? (
          <button
            onClick={onCompleteContinue}
            className="glow-accent inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas transition-all hover:brightness-110 sm:w-auto"
          >
            <CheckIcon className="h-4 w-4" />
            {onNext ? 'Mark complete & continue' : 'Mark complete & finish'}
          </button>
        ) : onNext ? (
          <button
            onClick={onNext}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/40 sm:w-auto"
          >
            Next lesson
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/[0.07] px-5 py-3 text-sm font-medium text-accent">
            <CheckIcon className="h-5 w-5" />
            Course complete, nicely done!
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          {onPrev ? (
            <button onClick={onPrev} className="inline-flex min-w-0 items-center gap-1.5 text-muted hover:text-ink">
              <ChevronLeftIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{prevTitle}</span>
            </button>
          ) : (
            <span />
          )}
          {onNext ? (
            <button
              onClick={onNext}
              className="inline-flex min-w-0 items-center justify-end gap-1.5 text-muted hover:text-ink"
            >
              <span className="truncate">{nextTitle}</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0" />
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>

      {onNext && (
        <button
          onClick={onNext}
          className="card-edit ring-focus mt-6 flex w-full items-center gap-4 rounded-2xl p-4 text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-fill text-canvas">
            <PlayIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-faint">Up next</span>
            <span className="block truncate font-semibold text-ink">{nextTitle}</span>
          </span>
          <ArrowRightIcon className="h-5 w-5 shrink-0 text-accent" />
        </button>
      )}

      {/* Folio, the foot of the page */}
      {/* Where this lesson sits in the course, closing the card. */}
      <div className="folio mt-9 flex items-center gap-3 border-t border-line pt-4">
        <span className="truncate">{moduleTitle}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {pageNumber} / {totalPages}
        </span>
      </div>
      </div>
        </article>

        {/* Right rail, only rendered when open, so nothing is reserved when it is not */}
        <aside className={railOpen ? 'hidden xl:block' : 'hidden'}>
          <div className="sticky top-[73px] space-y-4">
            <button
              onClick={() => setRailOpen(false)}
              className="ring-focus flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-faint transition-colors hover:text-ink"
              title="Hide study tools"
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
              Hide
            </button>
            {railOpen && lesson.sections.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">On this page</p>
                <nav className="mt-2 space-y-0.5">
                  {lesson.sections.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => goToSection(i)}
                      className={[
                        'block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                        active === i ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-canvas hover:text-ink',
                      ].join(' ')}
                    >
                      {s.heading}
                    </button>
                  ))}
                </nav>
              </div>
            )}

            {railOpen && (
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">Lesson map</p>
                <button onClick={() => setMindmapOpen(true)} className="text-xs font-medium text-accent hover:opacity-80">
                  Expand
                </button>
              </div>
              <button onClick={() => setMindmapOpen(true)} className="mt-1 block w-full" aria-label="Expand mindmap">
                <LessonMindmap title={lesson.title} sections={lesson.sections} variant="compact" />
              </button>
            </div>

            )}

          </div>
        </aside>
      </div>

      {mindmapOpen && (
        <ReaderModal title="Lesson mindmap" onClose={() => setMindmapOpen(false)} wide>
          <p className="mb-3 text-sm text-muted">A map of this lesson, click a branch to jump to that section.</p>
          <LessonMindmap title={lesson.title} sections={lesson.sections} variant="full" onSelectSection={goToSection} />
        </ReaderModal>
      )}

    </>
  );
}

/* ── Quiz grading shared bits ───────────────────────────────────────────── */

function QuestionBlock({
  index,
  question,
  selected,
  submitted,
  onSelect,
}: {
  index: number;
  question: QuizQuestion;
  selected: number | undefined;
  submitted: boolean;
  onSelect: (optionIndex: number) => void;
}) {
  const answered = selected !== undefined;
  const right = submitted && selected === question.answerIndex;

  return (
    <div
      className={[
        'relative overflow-hidden rounded-2xl border bg-canvas p-5 transition-all duration-300 sm:p-6',
        submitted
          ? right
            ? 'border-success/40 bg-success-soft/40'
            : 'border-danger/35 bg-danger-soft/40'
          : answered
            ? 'border-accent/35 shadow-soft'
            : 'border-line',
      ].join(' ')}
    >
      {/* Status rail */}
      <span
        aria-hidden
        className={[
          'absolute inset-y-0 left-0 w-1 transition-colors',
          submitted ? (right ? 'bg-success' : 'bg-danger') : answered ? 'bg-accent' : 'bg-transparent',
        ].join(' ')}
      />

      <div className="flex items-start gap-3">
        <span
          className={[
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black transition-colors',
            submitted
              ? right
                ? 'bg-success text-white'
                : 'bg-danger text-white'
              : 'bg-mint text-accent',
          ].join(' ')}
        >
          {submitted ? (
            right ? (
              <CheckIcon className="h-4 w-4" />
            ) : (
              <CloseIcon className="h-4 w-4" />
            )
          ) : (
            index + 1
          )}
        </span>
        <p className="pt-1 text-[15.5px] font-semibold leading-7 text-ink">{question.question}</p>
      </div>

      <div className="mt-4 grid gap-2">
        {question.options.map((opt, o) => {
          const isSelected = selected === o;
          const isCorrect = question.answerIndex === o;
          let cls = 'border-line bg-surface hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-soft';
          if (submitted) {
            if (isCorrect) cls = 'border-success bg-success-soft';
            else if (isSelected) cls = 'border-danger bg-danger-soft';
            else cls = 'border-line bg-surface opacity-55';
          } else if (isSelected) {
            cls = 'border-accent bg-accent/[0.07] shadow-soft';
          }
          return (
            <button
              key={o}
              type="button"
              disabled={submitted}
              onClick={() => onSelect(o)}
              className={[
                'ring-focus flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-all duration-200 disabled:cursor-default',
                cls,
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-black transition-colors',
                  submitted && isCorrect
                    ? 'bg-success text-white'
                    : submitted && isSelected
                      ? 'bg-danger text-white'
                      : isSelected
                        ? 'bg-accent text-canvas'
                        : 'bg-canvas text-faint ring-1 ring-line',
                ].join(' ')}
              >
                {submitted && isCorrect ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : submitted && isSelected ? (
                  <CloseIcon className="h-3.5 w-3.5" />
                ) : (
                  String.fromCharCode(65 + o)
                )}
              </span>
              <span className="leading-6 text-ink/90">{opt}</span>
            </button>
          );
        })}
      </div>

      {submitted && (
        <div className="pop-in mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-canvas px-4 py-3">
          <LightbulbIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-[13.5px] leading-6 text-muted">
            <strong className="font-semibold text-ink">Why: </strong>
            {question.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

function gradeAll(questions: QuizQuestion[], answers: Record<number, number>): number {
  return questions.reduce((n, q, i) => (answers[i] === q.answerIndex ? n + 1 : n), 0);
}

function ModuleQuiz({
  moduleIndex,
  moduleTitle,
  questions,
  alreadyPassed,
  onPassed,
  onBackToOverview,
}: {
  moduleIndex: number;
  moduleTitle: string;
  questions: QuizQuestion[];
  alreadyPassed: boolean;
  onPassed: () => void;
  onBackToOverview: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const total = questions.length;
  const score = gradeAll(questions, answers);
  const passed = score / total >= PASS_THRESHOLD;
  const allAnswered = Object.keys(answers).length === total;

  function submit() {
    setSubmitted(true);
    if (score / total >= PASS_THRESHOLD) onPassed();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function retake() {
    setAnswers({});
    setSubmitted(false);
  }

  const answeredCount = Object.keys(answers).length;
  const percent = Math.round((score / Math.max(total, 1)) * 100);

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl">
      <div className="flex items-center gap-2 text-xs font-medium text-faint">
        <button onClick={onBackToOverview} className="u-link text-accent">
          Module {moduleIndex + 1}
        </button>
        <span>/</span>
        <span className="truncate">{moduleTitle}</span>
      </div>

      {/* ── Hero: question card before submit, scorecard after ─────────── */}
      {!submitted ? (
        <div className="arena mt-3 rounded-3xl p-6 sm:p-8" style={{ ['--ch']: 'var(--color-ch-quiz)' } as CSSProperties}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="ch-soft ch-text inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">
                <QuizIcon className="h-3.5 w-3.5" />
                Module quiz
              </span>
              <h1 className="display mt-4 text-[2rem] text-ink sm:text-[2.5rem]">Check your understanding</h1>
              <p className="mt-2.5 max-w-xl text-[15px] leading-7 text-muted">
                {total} questions · {Math.round(PASS_THRESHOLD * 100)}% to pass.
                {alreadyPassed && ' You’ve already passed this one, retake it any time.'}
              </p>
            </div>
            <ScoreRing value={answeredCount / Math.max(total, 1)} size={92} stroke={8} color="var(--color-ch-quiz)">
              <span className="text-center">
                <span className="block text-xl font-black leading-none text-ink">{answeredCount}</span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-faint">of {total}</span>
              </span>
            </ScoreRing>
          </div>

          <div className="mt-6 flex gap-1.5">
            {questions.map((_, i) => (
              <span
                key={i}
                className={[
                  'h-1.5 flex-1 rounded-full transition-colors duration-300',
                  answers[i] !== undefined ? 'bg-accent' : 'bg-line',
                ].join(' ')}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          className={[
            'relative mt-3 overflow-hidden rounded-3xl border p-7 sm:p-9',
            passed ? 'border-success/40 bg-success-soft' : 'border-warn/40 bg-warn-soft',
          ].join(' ')}
        >
          {passed && <Confetti seed={score * 31 + total} />}
          <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
            <ScoreRing
              value={score / Math.max(total, 1)}
              size={116}
              stroke={10}
              color={passed ? 'var(--color-success)' : 'var(--color-warn)'}
            >
              <span className="text-center">
                <span className={['block text-2xl font-black leading-none', passed ? 'text-success' : 'text-warn'].join(' ')}>
                  {percent}%
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-faint">
                  {score}/{total}
                </span>
              </span>
            </ScoreRing>
            <div>
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white',
                  passed ? 'bg-success' : 'bg-warn',
                ].join(' ')}
              >
                {passed ? <CheckIcon className="h-3.5 w-3.5" /> : <AlertTriangleIcon className="h-3.5 w-3.5" />}
                {passed ? 'Passed' : 'Not yet'}
              </span>
              <h1 className="display mt-3 text-[1.9rem] text-ink sm:text-[2.3rem]">
                {percent === 100 ? 'Perfect score' : passed ? 'Module cleared' : 'Close, go again'}
              </h1>
              <p className="mt-2 max-w-lg text-[15px] leading-7 text-muted">
                {passed
                  ? 'The explanations below show why each answer works, worth a skim before you move on.'
                  : `You need ${Math.round(PASS_THRESHOLD * 100)}% to pass. Read the explanations below, then retake it.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3.5">
        {questions.map((q, i) => (
          <QuestionBlock
            key={i}
            index={i}
            question={q}
            selected={answers[i]}
            submitted={submitted}
            onSelect={(o) => setAnswers((prev) => ({ ...prev, [i]: o }))}
          />
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {!submitted ? (
          <button
            onClick={submit}
            disabled={!allAnswered}
            className="glow-accent press ring-focus inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-bold text-canvas transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <CheckIcon className="h-4 w-4" />
            {allAnswered ? 'Check answers' : `Answer all ${total} questions`}
          </button>
        ) : (
          <button
            onClick={retake}
            className="press ring-focus inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:border-accent/40"
          >
            <RefreshIcon className="h-4 w-4" />
            Retake quiz
          </button>
        )}
        <button onClick={onBackToOverview} className="u-link text-sm font-semibold text-muted hover:text-ink">
          Back to overview
        </button>
      </div>
    </div>
  );
}

function FinalExam({
  course,
  questions,
  certId,
  classId,
  examLocked = false,
  onCertified,
  onBackToOverview,
}: {
  course: EnrichedCourse;
  questions: ReturnType<typeof buildExam>;
  certId: string | null;
  classId?: string;
  examLocked?: boolean;
  onCertified: (id: string) => void;
  onBackToOverview: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localCert, setLocalCert] = useState<string | null>(certId);

  const total = questions.length;
  const score = gradeAll(questions, answers);
  const passed = score / total >= PASS_THRESHOLD;
  const allAnswered = Object.keys(answers).length === total;

  function submit() {
    setSubmitted(true);
    if (classId) {
      fetch(`/api/classes/${classId}/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /* Per-question answers ride along so the professor can see which
           questions are broken, not just what the class averaged. */
        body: JSON.stringify({
          score,
          total,
          responses: questions.map((q, i) => ({
            qIndex: i,
            prompt: q.question,
            chosen: answers[i] ?? -1,
            correctIndex: q.answerIndex,
          })),
        }),
      }).catch(() => {
        /* best-effort */
      });
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function retake() {
    setAnswers({});
    setSubmitted(false);
    setError(null);
  }

  async function claim(e: FormEvent) {
    e.preventDefault();
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.title,
          courseTitle: course.title,
          recipient: name.trim(),
          score,
          total,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Could not issue certificate.');
      setLocalCert(data.id);
      onCertified(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue certificate.');
    } finally {
      setClaiming(false);
    }
  }

  if (examLocked) {
    return (
      <div className="animate-fade-in-up mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-medium text-faint">
          <span className="text-accent">Certification</span>
          <span>•</span>
          <span>{course.title}</span>
        </div>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          <AwardIcon className="h-6 w-6 text-accent" />
          Final exam
        </h1>
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-accent">
            <AwardIcon className="h-7 w-7" />
          </span>
          <div>
            <p className="text-lg font-semibold text-ink">Your instructor hasn’t opened the exam yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              The final exam unlocks when your professor opens it. Keep working through the lessons, you’ll be able to
              take it the moment it’s released.
            </p>
          </div>
          <button
            onClick={onBackToOverview}
            className="press ring-focus rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-accent/40"
          >
            Back to overview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl">
      <div className="flex items-center gap-2 text-xs font-medium text-faint">
        <span className="text-accent">Certification</span>
        <span>•</span>
        <span>{course.title}</span>
      </div>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        <AwardIcon className="h-6 w-6 text-accent" />
        Final exam
      </h1>
      <p className="mt-2 text-muted">
        {total} questions drawn from across the course. Score {Math.round(PASS_THRESHOLD * 100)}% or higher to earn your
        certificate.
      </p>

      {/* Already have a certificate */}
      {localCert && (
        <div className="shadow-soft mt-6 flex flex-col gap-4 rounded-2xl border border-green-500/40 bg-green-500/10 p-6 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-500/20 text-green-600">
            <AwardIcon className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-ink">Certificate issued 🎉</h2>
            <p className="mt-0.5 text-sm text-muted">Your certificate of completion is ready to view, print, or share.</p>
          </div>
          <a
            href={`/certificate/${localCert}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas transition-transform hover:scale-[1.03]"
          >
            View certificate
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        </div>
      )}

      {/* Result banner */}
      {submitted && !localCert && (
        <div
          className={[
            'relative mt-5 overflow-hidden rounded-3xl border p-6 sm:p-7',
            passed ? 'border-success/40 bg-success-soft' : 'border-warn/40 bg-warn-soft',
          ].join(' ')}
        >
          {passed && <Confetti seed={score * 17 + total} />}
          <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <ScoreRing
              value={score / Math.max(total, 1)}
              size={104}
              stroke={9}
              color={passed ? 'var(--color-success)' : 'var(--color-warn)'}
            >
              <span className="text-center">
                <span
                  className={['block text-xl font-black leading-none', passed ? 'text-success' : 'text-warn'].join(' ')}
                >
                  {Math.round((score / total) * 100)}%
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-faint">
                  {score}/{total}
                </span>
              </span>
            </ScoreRing>
            <div>
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white',
                  passed ? 'bg-success' : 'bg-warn',
                ].join(' ')}
              >
                {passed ? <AwardIcon className="h-3.5 w-3.5" /> : <AlertTriangleIcon className="h-3.5 w-3.5" />}
                {passed ? 'Certified' : 'Not yet'}
              </span>
              <h2 className="display mt-3 text-2xl text-ink sm:text-3xl">
                {passed ? 'You passed the final exam' : 'Almost there'}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted">
                {passed
                  ? 'Add the name you want printed and claim your certificate.'
                  : `You need ${Math.round(PASS_THRESHOLD * 100)}%, review the explanations below and retake it.`}
              </p>
            </div>
          </div>

          {passed && (
            <form onSubmit={claim} className="relative mt-5 border-t border-success/20 pt-5">
              <label htmlFor="cert-name" className="text-sm font-medium text-ink">
                Name for your certificate
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="cert-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={claiming || !name.trim()}
                  className="glow-accent inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-canvas transition-all hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
                >
                  {claiming ? 'Issuing…' : 'Claim certificate'}
                  <AwardIcon className="h-4 w-4" />
                </button>
              </div>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </form>
          )}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {questions.map((q, i) => (
          <div key={i}>
            <p className="mb-1.5 pl-1 text-[11px] font-medium uppercase tracking-wider text-faint">
              From: {q.moduleTitle}
            </p>
            <QuestionBlock
              index={i}
              question={q}
              selected={answers[i]}
              submitted={submitted}
              onSelect={(o) => setAnswers((prev) => ({ ...prev, [i]: o }))}
            />
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {!submitted ? (
          <button
            onClick={submit}
            disabled={!allAnswered}
            className="glow-accent inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <AwardIcon className="h-4 w-4" />
            Submit exam
          </button>
        ) : (
          !localCert && (
            <button
              onClick={retake}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-accent/40"
            >
              Retake exam
            </button>
          )
        )}
        <button onClick={onBackToOverview} className="text-sm font-medium text-muted hover:text-ink">
          Back to overview
        </button>
      </div>
    </div>
  );
}

/* ── AI Tutor slide-over ────────────────────────────────────────────────── */

function VideoBlock({ video }: { video: VideoInfo }) {
  return (
    <div className="mt-5">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={video.embedUrl}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
            <PlayIcon className="h-2.5 w-2.5" />
            Best-match video
          </span>
          <p className="truncate text-sm font-medium text-ink/90">{video.title}</p>
          <p className="truncate text-xs text-faint">
            {video.channel}
            {video.durationSeconds > 0 && ` · ${formatDuration(video.durationSeconds)}`}
            {video.views > 0 && ` · ${formatViews(video.views)} views`}
          </p>
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:text-accent"
        >
          YouTube
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function lessonMinutes(lesson: EnrichedLesson): number {
  const text = `${lesson.intro} ${lesson.sections.map((s) => s.body).join(' ')} ${lesson.keyPoints.join(' ')}`;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 180));
}

function lessonDuration(lesson: EnrichedLesson): string {
  if (lesson.video && lesson.video.durationSeconds > 0) return formatDuration(lesson.video.durationSeconds);
  return `${lessonMinutes(lesson)} min`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}
