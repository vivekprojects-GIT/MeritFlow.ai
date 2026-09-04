'use client';

import { useState, type ReactNode } from 'react';
import {
  blankLesson,
  blankModule,
  blankQuestion,
  videoFromYouTubeUrl,
  type EnrichedCourse,
  type EnrichedModule,
  type EnrichedLesson,
  type QuizQuestion,
  type CodeExample,
} from '@/lib/course-schema';
import {
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  LockIcon,
  LockOpenIcon,
  PlayIcon,
  PlusIcon,
  QuizIcon,
  TrashIcon,
} from './icons';

/** A lock/unlock toggle the professor uses to gate a module, lesson, or quiz from students. */
function LockToggle({ locked, onToggle, label }: { locked?: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!!locked}
      title={locked ? `${label} is locked for students, click to unlock` : `Lock this ${label} for students`}
      className={[
        'ring-focus shrink-0 rounded-md p-1.5 transition-colors',
        locked ? 'bg-accent/12 text-accent' : 'text-faint hover:bg-mint hover:text-ink',
      ].join(' ')}
    >
      {locked ? <LockIcon className="h-4 w-4" /> : <LockOpenIcon className="h-4 w-4" />}
    </button>
  );
}

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels'] as const;

const inputCls =
  'ring-focus w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink caret-accent transition-colors placeholder:text-faint focus:border-accent/60 focus:outline-none';

/* ── Small building blocks ────────────────────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={[inputCls, 'resize-y leading-relaxed', mono ? 'font-mono text-[13px]' : ''].join(' ')}
    />
  );
}

function StringList({
  items,
  onChange,
  placeholder,
  addLabel = 'Add',
  textarea = false,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          {textarea ? (
            <textarea
              value={it}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={placeholder}
              rows={2}
              className={[inputCls, 'resize-y leading-relaxed'].join(' ')}
            />
          ) : (
            <input
              value={it}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={placeholder}
              className={inputCls}
            />
          )}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="ring-focus mt-0.5 shrink-0 rounded-lg border border-line p-2 text-faint transition-colors hover:border-red-400/50 hover:text-red-400"
            aria-label="Remove"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="ring-focus inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  );
}

function MoveDelete({
  index,
  total,
  onMove,
  onRemove,
  removeLabel,
}: {
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        className="ring-focus rounded-md p-1.5 text-faint transition-colors hover:bg-mint hover:text-ink disabled:opacity-30"
        aria-label="Move up"
      >
        <ChevronRightIcon className="h-4 w-4 -rotate-90" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        className="ring-focus rounded-md p-1.5 text-faint transition-colors hover:bg-mint hover:text-ink disabled:opacity-30"
        aria-label="Move down"
      >
        <ChevronRightIcon className="h-4 w-4 rotate-90" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="ring-focus rounded-md p-1.5 text-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
        aria-label={removeLabel}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── Quiz editor ──────────────────────────────────────────────────────────── */

function QuizEditor({
  quiz,
  locked,
  onToggleLock,
  onChange,
}: {
  quiz: QuizQuestion[];
  locked?: boolean;
  onToggleLock: () => void;
  onChange: (q: QuizQuestion[]) => void;
}) {
  const set = (i: number, fn: (q: QuizQuestion) => QuizQuestion) =>
    onChange(quiz.map((q, j) => (j === i ? fn(q) : q)));

  return (
    <div className="mt-4 rounded-xl border border-line bg-canvas/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
          <QuizIcon className="h-4 w-4" />
          Module quiz · {quiz.length} {quiz.length === 1 ? 'question' : 'questions'}
          {locked && <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-bold normal-case text-accent">Locked</span>}
        </span>
        <div className="flex items-center gap-1">
          <LockToggle locked={locked} onToggle={onToggleLock} label="quiz" />
          <button
            type="button"
            onClick={() => onChange([...quiz, blankQuestion()])}
            className="ring-focus inline-flex items-center gap-1 rounded-lg bg-mint px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add question
          </button>
        </div>
      </div>

      {quiz.length === 0 ? (
        <p className="mt-3 text-xs text-faint">
          No questions yet. Students need quiz questions for the module check and for the final exam (the exam samples
          up to 2 questions per module).
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {quiz.map((q, qi) => (
            <div key={qi} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-xs font-bold text-accent">Q{qi + 1}</span>
                <textarea
                  value={q.question}
                  onChange={(e) => set(qi, (x) => ({ ...x, question: e.target.value }))}
                  placeholder="Question…"
                  rows={2}
                  className={[inputCls, 'resize-y'].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => onChange(quiz.filter((_, j) => j !== qi))}
                  className="ring-focus mt-0.5 shrink-0 rounded-lg border border-line p-2 text-faint transition-colors hover:border-red-400/50 hover:text-red-400"
                  aria-label="Remove question"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
                Options · tap the circle to mark the correct one
              </p>
              <div className="space-y-1.5">
                {q.options.map((opt, oi) => {
                  const correct = q.answerIndex === oi;
                  return (
                    <div key={oi} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => set(qi, (x) => ({ ...x, answerIndex: oi }))}
                        className={[
                          'ring-focus flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          correct ? 'border-accent bg-accent text-canvas' : 'border-faint/50 text-transparent hover:border-accent/60',
                        ].join(' ')}
                        aria-label={correct ? 'Correct answer' : 'Mark correct'}
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                      </button>
                      <input
                        value={opt}
                        onChange={(e) =>
                          set(qi, (x) => ({ ...x, options: x.options.map((o, j) => (j === oi ? e.target.value : o)) }))
                        }
                        placeholder={`Option ${oi + 1}`}
                        className={[inputCls, correct ? 'border-accent/40' : ''].join(' ')}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-2.5">
                <input
                  value={q.explanation}
                  onChange={(e) => set(qi, (x) => ({ ...x, explanation: e.target.value }))}
                  placeholder="Why the correct answer is right (shown after answering)"
                  className={inputCls}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Lesson card ──────────────────────────────────────────────────────────── */

function LessonCard({
  lesson,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  lesson: EnrichedLesson;
  index: number;
  total: number;
  onChange: (fn: (l: EnrichedLesson) => void) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoErr, setVideoErr] = useState('');

  function setVideo() {
    const v = videoFromYouTubeUrl(videoUrl, lesson.title || 'Lesson video');
    if (!v) {
      setVideoErr('Paste a valid YouTube link (watch, youtu.be, embed, or shorts).');
      return;
    }
    setVideoErr('');
    setVideoUrl('');
    onChange((l) => {
      l.video = v;
      l.needsVideo = true;
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ring-focus rounded-md p-1 text-faint transition-colors hover:text-ink"
          aria-label={open ? 'Collapse lesson' : 'Expand lesson'}
        >
          <ChevronRightIcon className={['h-4 w-4 transition-transform', open ? 'rotate-90' : ''].join(' ')} />
        </button>
        <span className="text-[11px] font-bold text-faint">{index + 1}</span>
        <input
          value={lesson.title}
          onChange={(e) => onChange((l) => void (l.title = e.target.value))}
          placeholder="Lesson title"
          className="ring-focus min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-medium text-ink placeholder:text-faint focus:bg-canvas focus:outline-none"
        />
        {lesson.video && <PlayIcon className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Has video" />}
        <LockToggle locked={lesson.locked} onToggle={() => onChange((l) => void (l.locked = !l.locked))} label="lesson" />
        <MoveDelete index={index} total={total} onMove={onMove} onRemove={onRemove} removeLabel="Remove lesson" />
      </div>

      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <Field label="Objective" hint="One sentence, what the learner can do after this lesson.">
            <input
              value={lesson.objective}
              onChange={(e) => onChange((l) => void (l.objective = e.target.value))}
              placeholder="By the end, the learner can…"
              className={inputCls}
            />
          </Field>

          <Field label="Intro">
            <TextArea value={lesson.intro} onChange={(v) => onChange((l) => void (l.intro = v))} rows={3} placeholder="A short, motivating introduction." />
          </Field>

          {/* Sections */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
              Sections · {lesson.sections.length}
            </span>
            <div className="space-y-2.5">
              {lesson.sections.map((s, si) => (
                <div key={si} className="rounded-lg border border-line bg-canvas/60 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={s.heading}
                      onChange={(e) =>
                        onChange((l) => void (l.sections = l.sections.map((x, j) => (j === si ? { ...x, heading: e.target.value } : x))))
                      }
                      placeholder="Section heading"
                      className={[inputCls, 'font-semibold'].join(' ')}
                    />
                    <button
                      type="button"
                      onClick={() => onChange((l) => void (l.sections = l.sections.filter((_, j) => j !== si)))}
                      className="ring-focus shrink-0 rounded-lg border border-line p-2 text-faint transition-colors hover:border-red-400/50 hover:text-red-400"
                      aria-label="Remove section"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2">
                    <TextArea
                      value={s.body}
                      onChange={(v) => onChange((l) => void (l.sections = l.sections.map((x, j) => (j === si ? { ...x, body: v } : x))))}
                      rows={4}
                      placeholder="Teach this subtopic clearly, with a concrete example. Plain prose."
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onChange((l) => void l.sections.push({ heading: '', body: '' }))}
                className="ring-focus inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Add section
              </button>
            </div>
          </div>

          <Field label="Key points">
            <StringList
              items={lesson.keyPoints}
              onChange={(items) => onChange((l) => void (l.keyPoints = items))}
              placeholder="An important takeaway"
              addLabel="Add key point"
            />
          </Field>

          <Field label="Common mistakes" hint="Optional, misconceptions to flag.">
            <StringList
              items={lesson.commonMistakes}
              onChange={(items) => onChange((l) => void (l.commonMistakes = items))}
              placeholder="A common mistake or misconception"
              addLabel="Add mistake"
            />
          </Field>

          <Field label="Practice" hint="Optional, one concrete exercise to apply the lesson.">
            <TextArea value={lesson.practice} onChange={(v) => onChange((l) => void (l.practice = v))} rows={2} placeholder="Try this…" />
          </Field>

          {/* Code examples */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
              Code examples · {lesson.codeExamples.length} <span className="normal-case text-faint/70">(technical lessons only)</span>
            </span>
            <div className="space-y-2.5">
              {lesson.codeExamples.map((c, ci) => (
                <div key={ci} className="rounded-lg border border-line bg-canvas/60 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={c.language}
                      onChange={(e) => onChange((l) => void (l.codeExamples = l.codeExamples.map((x, j) => (j === ci ? { ...x, language: e.target.value } : x))))}
                      placeholder="language (e.g. python)"
                      className={[inputCls, 'max-w-[180px]'].join(' ')}
                    />
                    <button
                      type="button"
                      onClick={() => onChange((l) => void (l.codeExamples = l.codeExamples.filter((_, j) => j !== ci)))}
                      className="ring-focus ml-auto shrink-0 rounded-lg border border-line p-2 text-faint transition-colors hover:border-red-400/50 hover:text-red-400"
                      aria-label="Remove code example"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2">
                    <TextArea
                      value={c.code}
                      onChange={(v) => onChange((l) => void (l.codeExamples = l.codeExamples.map((x, j) => (j === ci ? { ...x, code: v } : x))))}
                      rows={4}
                      mono
                      placeholder="// snippet"
                    />
                  </div>
                  <div className="mt-2">
                    <input
                      value={c.caption}
                      onChange={(e) => onChange((l) => void (l.codeExamples = l.codeExamples.map((x, j) => (j === ci ? { ...x, caption: e.target.value } : x))))}
                      placeholder="One line explaining the snippet"
                      className={inputCls}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onChange((l) => void l.codeExamples.push({ language: 'python', code: '', caption: '' } as CodeExample))}
                className="ring-focus inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Add code example
              </button>
            </div>
          </div>

          {/* Video */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">Lesson video</span>
            {lesson.video ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas/60 p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lesson.video.thumbnail} alt="" className="h-12 w-20 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <input
                    value={lesson.video.title}
                    onChange={(e) => onChange((l) => void (l.video && (l.video.title = e.target.value)))}
                    className="ring-focus w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-medium text-ink focus:bg-canvas focus:outline-none"
                  />
                  <a href={lesson.video.url} target="_blank" rel="noreferrer" className="u-link block truncate text-[11px] text-faint">
                    {lesson.video.url}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => onChange((l) => void ((l.video = null), (l.needsVideo = false)))}
                  className="ring-focus shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-red-400/50 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setVideo())}
                    placeholder="Paste a YouTube link…"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={setVideo}
                    className="press ring-focus shrink-0 rounded-lg bg-mint px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
                  >
                    Set video
                  </button>
                </div>
                {videoErr && <p className="mt-1 text-[11px] text-red-400">{videoErr}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Module card ──────────────────────────────────────────────────────────── */

function ModuleCard({
  module,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  module: EnrichedModule;
  index: number;
  total: number;
  onChange: (fn: (m: EnrichedModule) => void) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const lessonCount = module.lessons.length;

  function moveLesson(li: number, dir: -1 | 1) {
    const to = li + dir;
    if (to < 0 || to >= module.lessons.length) return;
    onChange((m) => {
      const [item] = m.lessons.splice(li, 1);
      m.lessons.splice(to, 0, item);
    });
  }

  return (
    <div className="card-edit rounded-2xl p-0">
      <div className="flex items-center gap-2 p-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ring-focus rounded-md p-1 text-muted transition-colors hover:text-ink"
          aria-label={open ? 'Collapse module' : 'Expand module'}
        >
          <ChevronRightIcon className={['h-5 w-5 transition-transform', open ? 'rotate-90' : ''].join(' ')} />
        </button>
        <span className="rounded-md bg-mint px-2 py-0.5 text-[11px] font-bold text-accent">M{index + 1}</span>
        <input
          value={module.title}
          onChange={(e) => onChange((m) => void (m.title = e.target.value))}
          placeholder="Module title"
          className="ring-focus min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 font-semibold text-ink placeholder:text-faint focus:bg-canvas focus:outline-none"
        />
        <span className="hidden shrink-0 text-[11px] text-faint sm:inline">
          {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'} · {module.quiz.length} Q
        </span>
        {module.locked && (
          <span className="hidden shrink-0 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-bold text-accent sm:inline">
            Locked
          </span>
        )}
        <LockToggle locked={module.locked} onToggle={() => onChange((m) => void (m.locked = !m.locked))} label="module" />
        <MoveDelete index={index} total={total} onMove={onMove} onRemove={onRemove} removeLabel="Remove module" />
      </div>

      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <Field label="Module summary">
            <TextArea value={module.summary} onChange={(v) => onChange((m) => void (m.summary = v))} rows={2} placeholder="One or two sentences on what this module covers." />
          </Field>

          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-faint">Lessons</span>
            <div className="space-y-2.5">
              {module.lessons.map((lesson, li) => (
                <LessonCard
                  key={li}
                  lesson={lesson}
                  index={li}
                  total={module.lessons.length}
                  onChange={(fn) => onChange((m) => fn(m.lessons[li]))}
                  onMove={(dir) => moveLesson(li, dir)}
                  onRemove={() =>
                    onChange((m) => {
                      if (m.lessons.length > 1) m.lessons.splice(li, 1);
                    })
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => onChange((m) => void m.lessons.push(blankLesson()))}
                className="ring-focus inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                <PlusIcon className="h-4 w-4" /> Add lesson
              </button>
            </div>
          </div>

          <QuizEditor
            quiz={module.quiz}
            locked={module.quizLocked}
            onToggleLock={() => onChange((m) => void (m.quizLocked = !m.quizLocked))}
            onChange={(q) => onChange((m) => void (m.quiz = q))}
          />
        </div>
      )}
    </div>
  );
}

/* ── Main editor ──────────────────────────────────────────────────────────── */

export function CourseEditor({
  classId,
  initialCourse,
  onClose,
  onSaved,
}: {
  classId: string;
  initialCourse: EnrichedCourse;
  onClose: () => void;
  onSaved: (course: EnrichedCourse) => void;
}) {
  const [course, setCourse] = useState<EnrichedCourse>(initialCourse);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(mutator: (c: EnrichedCourse) => void) {
    setCourse((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      return next;
    });
    setDirty(true);
    setSaved(false);
  }

  function moveModule(mi: number, dir: -1 | 1) {
    const to = mi + dir;
    if (to < 0 || to >= course.modules.length) return;
    update((c) => {
      const [item] = c.modules.splice(mi, 1);
      c.modules.splice(to, 0, item);
    });
  }

  const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const totalQuestions = course.modules.reduce((n, m) => n + m.quiz.length, 0);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/course`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not save.');
      setDirty(false);
      setSaved(true);
      onSaved(course);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={close}
            className="ring-focus rounded-lg p-2 text-faint transition-colors hover:bg-mint hover:text-ink"
            aria-label="Close editor"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{course.title || 'Untitled course'}</p>
            <p className="text-[11px] text-faint">
              {course.modules.length} modules · {totalLessons} lessons · {totalQuestions} quiz questions
            </p>
          </div>
          {error && <span className="hidden max-w-[200px] truncate text-xs text-red-400 sm:inline">{error}</span>}
          {!error && saved && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
              <CheckIcon className="h-4 w-4" /> Saved
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="press ring-focus inline-flex items-center gap-1.5 rounded-lg bg-accent-fill px-4 py-2 text-sm font-semibold text-canvas elev-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </header>

      {/* Scroll body */}
      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Course basics */}
          <section className="card-edit rounded-2xl p-5">
            <span className="eyebrow">Course details</span>
            <div className="mt-4 space-y-4">
              <Field label="Title">
                <input value={course.title} onChange={(e) => update((c) => void (c.title = e.target.value))} placeholder="Course title" className={[inputCls, 'text-base font-semibold'].join(' ')} />
              </Field>
              <Field label="Subtitle">
                <input value={course.subtitle} onChange={(e) => update((c) => void (c.subtitle = e.target.value))} placeholder="A one-line tagline" className={inputCls} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <Field label="Level">
                  <select
                    value={course.level}
                    onChange={(e) => update((c) => void (c.level = e.target.value as EnrichedCourse['level']))}
                    className={inputCls}
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Est. hours">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={course.estimatedHours}
                    onChange={(e) => update((c) => void (c.estimatedHours = Number(e.target.value) || 0))}
                    className={[inputCls, 'w-28'].join(' ')}
                  />
                </Field>
              </div>
              <Field label="Description">
                <TextArea value={course.description} onChange={(v) => update((c) => void (c.description = v))} rows={3} placeholder="2–3 sentences on the course and who it's for." />
              </Field>
              <Field label="What learners will be able to do" hint="Concrete outcomes.">
                <StringList items={course.outcomes} onChange={(items) => update((c) => void (c.outcomes = items))} placeholder="A concrete outcome" addLabel="Add outcome" />
              </Field>
              <Field label="Prerequisites" hint="Optional.">
                <StringList items={course.prerequisites} onChange={(items) => update((c) => void (c.prerequisites = items))} placeholder="What to know beforehand" addLabel="Add prerequisite" />
              </Field>
            </div>
          </section>

          {/* Modules */}
          <div className="mt-7 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Curriculum</h2>
            <span className="text-xs text-faint">{course.modules.length} modules</span>
          </div>
          <div className="mt-3 space-y-4">
            {course.modules.map((module, mi) => (
              <ModuleCard
                key={mi}
                module={module}
                index={mi}
                total={course.modules.length}
                onChange={(fn) => update((c) => fn(c.modules[mi]))}
                onMove={(dir) => moveModule(mi, dir)}
                onRemove={() =>
                  update((c) => {
                    if (c.modules.length > 1) c.modules.splice(mi, 1);
                  })
                }
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => update((c) => void c.modules.push(blankModule(c.modules.length + 1)))}
            className="press ring-focus mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-3.5 text-sm font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            <PlusIcon className="h-4 w-4" /> Add module
          </button>

          <div className="h-20" />
        </div>
      </div>
    </div>
  );
}
