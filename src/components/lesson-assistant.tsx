'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpecVisual } from './spec-visual';
import { CloseIcon, SparklesIcon, SendIcon, CheckIcon } from './icons';
import type { AssistantAction, ChatMessage, LessonContext, QuizQ } from '@/lib/lesson-assistant';

/**
 * The lesson assistant panel.
 *
 * One surface for asking and editing. The two used to be separate boxes in
 * separate places, which forced the learner to know which kind of request they
 * were about to make before they had finished thinking of it — and neither box
 * could hand off to the other.
 *
 * Docked rather than floating, and it does not blur or dim the lesson: the
 * whole point is to read the text and the answer together.
 */

type Turn = { role: 'user' | 'assistant'; content: string; actions?: AssistantAction[] };

const SUGGESTIONS = [
  { label: 'Explain simply', prompt: 'Explain this section in simpler terms, with a concrete example.' },
  { label: 'Go deeper', prompt: 'Go deeper on this, the mechanism, and where it breaks down.' },
  { label: 'Show me', prompt: 'Create a visualization that makes this concept clear.' },
  { label: 'Quiz me', prompt: 'Give me 3 practice questions on this lesson.' },
  { label: 'Real example', prompt: 'Give me a real-world example of this.' },
];

/* Shown only to the course author. These are the edits people actually ask
   for, surfaced so it is obvious the assistant can change the course and not
   only talk about it. */
const EDIT_SUGGESTIONS = [
  { label: 'Simplify section', prompt: 'Simplify the section I am reading.' },
  { label: 'Expand section', prompt: 'Expand the section I am reading with more detail and an example.' },
  { label: 'Add quiz questions', prompt: 'Add 3 more questions to this module quiz.' },
  { label: 'Rewrite objective', prompt: 'Rewrite this lesson objective so it is sharper and more concrete.' },
];

export function LessonAssistant({
  context,
  canEdit,
  open,
  onClose,
  onApplyEdit,
  onAddQuiz,
  onEditMeta,
}: {
  context: LessonContext;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
  /** Called when the learner accepts a rewrite. The reader owns the course state. */
  onApplyEdit?: (sectionIndex: number, body: string) => void;
  /** Called when the author accepts new questions for the module quiz. */
  onAddQuiz?: (moduleIndex: number, questions: QuizQ[]) => void;
  /** Called when the author accepts a title, objective or key-point change. */
  onEditMeta?: (patch: { title?: string; objective?: string; keyPoints?: string[] }) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Conversation resets when the learner moves to a different lesson — carrying
     a thread about photosynthesis into a lesson on recursion helps nobody.
     This is React's documented "adjust state when a prop changes" pattern:
     state rather than a ref, because a ref mutated during render is not
     tracked and the reset would be lost on a re-render. */
  const lessonKey = `${context.moduleIndex}:${context.lessonIndex}`;
  const [seenLesson, setSeenLesson] = useState(lessonKey);
  if (seenLesson !== lessonKey) {
    setSeenLesson(lessonKey);
    setTurns([]);
    setError(null);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /**
   * Keep the newest turn in view.
   *
   * This used to call `scrollIntoView` on a sentinel at the bottom. That scrolls
   * the *nearest scrollable ancestor*, which is the lesson page, not this panel
   * — so the page jumped and the panel stayed where it was, leaving the answer
   * below the fold and the reader scrolling by hand after every send.
   *
   * Setting `scrollTop` on the panel's own container cannot pick the wrong
   * element. Two frames because the reply mounts markdown, practice questions
   * and visuals whose height is not known on the first paint.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      raf2 = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [turns, busy]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const next: Turn[] = [...turns, { role: 'user', content }];
      setTurns(next);
      setInput('');
      setBusy(true);
      setError(null);

      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context,
            canEdit,
            messages: next.map<ChatMessage>((t) => ({ role: t.role, content: t.content })),
          }),
        });
        const data = (await res.json()) as {
          reply?: string;
          actions?: AssistantAction[];
          remaining?: number | null;
          error?: string;
        };

        if (!res.ok) {
          setError(data.error ?? 'The assistant could not answer that.');
          return;
        }
        if (typeof data.remaining === 'number') setRemaining(data.remaining);
        setTurns([...next, { role: 'assistant', content: data.reply ?? '', actions: data.actions ?? [] }]);
      } catch {
        setError('Could not reach the assistant. Check your connection and try again.');
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, context, canEdit],
  );

  if (!open) return null;

  const suggestions = canEdit ? [...SUGGESTIONS, ...EDIT_SUGGESTIONS] : SUGGESTIONS;

  return (
    <aside
      aria-label="Lesson assistant"
      className="flex h-full w-full flex-col border-l border-line bg-canvas"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <SparklesIcon className="h-4 w-4 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">Assistant</p>
          {/* Names the lesson so it is obvious the assistant already has it. */}
          <p className="truncate text-[11px] text-muted">{context.lessonTitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          className="rounded-lg p-1.5 text-muted transition hover:bg-elevated hover:text-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {turns.length === 0 && (
          <div className="text-sm">
            <p className="text-muted">
              Ask anything about <span className="font-semibold text-ink">{context.lessonTitle}</span>. I already have
              the lesson open, no need to paste it.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void send(s.prompt)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-ink"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {turns.map((t, i) => (
            <div key={i}>
              {t.role === 'user' ? (
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent/12 px-3.5 py-2 text-sm text-ink">
                  {t.content}
                </p>
              ) : (
                <div className="space-y-3">
                  {t.content && <Markdown text={t.content} />}
                  {t.actions?.map((a, ai) => (
                    <ActionView key={ai} action={a} onApplyEdit={onApplyEdit} onAddQuiz={onAddQuiz} onEditMeta={onEditMeta} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <p role="status" aria-live="polite" className="text-sm text-muted">
              Thinking…
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-canvas p-2 focus-within:border-accent">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask about this lesson…"
            aria-label="Message the assistant"
            className="max-h-32 min-h-[1.75rem] flex-1 resize-none bg-transparent px-1.5 text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-fill text-canvas transition disabled:opacity-40"
          >
            <SendIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        {remaining != null && (
          <p className="mt-1.5 text-[11px] text-faint">{remaining} free questions left today.</p>
        )}
      </div>
    </aside>
  );
}

/* ── Actions ─────────────────────────────────────────────────────────────── */

function ActionView({
  action,
  onApplyEdit,
  onAddQuiz,
  onEditMeta,
}: {
  action: AssistantAction;
  onApplyEdit?: (sectionIndex: number, body: string) => void;
  onAddQuiz?: (moduleIndex: number, questions: QuizQ[]) => void;
  onEditMeta?: (patch: { title?: string; objective?: string; keyPoints?: string[] }) => void;
}) {
  const [applied, setApplied] = useState(false);

  if (action.kind === 'visual') return <SpecVisual spec={action.spec} />;

  if (action.kind === 'practice') return <Practice questions={action.questions} />;

  if (action.kind === 'quiz') {
    return (
      <Proposal
        label={`Add to the ${action.moduleTitle} quiz`}
        applied={applied}
        canApply={Boolean(onAddQuiz)}
        applyLabel={`Add ${action.questions.length} to quiz`}
        onApply={() => {
          onAddQuiz?.(action.moduleIndex, action.questions);
          setApplied(true);
        }}
      >
        <ol className="space-y-2.5">
          {action.questions.map((q, i) => (
            <li key={i}>
              <p className="text-sm font-medium text-ink">
                {i + 1}. {q.question}
              </p>
              <ul className="mt-1 space-y-0.5">
                {q.options.map((o, oi) => (
                  <li
                    key={oi}
                    className={`text-xs ${oi === q.answerIndex ? 'font-semibold text-success' : 'text-muted'}`}
                  >
                    {oi === q.answerIndex ? '✓ ' : '· '}
                    {o}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Proposal>
    );
  }

  if (action.kind === 'lessonMeta') {
    return (
      <Proposal
        label="Lesson change"
        applied={applied}
        canApply={Boolean(onEditMeta)}
        applyLabel="Apply to lesson"
        onApply={() => {
          onEditMeta?.({ title: action.title, objective: action.objective, keyPoints: action.keyPoints });
          setApplied(true);
        }}
      >
        {action.title && (
          <p className="text-sm text-ink">
            <span className="text-faint">Title: </span>
            {action.title}
          </p>
        )}
        {action.objective && (
          <p className="mt-1 text-sm text-ink">
            <span className="text-faint">Objective: </span>
            {action.objective}
          </p>
        )}
        {action.keyPoints && (
          <ul className="mt-1 space-y-0.5">
            {action.keyPoints.map((k, i) => (
              <li key={i} className="text-sm text-ink">
                · {k}
              </li>
            ))}
          </ul>
        )}
      </Proposal>
    );
  }

  if (action.kind === 'edit') {
    return (
      <Proposal
        label={`Rewrite · ${action.heading}`}
        applied={applied}
        canApply={Boolean(onApplyEdit)}
        applyLabel="Apply to lesson"
        onApply={() => {
          onApplyEdit?.(action.sectionIndex, action.body);
          setApplied(true);
        }}
      >
        <p className="whitespace-pre-wrap text-sm text-ink">{action.body}</p>
      </Proposal>
    );
  }

  return null;
}

/**
 * A change the assistant is proposing.
 *
 * Proposed, never applied silently. The author approves their own content, and
 * an edit that lands without consent is indistinguishable from a bug.
 */
function Proposal({
  label,
  applied,
  canApply,
  applyLabel,
  onApply,
  children,
}: {
  label: string;
  applied: boolean;
  canApply: boolean;
  applyLabel: string;
  onApply: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-accent/30 bg-mint p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-accent">{label}</p>
      <div className="mt-2">{children}</div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={applied || !canApply}
          onClick={onApply}
          className="rounded-full bg-accent-fill px-3.5 py-1.5 text-xs font-semibold text-canvas disabled:opacity-50"
        >
          {applied ? 'Applied' : applyLabel}
        </button>
        {applied && <CheckIcon className="h-4 w-4 text-success" />}
      </div>
    </div>
  );
}

function Practice({
  questions,
}: {
  questions: { question: string; options: string[]; answerIndex: number; explanation: string }[];
}) {
  const [picked, setPicked] = useState<Record<number, number>>({});

  return (
    <div className="space-y-3 rounded-2xl border border-line p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-faint">Practice</p>
      {questions.map((q, qi) => {
        const choice = picked[qi];
        const answered = choice != null;
        return (
          <div key={qi}>
            <p className="text-sm font-medium text-ink">
              {qi + 1}. {q.question}
            </p>
            <ul className="mt-1.5 space-y-1">
              {q.options.map((o, oi) => {
                const right = oi === q.answerIndex;
                const chosen = choice === oi;
                return (
                  <li key={oi}>
                    <button
                      type="button"
                      disabled={answered}
                      onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                        !answered
                          ? 'border-line hover:border-accent/40'
                          : right
                            ? 'border-success/40 bg-success-soft font-semibold text-ink'
                            : chosen
                              ? 'border-danger/40 bg-danger-soft text-ink'
                              : 'border-line text-muted'
                      }`}
                    >
                      {o}
                    </button>
                  </li>
                );
              })}
            </ul>
            {answered && <p className="mt-1.5 text-xs text-muted">{q.explanation}</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Minimal markdown ────────────────────────────────────────────────────── */

/**
 * Bold, inline code, and bullets — the only markdown the assistant is told to
 * emit. A full parser would be a dependency and an XSS surface for three
 * constructs, so this splits and renders as React rather than injecting HTML.
 */
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink">
      {lines.map((line, i) => {
        const bullet = /^\s*[-*]\s+/.test(line);
        const content = bullet ? line.replace(/^\s*[-*]\s+/, '') : line;
        if (!content.trim()) return null;
        return (
          <p key={i} className={bullet ? 'flex gap-2 pl-1' : ''}>
            {bullet && <span aria-hidden className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-faint" />}
            <span>{inline(content)}</span>
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-elevated px-1 py-0.5 font-mono text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
