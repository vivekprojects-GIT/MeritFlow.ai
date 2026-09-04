import { getDb } from './db';

/**
 * Item analysis — which questions are working, and which are broken.
 *
 * A class average tells a professor how the cohort did. It cannot tell them
 * *why*, and the most common cause of a bad average is not a weak cohort but a
 * bad question: a mis-keyed answer, an ambiguous distractor, or something the
 * lesson never actually taught. Psychometrics has measured this for a century
 * with two numbers, and both are cheap to compute here.
 *
 *  - **Difficulty (p-value)** — the share who got it right. Very high is not a
 *    triumph, it is a question that discriminates nothing; very low usually
 *    means the key is wrong or the material is missing.
 *  - **Discrimination (point-biserial-ish)** — do the students who did well
 *    overall also get this one right? A *negative* value is the loudest signal
 *    in assessment: the strongest students are picking a different answer to
 *    the one marked correct, which nearly always means the key is wrong.
 *
 * Both are reported with the sample size, and flags are withheld below a
 * minimum N. With six responses, "40% discrimination" is noise wearing a
 * decimal point, and a professor rewriting a fine question on that basis is a
 * worse outcome than showing nothing.
 */

export type ItemStat = {
  quizKey: string;
  qIndex: number;
  prompt: string;
  responses: number;
  correct: number;
  /** Share correct, 0–100. */
  difficulty: number;
  /**
   * Correct-rate among the top third of scorers minus the bottom third, in
   * points. Null until there are enough responses to split into thirds.
   */
  discrimination: number | null;
  /** The wrong option chosen most often, and how many chose it. */
  topDistractor: { index: number; count: number } | null;
  flag: 'mis-keyed' | 'too-hard' | 'no-signal' | 'ok';
  note: string;
};

export type ItemAnalysis = {
  hasData: boolean;
  items: ItemStat[];
  /** Items worth a professor's attention, worst first. */
  flagged: ItemStat[];
  responders: number;
};

/** Below this many responses per item, every statistic is noise. */
const MIN_RESPONSES = 5;
/** Below this many responders, thirds are too small to compare. */
const MIN_FOR_DISCRIMINATION = 9;

export async function itemAnalysis(classId: string): Promise<ItemAnalysis> {
  const db = await getDb();

  const res = await db.query<{
    student_id: string;
    quiz_key: string;
    q_index: number;
    prompt: string;
    chosen: number;
    correct_idx: number;
  }>(
    `SELECT student_id, quiz_key, q_index, prompt, chosen, correct_idx
       FROM quiz_responses
      WHERE class_id = $1`,
    [classId],
  );

  const rows = res.rows;
  if (rows.length === 0) return { hasData: false, items: [], flagged: [], responders: 0 };

  /* Each student's overall correct-rate, which is the yardstick discrimination
     is measured against. */
  const perStudent = new Map<string, { right: number; total: number }>();
  for (const r of rows) {
    const s = perStudent.get(r.student_id) ?? { right: 0, total: 0 };
    s.total += 1;
    if (r.chosen === r.correct_idx) s.right += 1;
    perStudent.set(r.student_id, s);
  }

  const ranked = [...perStudent.entries()]
    .map(([id, s]) => ({ id, score: s.total > 0 ? s.right / s.total : 0 }))
    .sort((a, b) => b.score - a.score);

  const third = Math.floor(ranked.length / 3);
  const topIds = new Set(ranked.slice(0, third).map((r) => r.id));
  const bottomIds = new Set(ranked.slice(ranked.length - third).map((r) => r.id));
  const canDiscriminate = ranked.length >= MIN_FOR_DISCRIMINATION && third > 0;

  /* Group responses by question. */
  const byItem = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.quiz_key}#${r.q_index}`;
    const list = byItem.get(key);
    if (list) list.push(r);
    else byItem.set(key, [r]);
  }

  const items: ItemStat[] = [];

  for (const [, group] of byItem) {
    const first = group[0];
    const correct = group.filter((g) => g.chosen === g.correct_idx).length;
    const difficulty = Math.round((correct / group.length) * 100);

    let discrimination: number | null = null;
    if (canDiscriminate) {
      const top = group.filter((g) => topIds.has(g.student_id));
      const bottom = group.filter((g) => bottomIds.has(g.student_id));
      if (top.length > 0 && bottom.length > 0) {
        const topRate = top.filter((g) => g.chosen === g.correct_idx).length / top.length;
        const botRate = bottom.filter((g) => g.chosen === g.correct_idx).length / bottom.length;
        discrimination = Math.round((topRate - botRate) * 100);
      }
    }

    /* Which wrong answer is pulling people — the actionable half of a bad item,
       because it names the misconception to address. */
    const wrongCounts = new Map<number, number>();
    for (const g of group) {
      if (g.chosen !== g.correct_idx) wrongCounts.set(g.chosen, (wrongCounts.get(g.chosen) ?? 0) + 1);
    }
    let topDistractor: ItemStat['topDistractor'] = null;
    for (const [index, count] of wrongCounts) {
      if (!topDistractor || count > topDistractor.count) topDistractor = { index, count };
    }

    let flag: ItemStat['flag'] = 'ok';
    let note = 'Behaving normally.';
    if (group.length < MIN_RESPONSES) {
      flag = 'ok';
      note = `Only ${group.length} ${group.length === 1 ? 'response' : 'responses'} — too few to judge.`;
    } else if (discrimination != null && discrimination < 0) {
      /* The strongest students are avoiding the marked answer. */
      flag = 'mis-keyed';
      note = 'Your strongest students are getting this wrong more often than your weakest — check the answer key.';
    } else if (difficulty <= 25) {
      flag = 'too-hard';
      note = 'Almost nobody got this. Either the key is wrong or the lesson never covered it.';
    } else if (difficulty >= 95) {
      flag = 'no-signal';
      note = 'Everyone got this. It is not telling you anything about who understood the material.';
    }

    items.push({
      quizKey: first.quiz_key,
      qIndex: first.q_index,
      prompt: first.prompt || `Question ${first.q_index + 1}`,
      responses: group.length,
      correct,
      difficulty,
      discrimination,
      topDistractor,
      flag,
      note,
    });
  }

  items.sort((a, b) => a.quizKey.localeCompare(b.quizKey) || a.qIndex - b.qIndex);

  /* Worst first, and only items with enough data to stand behind. */
  const severity = { 'mis-keyed': 0, 'too-hard': 1, 'no-signal': 2, ok: 3 } as const;
  const flagged = items
    .filter((i) => i.flag !== 'ok' && i.responses >= MIN_RESPONSES)
    .sort((a, b) => severity[a.flag] - severity[b.flag] || a.difficulty - b.difficulty);

  return { hasData: true, items, flagged, responders: perStudent.size };
}

/** Persist one attempt's answers. Overwrites on retake — see the table comment. */
export async function recordResponses(
  classId: string,
  studentId: string,
  quizKey: string,
  answers: { qIndex: number; prompt: string; chosen: number; correctIndex: number }[],
): Promise<void> {
  if (answers.length === 0) return;
  const db = await getDb();
  const now = Date.now();
  for (const a of answers) {
    if (!Number.isInteger(a.qIndex) || !Number.isInteger(a.chosen) || !Number.isInteger(a.correctIndex)) continue;
    await db.query(
      `INSERT INTO quiz_responses (class_id, student_id, quiz_key, q_index, prompt, chosen, correct_idx, answered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (class_id, student_id, quiz_key, q_index)
       DO UPDATE SET chosen = EXCLUDED.chosen, answered_at = EXCLUDED.answered_at`,
      [classId, studentId, quizKey, a.qIndex, a.prompt.slice(0, 500), a.chosen, a.correctIndex, now],
    );
  }
}
