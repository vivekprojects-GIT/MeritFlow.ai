import { z } from 'zod';

/**
 * The shape of a generated course. This schema is handed to the LLM via
 * `generateObject`, so every `.describe()` doubles as an instruction to the model.
 */

export const codeExampleSchema = z.object({
  language: z.string().describe('Language identifier, e.g. "python", "javascript", "bash", "sql".'),
  code: z.string().describe('A short, correct, self-contained snippet (no surrounding prose).'),
  caption: z.string().describe('One line explaining what the snippet demonstrates.'),
});

export const lessonSectionSchema = z.object({
  heading: z.string().describe('A short, specific subheading for this part of the lesson.'),
  body: z
    .string()
    .describe(
      'THREE TO FIVE FULL PARAGRAPHS (roughly 250-450 words) that teach this subtopic the way a good textbook does. ' +
        'Follow this arc: state the idea plainly; explain why it works and why it matters; work through ONE concrete ' +
        'example in detail, with real numbers, real names, or real code, showing the reasoning step by step; then ' +
        'address the case where a learner typically goes wrong, or the limit of the idea. ' +
        'Write flowing, connected prose that a reader can follow start to finish, never a list of assertions, ' +
        'never a summary of what could be said. Separate paragraphs with a blank line. ' +
        'Keep most sentences under 20 words; split any sentence that runs past 25. ' +
        'No markdown for emphasis, headings, or lists. The one exception: wrap code in a fenced block ' +
        'with its language (```python), real line breaks preserved, then ``` on its own line.',
    ),

  /* Optional on read, required at generation.
   *
   * The Python generator makes both mandatory so a section cannot ship without
   * them. Here they are optional because every course already in the library
   * predates the change, and a required field would fail validation on all of
   * them — turning a content improvement into an outage. */
  example: z
    .string()
    .optional()
    .describe(
      'ONE concrete worked example for this subtopic (40-120 words) with real numbers, a named ' +
        'situation, or real code, showing the reasoning step by step.',
    ),
  pitfall: z
    .string()
    .optional()
    .describe(
      'The mistake a learner actually makes here, or where the idea stops holding (30-80 words). ' +
        'What it looks like, and what to do instead.',
    ),
});

export const lessonSchema = z.object({
  title: z.string().describe('Short, specific lesson title.'),
  objective: z
    .string()
    .describe('One sentence: what the learner will be able to do after this lesson.'),
  intro: z
    .string()
    .describe(
      'TWO TO THREE PARAGRAPHS (150-250 words) opening the lesson: the concrete situation or question that makes ' +
        'this worth learning, why it matters to the reader, and what they will be able to do by the end. ' +
        'Open with something specific — a scenario, a problem, a surprising fact — not a definition. Plain prose.',
    ),
  sections: z
    .array(lessonSectionSchema)
    .min(3)
    .max(6)
    .describe(
      'The body of the lesson as 3-6 substantial sections taught in a logical order, each building on the last. ' +
        'This is a textbook chapter, not a summary: the whole lesson should read as 900-2000 words of real teaching. ' +
        'Every section must teach a distinct idea in depth — if a section could be one sentence, merge it into another.',
    ),
  keyPoints: z.array(z.string()).min(3).max(6).describe('The most important things to remember.'),
  codeExamples: z
    .array(codeExampleSchema)
    .describe('Code snippets for technical lessons only. Use an empty array for non-technical lessons.'),
  commonMistakes: z
    .array(z.string())
    .describe('Two to four common mistakes or misconceptions for this topic. Empty array if none are relevant.'),
  practice: z
    .string()
    .describe(
      'One concrete exercise or challenge the learner can try to apply the lesson, in one or two sentences. ' +
        'Empty string if a practice task does not fit.',
    ),
  needsVideo: z
    .boolean()
    .describe(
      'True ONLY when watching something demonstrated would clearly help (hands-on technique, visual or spatial ' +
        'topics, software walkthroughs, step-by-step demos). False for purely conceptual reading.',
    ),
  videoQuery: z
    .string()
    .describe(
      'When needsVideo is true, a TIGHT, specific YouTube search for a single-topic tutorial about EXACTLY this ' +
        'lesson (e.g. "python for loops tutorial", "color theory for UI design"). Never a broad "full course". ' +
        'Empty string when needsVideo is false.',
    ),
});

export const quizQuestionSchema = z.object({
  question: z.string().describe('A clear question that checks understanding of this module.'),
  options: z
    .array(z.string())
    .length(4)
    .describe('Exactly four answer choices. Exactly one is correct; the others are plausible distractors.'),
  answerIndex: z.number().int().min(0).max(3).describe('Index (0-3) of the correct option.'),
  explanation: z.string().describe('One sentence explaining why the correct answer is right.'),
});

export const moduleMindMapBranchSchema = z.object({
  title: z.string().describe('A concise branch label, ideally 2-5 words.'),
  summary: z.string().describe('One sentence explaining how this branch fits the module.'),
  points: z.array(z.string()).min(2).max(4).describe('Short sub-points for this branch.'),
});

export const moduleMindMapSchema = z.object({
  centralIdea: z.string().describe('The central idea that ties the module together.'),
  branches: z
    .array(moduleMindMapBranchSchema)
    .min(3)
    .max(5)
    .describe('The main conceptual branches for the module mind map.'),
});

export const flashcardSchema = z.object({
  front: z.string().describe('A short prompt, concept, term, or scenario shown on the front of the card.'),
  back: z.string().describe('The answer or explanation revealed on the back of the card.'),
  hint: z.string().describe('A brief clue that helps without giving away the answer.'),
});

export const memoryPairSchema = z.object({
  prompt: z.string().describe('The concept, term, step, or scenario half of a memory-match pair.'),
  match: z.string().describe('The matching definition, purpose, outcome, or counterpart.'),
  explanation: z.string().describe('One sentence explaining why the two belong together.'),
});

export const memoryGameSchema = z.object({
  title: z.string().describe('A short title for the module memory game.'),
  instructions: z.string().describe('One short learner-facing instruction for matching the pairs.'),
  pairs: z.array(memoryPairSchema).min(4).max(6).describe('Topic-specific match pairs for this module.'),
});

export const challengeRoundSchema = z.object({
  scenario: z.string().describe('A realistic scenario or decision point based on this module.'),
  choices: z.array(z.string()).length(3).describe('Exactly three possible actions or answers.'),
  answerIndex: z.number().int().min(0).max(2).describe('Index (0-2) of the best choice.'),
  explanation: z.string().describe('One sentence explaining the best choice.'),
});

export const challengeGameSchema = z.object({
  title: z.string().describe('A short title for a unique scenario-based practice game.'),
  premise: z.string().describe('One sentence setting up the game context.'),
  rounds: z
    .array(challengeRoundSchema)
    .min(2)
    .max(3)
    .describe('Short scenario rounds that apply module knowledge in context.'),
});

export const moduleActivitiesSchema = z.object({
  mindMap: moduleMindMapSchema.describe('Generated content for the module-level mind map component.'),
  flashcards: z.array(flashcardSchema).min(4).max(6).describe('Spaced-recall flashcards for the module.'),
  memoryGame: memoryGameSchema.describe('Generated content for the memory-match component.'),
  challengeGame: challengeGameSchema.describe('Generated content for the unique scenario game component.'),
});

export const moduleSchema = z.object({
  title: z.string().describe('Module title.'),
  summary: z.string().describe('One or two sentences on what this module covers.'),
  lessons: z.array(lessonSchema).min(2).max(6),
  quiz: z
    .array(quizQuestionSchema)
    .min(3)
    .max(4)
    .describe(
        'A short multiple-choice quiz (3-4 questions) checking the key ideas of THIS module. ' +
        'Questions must be answerable from the module content, not trick questions.',
    ),
  activities: moduleActivitiesSchema
    .nullish()
    .describe('Interactive module practice components generated from the activity component registry.'),
});

export const courseSchema = z.object({
  title: z.string().describe('A compelling, specific course title.'),
  subtitle: z.string().describe('A one-line tagline for the course.'),
  description: z.string().describe('A 2-3 sentence description of the course and who it is for.'),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All levels']),
  estimatedHours: z.number().describe('Rough total hours to complete the course.'),
  prerequisites: z.array(z.string()).describe('What to know beforehand. Empty array if none.'),
  outcomes: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe('Concrete things the learner will be able to do by the end.'),
  modules: z.array(moduleSchema).min(3).max(7),
});

export type CodeExample = z.infer<typeof codeExampleSchema>;
export type LessonSection = z.infer<typeof lessonSectionSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type ModuleMindMapBranch = z.infer<typeof moduleMindMapBranchSchema>;
export type ModuleMindMap = z.infer<typeof moduleMindMapSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type MemoryPair = z.infer<typeof memoryPairSchema>;
export type MemoryGame = z.infer<typeof memoryGameSchema>;
export type ChallengeRound = z.infer<typeof challengeRoundSchema>;
export type ChallengeGame = z.infer<typeof challengeGameSchema>;
export type ModuleActivities = z.infer<typeof moduleActivitiesSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Module = z.infer<typeof moduleSchema>;
export type Course = z.infer<typeof courseSchema>;

/** Pass mark for module quizzes and the final certification exam. */
export const PASS_THRESHOLD = 0.7;

/** An exam question tagged with the module it came from. */
export type ExamQuestion = QuizQuestion & { moduleIndex: number; moduleTitle: string };

/**
 * Assemble a certification exam from the per-module quizzes. We sample a couple of
 * questions per module so the exam covers the whole course, capped so it stays a
 * reasonable length. Pure data — no AI call, so grading the exam costs nothing.
 */
export function buildExam(course: { modules: { title: string; quiz?: QuizQuestion[] }[] }): ExamQuestion[] {
  const perModule = 2;
  const exam: ExamQuestion[] = [];
  course.modules.forEach((mod, moduleIndex) => {
    (mod.quiz ?? []).slice(0, perModule).forEach((q) =>
      exam.push({ ...q, moduleIndex, moduleTitle: mod.title }),
    );
  });
  return exam;
}

/** True when a course has enough quiz questions to issue a certificate. */
export function courseHasExam(course: { modules: { title: string; quiz?: QuizQuestion[] }[] }): boolean {
  return buildExam(course).length >= 4;
}

/** A ranked YouTube match attached to a lesson after generation. */
export type VideoInfo = {
  id: string;
  title: string;
  channel: string;
  url: string;
  embedUrl: string;
  thumbnail: string;
  durationSeconds: number;
  views: number;
  publishedAt: string;
};

/**
 * `locked` / `quizLocked` are professor-controlled access gates on a CLASS's copy of
 * the course (drip release). Optional, so generated/library courses are unaffected
 * (undefined = unlocked). A locked module gates all its lessons + quiz.
 */
export type EnrichedLesson = Lesson & { video: VideoInfo | null; locked?: boolean };
export type EnrichedModule = Omit<Module, 'lessons'> & {
  lessons: EnrichedLesson[];
  locked?: boolean;
  quizLocked?: boolean;
};
export type EnrichedCourse = Omit<Course, 'modules'> & { modules: EnrichedModule[] };

/* ── Lock helpers (a locked module cascades to its lessons + quiz) ──────────── */
export function isModuleLocked(course: EnrichedCourse, m: number): boolean {
  return !!course.modules[m]?.locked;
}
export function isLessonLocked(course: EnrichedCourse, m: number, l: number): boolean {
  const mod = course.modules[m];
  return !!mod?.locked || !!mod?.lessons[l]?.locked;
}
export function isQuizLocked(course: EnrichedCourse, m: number): boolean {
  const mod = course.modules[m];
  return !!mod?.locked || !!mod?.quizLocked;
}

/* ── Authoring helpers ────────────────────────────────────────────────────
 * Used by the instructor course editor to add blank items and to start a
 * course from scratch. Pure data — no AI call, so they cost nothing.
 */

export function blankLesson(): EnrichedLesson {
  return {
    title: '',
    objective: '',
    intro: '',
    sections: [{ heading: '', body: '' }],
    keyPoints: [''],
    codeExamples: [],
    commonMistakes: [],
    practice: '',
    needsVideo: false,
    videoQuery: '',
    video: null,
  };
}

export function blankModule(n = 1): EnrichedModule {
  return { title: `Module ${n}`, summary: '', lessons: [blankLesson()], quiz: [] };
}

export function blankQuestion(): QuizQuestion {
  return { question: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' };
}

export function makeBlankCourse(): EnrichedCourse {
  return {
    title: 'Untitled course',
    subtitle: '',
    description: '',
    level: 'All levels',
    estimatedHours: 1,
    prerequisites: [],
    outcomes: [],
    modules: [blankModule(1)],
  };
}

/** Extract an 11-character YouTube id from any common URL shape (or a bare id). */
export function youTubeIdFromUrl(input: string): string | null {
  const url = input.trim();
  if (/^[\w-]{11}$/.test(url)) return url;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Build a {@link VideoInfo} from a pasted YouTube link, with no API call.
 * Returns null when the URL isn't a recognizable YouTube video.
 */
export function videoFromYouTubeUrl(input: string, title = 'Lesson video'): VideoInfo | null {
  const id = youTubeIdFromUrl(input);
  if (!id) return null;
  return {
    id,
    title: title.trim() || 'Lesson video',
    channel: '',
    url: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds: 0,
    views: 0,
    publishedAt: '',
  };
}
