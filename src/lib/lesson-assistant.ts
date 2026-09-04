import { generateObject, generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { fastModel } from './ai';
import { CARE_RULES, CHAT_CONTENT_RULES, screenChatMessage } from './guardrails';
import { SPEC_INSTRUCTIONS, validateSpec, visualizationSpecSchema, type VisualizationSpec } from './visualization-spec';
import type { EnrichedCourse } from './course-schema';

/**
 * The single lesson assistant.
 *
 * This replaces two separate assistants that had grown up beside each other:
 * a course-level chat that could edit content but had no idea which lesson you
 * were reading, and a lesson tutor that knew the lesson but could not change
 * anything or draw anything. A learner had to know which box to type into, and
 * neither box could answer half the questions.
 *
 * One assistant, one context. It always knows where the reader is, and it can
 * explain, generate practice, visualise, or edit from that same place.
 *
 * ## Context discipline
 *
 * The old course chat sent an outline of the entire course on every request and
 * then called tools to fetch lesson bodies. That is the right instinct applied
 * at the wrong level: the assistant almost always needs *this* lesson in full
 * and *its neighbours* in summary. So the prompt carries the current lesson
 * verbatim, the surrounding lessons as titles, and nothing else — and reaches
 * for the rest only when the learner's question actually leaves the page.
 */

export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

/** Exactly where the reader is. Assembled by the reader, never by the model. */
export type LessonContext = {
  courseTitle: string;
  moduleIndex: number;
  moduleTitle: string;
  lessonIndex: number;
  lessonTitle: string;
  objective: string;
  intro: string;
  sections: { heading: string; body: string }[];
  keyPoints: string[];
  /** Heading of the section currently scrolled into view, when known. */
  activeSection?: string;
  /** Titles of the other lessons in this module, in order. */
  siblingLessons: string[];
  /** The module quiz as it stands, so new questions do not repeat it. */
  existingQuiz: string[];
  /** The lesson immediately before this one, for "as we saw earlier" questions. */
  previousLessonTitle?: string;
  progress: { lessonsDone: number; lessonsTotal: number };
};

export type QuizQ = { question: string; options: string[]; answerIndex: number; explanation: string };

export type AssistantAction =
  | { kind: 'answer' }
  | { kind: 'visual'; spec: VisualizationSpec }
  | { kind: 'edit'; sectionIndex: number; heading: string; body: string }
  /** Questions added to the module's real quiz, once the author approves. */
  | { kind: 'quiz'; moduleIndex: number; moduleTitle: string; questions: QuizQ[] }
  /** Lesson-level edits that are not section bodies. */
  | { kind: 'lessonMeta'; title?: string; objective?: string; keyPoints?: string[] }
  /** Throwaway questions for self-testing. Never written into the course. */
  | { kind: 'practice'; questions: QuizQ[] };

export type AssistantResult = {
  reply: string;
  actions: AssistantAction[];
  /** Populated when the request was refused by the guardrail layer. */
  refused?: boolean;
};

const MAX_STEPS = 6;
const MAX_OUTPUT_TOKENS = 900;
/** Enough history for a follow-up to make sense, short enough to stay cheap. */
const HISTORY_TURNS = 10;

/* ── Prompt ──────────────────────────────────────────────────────────────── */

function buildSystem(ctx: LessonContext, canEdit: boolean, care: boolean): string {
  const sections = ctx.sections.map((s, i) => `[${i}] ${s.heading}\n${s.body}`).join('\n\n');
  const siblings = ctx.siblingLessons.length > 0 ? ctx.siblingLessons.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(none)';

  return `You are the MeritFlow learning assistant. You help one learner with the lesson they are reading right now.

## Where the learner is
Course: ${ctx.courseTitle}
Module ${ctx.moduleIndex + 1}: ${ctx.moduleTitle}
Lesson ${ctx.lessonIndex + 1}: ${ctx.lessonTitle}
${ctx.activeSection ? `Currently reading section: ${ctx.activeSection}` : ''}
${ctx.previousLessonTitle ? `Previous lesson: ${ctx.previousLessonTitle}` : ''}
Progress: ${ctx.progress.lessonsDone} of ${ctx.progress.lessonsTotal} lessons done.

Other lessons in this module:
${siblings}

## The lesson, in full
Objective: ${ctx.objective}

${ctx.intro}

${sections}

Key points:
${ctx.keyPoints.map((k) => `- ${k}`).join('\n')}

## How to answer
- The learner is on this page. Never ask them which lesson or topic they mean — you already know.
- Ground answers in the lesson text above. When you go beyond it, say so plainly.
- Match the depth asked for: "simpler" means shorter sentences and a concrete example, not baby talk; "deeper" means mechanism and edge cases, not more words.
- Be direct. No preamble, no restating the question.
- Prose and short lists. Markdown is fine; keep it light.

## Your tools
- draw_visual — when a diagram, chart or map would explain something better than a sentence. Not for decoration.
- make_practice — when the learner asks to be tested, or asks for practice.
${
    canEdit
      ? `- rewrite_section — change one section of the lesson (simplify, expand, shorten, add an example).
- edit_lesson — change the lesson title, its objective, or its key points.
- add_quiz_questions — add real questions to this module's graded quiz. Use this when the author asks for more quiz questions, not make_practice.

You are the only place the author edits from. If they ask to change anything in the lesson, the course, or the quiz, do it with these tools rather than telling them where to click. Every change is shown to them for approval before it lands.`
      : `- You cannot change this lesson or its quiz. If asked, say it belongs to the course author and offer an explanation instead.`
  }

${CHAT_CONTENT_RULES}

${care ? CARE_RULES : ''}`;
}

/* ── Tools ───────────────────────────────────────────────────────────────── */

type Sink = { actions: AssistantAction[] };

function tools(ctx: LessonContext, canEdit: boolean, sink: Sink) {
  const base = {
    draw_visual: tool({
      description:
        'Create an interactive visualization when it explains something better than prose would. Describe what should be shown; the specification is generated and validated separately.',
      inputSchema: z.object({
        intent: z.string().describe('What the visual must make clear, in one sentence.'),
      }),
      execute: async ({ intent }) => {
        const spec = await planVisual(ctx, intent);
        if (!spec) return 'Could not build a valid visualization for that. Explain it in prose instead.';
        sink.actions.push({ kind: 'visual', spec });
        return `A ${spec.type} visualization titled "${spec.title}" is now shown to the learner. Refer to it; do not describe it in full.`;
      },
    }),

    make_practice: tool({
      description: 'Generate practice questions on this lesson so the learner can check their understanding.',
      inputSchema: z.object({
        count: z.number().int().min(1).max(5).describe('How many questions.'),
        focus: z.string().max(200).describe('Which idea to test.'),
      }),
      execute: async ({ count, focus }) => {
        const questions = await makePractice(ctx, count, focus);
        if (questions.length === 0) return 'Could not generate questions. Offer to explain the concept instead.';
        sink.actions.push({ kind: 'practice', questions });
        return `${questions.length} practice questions are now shown. Do not repeat them in your reply.`;
      },
    }),
  };

  if (!canEdit) return base;

  return {
    ...base,
    rewrite_section: tool({
      description:
        'Rewrite one section of the lesson. Only for explicit requests to change the lesson content itself.',
      inputSchema: z.object({
        sectionIndex: z.number().int().min(0).describe('Index of the section, from the lesson above.'),
        instruction: z.string().max(300).describe('What to change: simplify, expand, shorten, add an example.'),
      }),
      execute: async ({ sectionIndex, instruction }) => {
        const section = ctx.sections[sectionIndex];
        if (!section) return `There is no section ${sectionIndex}. Sections run 0 to ${ctx.sections.length - 1}.`;
        const rewritten = await rewriteSection(ctx, section, instruction);
        if (!rewritten) return 'Could not rewrite that section.';
        sink.actions.push({ kind: 'edit', sectionIndex, heading: section.heading, body: rewritten });
        return `Section "${section.heading}" has been rewritten and is shown to the learner for approval. Summarise what changed in one sentence.`;
      },
    }),

    edit_lesson: tool({
      description:
        "Change the lesson's title, objective, or key points. For section bodies use rewrite_section instead.",
      inputSchema: z.object({
        title: z.string().max(120).optional().describe('New lesson title. Omit to leave unchanged.'),
        objective: z.string().max(400).optional().describe('New one-sentence objective. Omit to leave unchanged.'),
        keyPoints: z
          .array(z.string().max(200))
          .min(3)
          .max(6)
          .optional()
          .describe('Replacement key points. Omit to leave unchanged.'),
      }),
      execute: async ({ title, objective, keyPoints }) => {
        if (!title && !objective && !keyPoints) return 'Nothing to change. Say which part of the lesson to edit.';
        sink.actions.push({ kind: 'lessonMeta', title, objective, keyPoints });
        return 'The lesson change is shown to the author for approval. Say in one sentence what you changed.';
      },
    }),

    add_quiz_questions: tool({
      description:
        "Add questions to this module's graded quiz. Use when the author asks for more quiz questions. These become part of the course, unlike make_practice.",
      inputSchema: z.object({
        count: z.number().int().min(1).max(5).describe('How many questions to add.'),
        focus: z.string().max(200).describe('What the new questions should test.'),
      }),
      execute: async ({ count, focus }) => {
        /* Existing questions go into the prompt so additions extend the quiz
           rather than restating it in different words. */
        const questions = await makeQuizQuestions(ctx, count, focus);
        if (questions.length === 0) return 'Could not write questions for that. Offer to try a narrower focus.';
        sink.actions.push({
          kind: 'quiz',
          moduleIndex: ctx.moduleIndex,
          moduleTitle: ctx.moduleTitle,
          questions,
        });
        return `${questions.length} quiz questions are shown to the author for approval. Do not repeat them in your reply.`;
      },
    }),
  };
}

/* ── Sub-calls ───────────────────────────────────────────────────────────── */

/**
 * Plan a visualization, then validate it — retrying once with the validator's
 * complaints fed back.
 *
 * One retry, not a loop: if a second attempt with explicit errors still fails,
 * the model has misunderstood the request rather than fumbled the format, and
 * a third try burns tokens to produce the same thing.
 */
async function planVisual(ctx: LessonContext, intent: string): Promise<VisualizationSpec | null> {
  const context = `Lesson: ${ctx.lessonTitle}\nObjective: ${ctx.objective}\n\n${ctx.sections
    .map((s) => `${s.heading}: ${s.body}`)
    .join('\n\n')
    .slice(0, 6000)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { object } = await generateObject({
        model: fastModel(),
        schema: visualizationSpecSchema,
        maxOutputTokens: 1600,
        system: SPEC_INSTRUCTIONS,
        prompt:
          attempt === 0
            ? `${context}\n\nBuild a visualization that makes this clear: ${intent}`
            : `${context}\n\nYour previous specification was rejected. Build a valid one for: ${intent}`,
      });
      const result = validateSpec(object);
      if (result.ok) return result.spec;
    } catch {
      /* Fall through to the retry, then give up quietly — a failed visual must
         never take down the answer it was meant to illustrate. */
    }
  }
  return null;
}

const practiceSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(8),
        options: z.array(z.string().min(1)).length(4),
        answerIndex: z.number().int().min(0).max(3),
        explanation: z.string().min(8),
      }),
    )
    .min(1)
    .max(5),
});

async function makePractice(ctx: LessonContext, count: number, focus: string) {
  try {
    const { object } = await generateObject({
      model: fastModel(),
      schema: practiceSchema,
      maxOutputTokens: 1600,
      system:
        'You write practice questions that check understanding, not recall of wording. Every distractor must be a plausible misunderstanding, never filler. Answer only from the lesson provided.',
      prompt: `Lesson: ${ctx.lessonTitle}\n\n${ctx.sections.map((s) => `${s.heading}: ${s.body}`).join('\n\n').slice(0, 6000)}\n\nWrite ${count} questions focused on: ${focus}`,
    });
    return object.questions;
  } catch {
    return [];
  }
}

/**
 * Questions destined for the graded quiz.
 *
 * Separate from `makePractice` because the bar is different: practice is
 * disposable and scoped to one lesson, whereas these are marked, feed the
 * certification exam, and must not duplicate what the quiz already asks.
 */
async function makeQuizQuestions(ctx: LessonContext, count: number, focus: string): Promise<QuizQ[]> {
  try {
    const existing =
      ctx.existingQuiz.length > 0
        ? `\n\nThe quiz already asks these. Do not repeat or reword them:\n${ctx.existingQuiz.map((q) => `- ${q}`).join('\n')}`
        : '';

    const { object } = await generateObject({
      model: fastModel(),
      schema: practiceSchema,
      maxOutputTokens: 1600,
      system:
        'You write graded quiz questions for a course module. Each question checks understanding rather than recall of wording, ' +
        'and every wrong option is a plausible misunderstanding rather than filler. Answer only from the lesson provided.',
      prompt: `Module: ${ctx.moduleTitle}\nLesson: ${ctx.lessonTitle}\n\n${ctx.sections
        .map((s) => `${s.heading}: ${s.body}`)
        .join('\n\n')
        .slice(0, 6000)}${existing}\n\nWrite ${count} new questions focused on: ${focus}`,
    });
    return object.questions;
  } catch {
    return [];
  }
}

async function rewriteSection(ctx: LessonContext, section: { heading: string; body: string }, instruction: string) {
  try {
    const { text } = await generateText({
      model: fastModel(),
      maxOutputTokens: 1400,
      system:
        'You rewrite one section of a lesson. Return only the new body text — no heading, no preamble, no markdown fences. Keep the teaching voice of the original.',
      prompt: `Lesson: ${ctx.lessonTitle}\nSection heading: ${section.heading}\n\nCurrent body:\n${section.body}\n\nRewrite it: ${instruction}`,
    });
    const clean = text.trim();
    return clean.length > 40 ? clean : null;
  } catch {
    return null;
  }
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export async function runLessonAssistant(input: {
  context: LessonContext;
  messages: ChatMessage[];
  canEdit: boolean;
  care?: boolean;
}): Promise<AssistantResult> {
  const { context, messages, canEdit } = input;
  const latest = messages[messages.length - 1];

  /* Screened before the model sees it, and before any tool can run — a blocked
     message must not be able to trigger a visualization or an edit. */
  let care = input.care === true;
  if (latest?.role === 'user') {
    /* The lesson goes to the screener too. Without it, "explain this" is an
       unintelligible fragment; with it, it is a question about a named topic. */
    const verdict = await screenChatMessage(latest.content, `${context.courseTitle} — ${context.lessonTitle}`);
    if (verdict.decision === 'block') {
      /* The classifier's `reason` is written for an operator and reads like a
         system error to a learner. Refusals get their own wording. */
      return {
        reply: 'I cannot help with that one. Ask me anything about this lesson and I will pick it up from here.',
        actions: [],
        refused: true,
      };
    }
    if (verdict.decision === 'allow_with_care') care = true;
  }

  const sink: Sink = { actions: [] };

  const { text } = await generateText({
    model: fastModel(),
    system: buildSystem(context, canEdit, care),
    messages: messages.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: String(m.content ?? '') })),
    tools: tools(context, canEdit, sink),
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
  });

  return { reply: text.trim(), actions: sink.actions };
}

/** Build the assistant's context from a course and a position inside it. */
export function lessonContextFrom(
  course: EnrichedCourse,
  moduleIndex: number,
  lessonIndex: number,
  progress: { lessonsDone: number; lessonsTotal: number },
  activeSection?: string,
): LessonContext | null {
  const mod = course.modules?.[moduleIndex];
  const lesson = mod?.lessons?.[lessonIndex];
  if (!mod || !lesson) return null;

  /* The previous lesson may live at the end of the previous module — a learner
     asking "what did we just cover" at a module boundary means that one. */
  const prev =
    lessonIndex > 0
      ? mod.lessons[lessonIndex - 1]?.title
      : moduleIndex > 0
        ? course.modules[moduleIndex - 1]?.lessons?.at(-1)?.title
        : undefined;

  return {
    courseTitle: course.title,
    moduleIndex,
    moduleTitle: mod.title,
    lessonIndex,
    lessonTitle: lesson.title,
    objective: lesson.objective ?? '',
    intro: lesson.intro ?? '',
    sections: (lesson.sections ?? []).map((s) => ({ heading: s.heading, body: s.body })),
    keyPoints: lesson.keyPoints ?? [],
    activeSection,
    siblingLessons: (mod.lessons ?? []).map((l) => l.title),
    existingQuiz: (mod.quiz ?? []).map((q) => q.question),
    previousLessonTitle: prev,
    progress,
  };
}
