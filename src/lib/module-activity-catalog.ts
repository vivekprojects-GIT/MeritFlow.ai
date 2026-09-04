import type { ChallengeGame, Flashcard, MemoryGame, MemoryPair, Module, ModuleActivities, ModuleMindMap } from './course-schema';

/**
 * The activity component registry.
 *
 * Two jobs:
 *  1. Tell the generator (TS or Python backend) exactly what to write for each
 *     interactive component — including the length budgets the UI can actually
 *     render, because a memory tile that holds 42 characters cannot show a
 *     paragraph.
 *  2. Guarantee the reader always gets renderable activities, whether the model
 *     produced them, produced them badly, or skipped them entirely.
 */

export const MODULE_ACTIVITY_REGISTRY = [
  {
    id: 'mindMap',
    label: 'Mind map',
    purpose: 'One central idea with 3-5 concept branches you can explore.',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    purpose: '4-6 recall cards for the terms, rules, and distinctions worth memorising.',
  },
  {
    id: 'memoryGame',
    label: 'Memory match',
    purpose: '4-6 short pairs that connect a concept to its definition, outcome, or example.',
  },
  {
    id: 'challengeGame',
    label: 'Scenario sprint',
    purpose: '2-3 timed decision rounds that make the learner apply the module under pressure.',
  },
] as const;

/** Hard limits the components can render without truncation or overflow. */
export const ACTIVITY_LIMITS = {
  centralIdea: 48,
  branchTitle: 42,
  branchSummary: 150,
  branchPoint: 110,
  cardFront: 110,
  cardBack: 220,
  cardHint: 110,
  memoryPrompt: 44,
  memoryMatch: 84,
  memoryExplanation: 140,
  scenario: 230,
  choice: 120,
  explanation: 180,
} as const;

export function moduleActivityCatalogPrompt(language: string | undefined): string {
  const target = normalizeLanguage(language);
  return [
    'Activity component registry for this module. Each component is rendered by a real UI with',
    'fixed space, so respect the length budgets — text that overflows gets truncated on screen.',
    '',
    `- mindMap: one centralIdea (max ${ACTIVITY_LIMITS.centralIdea} chars) plus 3-5 branches.`,
    `  Branch titles are noun phrases of 2-4 words (max ${ACTIVITY_LIMITS.branchTitle} chars) taken from what the`,
    '  module actually teaches — never generic labels like "Introduction", "Basics", or "Summary".',
    `  Each branch: a one-sentence summary (max ${ACTIVITY_LIMITS.branchSummary} chars) and 2-4 concrete points`,
    `  (max ${ACTIVITY_LIMITS.branchPoint} chars each).`,
    '',
    `- flashcards: 4-6 cards. front = a question or term (max ${ACTIVITY_LIMITS.cardFront} chars).`,
    `  back = the answer a learner should be able to say out loud (max ${ACTIVITY_LIMITS.cardBack} chars).`,
    `  hint = a nudge that narrows the search WITHOUT containing the answer (max ${ACTIVITY_LIMITS.cardHint} chars).`,
    '  Cards must test recall of specific content, not "what is this module about".',
    '',
    `- memoryGame: 4-6 pairs shown as small square tiles. prompt is a term or short phrase`,
    `  (max ${ACTIVITY_LIMITS.memoryPrompt} chars — this is a tight tile, keep it very short).`,
    `  match is its definition, result, or counterpart (max ${ACTIVITY_LIMITS.memoryMatch} chars).`,
    '  Every prompt must be unmistakably distinct from every other prompt, and no match may plausibly',
    '  fit two prompts — the game is unwinnable otherwise. explanation says why the pair belongs together.',
    '',
    `- challengeGame: 2-3 rounds, each a realistic situation someone would actually face`,
    `  (max ${ACTIVITY_LIMITS.scenario} chars), with exactly 3 actions (max ${ACTIVITY_LIMITS.choice} chars each).`,
    '  All three must be tempting to someone who half-understands the module; exactly one is best.',
    '  Never make the wrong choices obviously absurd. explanation states why the best one wins.',
    '',
    `Write every activity in ${target}.`,
    'All content must be specific to THIS module and answerable from the lessons you wrote.',
    'Do not reuse the quiz questions — the activities rehearse the same ideas a different way.',
  ].join('\n');
}

/**
 * Return activities that are always safe to render: generated content when it
 * exists (cleaned and clamped to the UI budgets), derived content otherwise.
 */
export function normalizeModuleActivities(module: Module): ModuleActivities {
  const generated = module.activities;
  return {
    mindMap: buildMindMap(generated?.mindMap, module),
    flashcards: buildFlashcards(generated?.flashcards, module),
    memoryGame: buildMemoryGame(generated?.memoryGame, module),
    challengeGame: buildChallengeGame(generated?.challengeGame, module),
  };
}

/* ── Mind map ──────────────────────────────────────────────────────────── */

function buildMindMap(generated: ModuleMindMap | undefined, module: Module): ModuleMindMap {
  const branches = (generated?.branches ?? [])
    .map((branch) => ({
      title: trimText(clean(branch.title, ''), ACTIVITY_LIMITS.branchTitle),
      summary: trimText(clean(branch.summary, ''), ACTIVITY_LIMITS.branchSummary),
      points: branch.points
        .map((point) => trimText(clean(point, ''), ACTIVITY_LIMITS.branchPoint))
        .filter(Boolean)
        .slice(0, 4),
    }))
    .filter((branch) => branch.title && branch.points.length >= 2);

  if (branches.length >= 3) {
    return {
      centralIdea: trimText(clean(generated?.centralIdea, module.title), ACTIVITY_LIMITS.centralIdea),
      branches: branches.slice(0, 5),
    };
  }

  /* Derive from the lessons: each lesson is already a coherent branch. */
  const lessons = module.lessons ?? [];
  const derived = lessons.slice(0, 5).map((lesson) => ({
    title: trimText(clean(lesson.title, 'Lesson'), ACTIVITY_LIMITS.branchTitle),
    summary: trimText(
      clean(lesson.objective, module.summary || 'A core idea from this module.'),
      ACTIVITY_LIMITS.branchSummary,
    ),
    points: pickPoints(
      [...lesson.keyPoints, ...lesson.sections.map((section) => section.heading)],
      ACTIVITY_LIMITS.branchPoint,
    ),
  }));

  const merged = [...branches, ...derived].filter(uniqueBy((branch) => branch.title.toLowerCase()));
  while (merged.length < 3) {
    merged.push({
      title: ['Core idea', 'In practice', 'Watch out for'][merged.length] ?? 'Review',
      summary: trimText(clean(module.summary, 'Pull the module ideas together.'), ACTIVITY_LIMITS.branchSummary),
      points: pickPoints(
        lessons.flatMap((lesson) => [...lesson.keyPoints, ...lesson.commonMistakes]),
        ACTIVITY_LIMITS.branchPoint,
      ),
    });
  }

  return {
    centralIdea: trimText(clean(module.title, 'Module map'), ACTIVITY_LIMITS.centralIdea),
    branches: merged.slice(0, 5),
  };
}

/* ── Flashcards ────────────────────────────────────────────────────────── */

function buildFlashcards(generated: Flashcard[] | undefined, module: Module): Flashcard[] {
  const cleaned = (generated ?? [])
    .map((card) => ({
      front: trimText(clean(card.front, ''), ACTIVITY_LIMITS.cardFront),
      back: trimText(clean(card.back, ''), ACTIVITY_LIMITS.cardBack),
      hint: trimText(clean(card.hint, 'Think back to the lesson objective.'), ACTIVITY_LIMITS.cardHint),
    }))
    .filter((card) => card.front && card.back)
    .filter(uniqueBy((card) => card.front.toLowerCase()));

  if (cleaned.length >= 4) return cleaned.slice(0, 6);

  const lessons = module.lessons ?? [];
  const derived: Flashcard[] = [
    /* One card per lesson: "what does this let you do?" */
    ...lessons.map((lesson) => ({
      front: trimText(clean(lesson.title, 'Module idea'), ACTIVITY_LIMITS.cardFront),
      back: trimText(
        clean(lesson.objective, module.summary || 'Review this idea from the module.'),
        ACTIVITY_LIMITS.cardBack,
      ),
      hint: trimText(
        clean(lesson.sections[0]?.heading, 'Start from what the lesson set out to teach.'),
        ACTIVITY_LIMITS.cardHint,
      ),
    })),
    /* Then the key points, which are already recall-sized. */
    ...lessons.flatMap((lesson) =>
      lesson.keyPoints.slice(0, 2).map((point) => ({
        front: trimText(`In "${clean(lesson.title, 'this lesson')}", what should you remember?`, ACTIVITY_LIMITS.cardFront),
        back: trimText(clean(point, ''), ACTIVITY_LIMITS.cardBack),
        hint: trimText(clean(lesson.objective, 'Tie it back to the lesson goal.'), ACTIVITY_LIMITS.cardHint),
      })),
    ),
  ].filter((card) => card.back);

  const merged = [...cleaned, ...derived].filter(uniqueBy((card) => `${card.front}|${card.back}`.toLowerCase()));
  while (merged.length < 4) {
    merged.push({
      front: 'Explain this module in one breath',
      back: trimText(clean(module.summary, 'Summarise the module in your own words.'), ACTIVITY_LIMITS.cardBack),
      hint: 'If you can teach it, you know it.',
    });
  }
  return merged.slice(0, 6);
}

/* ── Memory match ──────────────────────────────────────────────────────── */

function buildMemoryGame(generated: MemoryGame | undefined, module: Module): MemoryGame {
  const cleaned = (generated?.pairs ?? [])
    .map((pair) => ({
      prompt: trimText(clean(pair.prompt, ''), ACTIVITY_LIMITS.memoryPrompt),
      match: trimText(firstSentence(clean(pair.match, '')), ACTIVITY_LIMITS.memoryMatch),
      explanation: trimText(clean(pair.explanation, 'These two belong to the same idea.'), ACTIVITY_LIMITS.memoryExplanation),
    }))
    .filter((pair) => pair.prompt && pair.match)
    .filter(uniqueBy((pair) => pair.prompt.toLowerCase()))
    .filter(uniqueBy((pair) => pair.match.toLowerCase()));

  const pairs = cleaned.length >= 4 ? cleaned.slice(0, 6) : mergePairs(cleaned, derivePairs(module));

  return {
    title: trimText(clean(generated?.title, `${clean(module.title, 'Module')} match`), 60),
    instructions: trimText(
      clean(generated?.instructions, 'Flip two tiles to pair each idea with what it means.'),
      120,
    ),
    pairs,
  };
}

/**
 * Derive pairs from lesson structure. Section headings make good prompts
 * (short, distinct); the first sentence of the body makes a good match — the
 * whole body would never fit a tile.
 */
function derivePairs(module: Module): MemoryPair[] {
  const lessons = module.lessons ?? [];
  const fromSections = lessons.flatMap((lesson) =>
    lesson.sections.slice(0, 2).map((section) => ({
      prompt: trimText(clean(section.heading, lesson.title), ACTIVITY_LIMITS.memoryPrompt),
      match: trimText(firstSentence(clean(section.body, lesson.objective)), ACTIVITY_LIMITS.memoryMatch),
      explanation: trimText(
        clean(lesson.objective, module.summary || 'Both come from the same lesson.'),
        ACTIVITY_LIMITS.memoryExplanation,
      ),
    })),
  );

  const fromLessons = lessons.map((lesson) => ({
    prompt: trimText(clean(lesson.title, 'Lesson'), ACTIVITY_LIMITS.memoryPrompt),
    match: trimText(firstSentence(clean(lesson.objective, '')), ACTIVITY_LIMITS.memoryMatch),
    explanation: trimText(clean(lesson.objective, 'This is what the lesson sets out to do.'), ACTIVITY_LIMITS.memoryExplanation),
  }));

  return [...fromSections, ...fromLessons].filter((pair) => pair.prompt && pair.match);
}

function mergePairs(primary: MemoryPair[], extra: MemoryPair[]): MemoryPair[] {
  const merged = [...primary, ...extra]
    .filter(uniqueBy((pair) => pair.prompt.toLowerCase()))
    .filter(uniqueBy((pair) => pair.match.toLowerCase()));
  while (merged.length < 4) {
    const n = merged.length;
    merged.push({
      prompt: `Key idea ${n + 1}`,
      match: `A concept this module asks you to remember (${n + 1}).`,
      explanation: 'Pair each idea with the meaning it carries in this module.',
    });
  }
  return merged.slice(0, 6);
}

/* ── Scenario sprint ───────────────────────────────────────────────────── */

function buildChallengeGame(generated: ChallengeGame | undefined, module: Module): ChallengeGame {
  const cleaned = (generated?.rounds ?? [])
    .map((round) => {
      const choices = round.choices
        .map((choice) => trimText(clean(choice, ''), ACTIVITY_LIMITS.choice))
        .filter(Boolean);
      return {
        scenario: trimText(clean(round.scenario, ''), ACTIVITY_LIMITS.scenario),
        choices,
        answerIndex: Math.min(Math.max(round.answerIndex, 0), Math.max(choices.length - 1, 0)),
        explanation: trimText(clean(round.explanation, 'This choice applies the module correctly.'), ACTIVITY_LIMITS.explanation),
      };
    })
    .filter((round) => round.scenario && round.choices.length === 3);

  const rounds = cleaned.length >= 2 ? cleaned.slice(0, 3) : deriveRounds(module);

  return {
    title: trimText(clean(generated?.title, `${clean(module.title, 'Module')} sprint`), 60),
    premise: trimText(
      clean(generated?.premise, module.summary || 'Apply what you just learned to real decisions.'),
      160,
    ),
    rounds,
  };
}

function deriveRounds(module: Module): ChallengeGame['rounds'] {
  const lessons = module.lessons ?? [];

  /* A lesson's own common mistake is the best distractor we have on hand. */
  const rounds = lessons.slice(0, 3).map((lesson, index) => {
    const correct = trimText(clean(lesson.objective, 'Apply the lesson concept.'), ACTIVITY_LIMITS.choice);
    const mistake = lesson.commonMistakes[0]
      ? trimText(clean(lesson.commonMistakes[0], ''), ACTIVITY_LIMITS.choice)
      : '';
    const otherLesson = lessons.find((_, i) => i !== index);
    const distractors = [mistake, trimText(clean(otherLesson?.objective, ''), ACTIVITY_LIMITS.choice)].filter(Boolean);

    const choices = [correct, ...distractors];
    while (choices.length < 3) {
      choices.push(
        ['Skip ahead and come back to it later.', 'Memorise the terms without applying them.'][choices.length - 1] ??
          'Move on without checking the result.',
      );
    }

    return {
      scenario: trimText(
        `You are putting "${clean(lesson.title, 'this lesson')}" to work on a real task. What should drive your next move?`,
        ACTIVITY_LIMITS.scenario,
      ),
      choices: choices.slice(0, 3),
      answerIndex: 0,
      explanation: trimText(correct, ACTIVITY_LIMITS.explanation),
    };
  });

  while (rounds.length < 2) {
    rounds.push({
      scenario: 'You have finished the module and want to know whether it stuck. What is the best next step?',
      choices: [
        'Explain the main idea out loud and back it with your own example.',
        'Re-read the lesson titles until they feel familiar.',
        'Start the next module and hope it clicks later.',
      ],
      answerIndex: 0,
      explanation: 'Explaining an idea with a fresh example proves you can use it, not just recognise it.',
    });
  }
  return rounds.slice(0, 3);
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function normalizeLanguage(language: string | undefined): string {
  const trimmed = language?.trim();
  return trimmed ? trimmed.slice(0, 80) : 'English';
}

function clean(value: string | undefined, fallback: string): string {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed || fallback;
}

function trimText(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** First sentence of a paragraph — what fits on a game tile. */
function firstSentence(value: string): string {
  const match = value.match(/^(.+?[.!?])(\s|$)/);
  return match ? match[1] : value;
}

function pickPoints(candidates: Array<string | undefined>, max: number): string[] {
  const points = candidates
    .map((item) => clean(item, ''))
    .filter(Boolean)
    .map((item) => trimText(item, max))
    .filter(uniqueBy((item) => item.toLowerCase()));
  while (points.length < 2) points.push('Connect this idea back to the lesson goal.');
  return points.slice(0, 4);
}

function uniqueBy<T>(key: (item: T) => string): (item: T) => boolean {
  const seen = new Set<string>();
  return (item: T) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  };
}
