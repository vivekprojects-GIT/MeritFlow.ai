import { generateObject } from 'ai';
import { z } from 'zod';
import { getDb } from '../db';
import { fastModel, hasAiKey } from '../ai';
import { INTENT_CATALOG, canonicalize, learnedKey, type QuestionClass } from './answer-vault';
import { classifyQuestion } from './question-class';
import { checkCompatibility, isHighRisk, scopesYearsToSubject, subjectYearsIntent } from './intent-compat';

/**
 * Which known question is this employer asking?
 *
 * ## Why the regex registry stopped being enough
 *
 * Every intent started as a pattern, and every new employer wording broke one.
 * "Current company" worked; "the name of your current (or most recent) company"
 * did not. "Are you authorized to work" worked; "are you *currently* authorized
 * to work" did not. Ten of those were fixed by hand in one session, each fix
 * covering exactly one phrasing, and there are tens of thousands of forms.
 *
 * Matching wording is a language problem and belongs to a model. So the model
 * gets it — under a constraint that keeps the safety property intact.
 *
 * ## The model routes; it never answers
 *
 * It is given the question and a closed list of intent names, and must return
 * one of them or nothing. It never sees a value, never produces one, and cannot
 * invent an intent that does not exist — the schema is an enum over the
 * catalogue. The **answer** still comes from the vault, exactly as before, and
 * an intent with no stored answer is still an interruption.
 *
 * ## A wrong routing is not harmless, so it is checked
 *
 * It would be comfortable to say the worst case is "fills the wrong stored
 * fact". It is not. "Will you require sponsorship?" routed to
 * WORK_AUTH.AUTHORIZED answers Yes where the truth is No -- both stored, both
 * verified, both a bare Yes or No, opposite meanings, every downstream check
 * passing.
 *
 * So every routing passes `checkCompatibility` first: the question is
 * classified again by deterministic rules the model never sees, and the two
 * must agree about what family of question it is. The model proposes; a regex
 * disposes. High-risk intents need an exact family match, not a compatible one.
 *
 * ## Consent never comes here
 *
 * Anything the deterministic classifier reads as consent is routed to the
 * authorization vault before this runs. Whether software may agree to something
 * on a person's behalf is not a question to delegate to a language model.
 *
 * ## Each wording is classified once
 *
 * The result is written to `question_routes`, so a phrasing costs one model call
 * ever and is deterministic from then on. The table is readable and correctable
 * — a bad routing is a row to delete, not a prompt to tune.
 */

export type Routing = {
  intent: string | null;
  /** `pattern` cost nothing, `model` cost one call, `cache` cost nothing again. */
  via: 'pattern' | 'cache' | 'model' | 'none';
  sensitivity: QuestionClass | null;
};

/** Normalised so trivially different wordings share one cached routing. */
function routeKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/\(\s*required\s*\)|\*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 200);
}

async function cached(userId: string, key: string): Promise<Routing | null> {
  const db = await getDb();
  const res = await db.query<{ intent: string }>(
    'SELECT intent FROM question_routes WHERE user_id = $1 AND route_key = $2',
    [userId, key],
  );
  const row = res.rows[0];
  if (!row) return null;

  const intent = String(row.intent);
  /* An empty intent is a cached refusal — the model was asked and said none.
     Worth remembering, or every form re-asks the same unanswerable question. */
  if (!intent) return { intent: null, via: 'cache', sensitivity: null };

  return { intent, via: 'cache', sensitivity: INTENT_CATALOG.find((i) => i.intent === intent)?.sensitivity ?? null };
}

async function remember(userId: string, key: string, question: string, intent: string | null): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO question_routes (user_id, route_key, question, intent, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, route_key) DO UPDATE SET intent = EXCLUDED.intent`,
    [userId, key, question.slice(0, 300), intent ?? '', Date.now()],
  );
}

/**
 * Route one question to a known intent.
 *
 * Order is cheapest-and-most-certain first: an exact pattern, then a cached
 * decision, then the model. Every step can decline, and declining is a normal
 * outcome that sends the question to the candidate.
 */
export async function routeQuestion(
  userId: string,
  question: string,
  kind = 'text',
): Promise<Routing> {
  const q = question.trim();
  if (!q) return { intent: null, via: 'none', sensitivity: null };

  /* Consent is never routed by a model. */
  if (classifyQuestion(q, kind).kind === 'CONSENT_ATTESTATION') {
    return { intent: null, via: 'none', sensitivity: 'LEGAL_ATTESTATION' };
  }

  /*
   * "Years with X" goes to X's own entry, not the career total.
   *
   * Ahead of the pattern table because the general patterns would otherwise
   * claim it, and ahead of the model because the model reliably maps both
   * questions onto the same intent — they differ only by a subject it has no
   * reason to treat as significant.
   *
   * If nothing has recorded a duration for that subject the lookup simply
   * misses, and the question goes unanswered. That is the intended outcome:
   * the alternative is answering "how long have you used Kubernetes" with a
   * number about something else.
   */
  const subject = scopesYearsToSubject(q);
  if (subject) {
    return { intent: subjectYearsIntent(subject), via: 'pattern', sensitivity: 'NORMAL_FACT' };
  }

  const exact = canonicalize(q);
  if (exact) {
    /* Patterns are hand-written and specific, so they are trusted — except for
       the high-risk intents, where a stale pattern is as dangerous as a bad
       routing and the family check costs nothing. */
    /*
     * Every pattern hit is now re-checked, not only the high-risk ones.
     *
     * A hand-written pattern was trusted because it is specific -- and a
     * specific pattern for "current employer" still matched a question about
     * post-employment restrictions, which reached a real employer. The guard is
     * deterministic and local, so running it on every routing costs nothing and
     * removes the category.
     */
    const ok = checkCompatibility(q, exact.intent, kind).ok;
    if (ok) return { intent: exact.intent, via: 'pattern', sensitivity: exact.sensitivity };
    return { intent: null, via: 'none', sensitivity: null };
  }

  const key = routeKey(q);
  const hit = await cached(userId, key);
  /*
   * A cached routing is re-checked, not trusted.
   *
   * The cache is written before a guard exists and read long after. A routing
   * stored when "how many years of design experience" still mapped to the
   * candidate's career total keeps returning that total for ever unless the
   * compatibility rules are applied on the way out as well as on the way in.
   *
   * Cheap: the check is deterministic and local.
   */
  if (hit) {
    if (hit.intent && !checkCompatibility(question, hit.intent, kind).ok) {
      return { intent: null, via: 'cache', sensitivity: null };
    }
    return hit;
  }

  /* A learned answer the candidate typed for this exact wording outranks any
     guess about what it means. */
  const learned = learnedKey(q);

  if (!hasAiKey()) return { intent: null, via: 'none', sensitivity: null };

  const names = INTENT_CATALOG.map((i) => i.intent);

  try {
    const { object } = await generateObject({
      model: fastModel(),
      schema: z.object({
        intent: z
          .enum(names as [string, ...string[]])
          .nullable()
          .describe('The intent this question asks for, or null if none of them fits.'),
      }),
      maxOutputTokens: 200,
      temperature: 0,
      system: [
        'You map a job application question to one of a fixed list of known question types.',
        'Return the single type that asks for the same information, or null.',
        'Return null when unsure, when the question is specific to one employer, or when it asks for a judgement.',
        'You are not answering the question. You never see or produce the answer.',
      ].join(' '),
      prompt: `Question from an application form:\n"${q}"\n\nKnown types:\n${names.join('\n')}`,
    });

    const proposed = object.intent && names.includes(object.intent) ? object.intent : null;

    /*
     * The model proposes; a regex disposes.
     *
     * A routing survives only if the deterministic classifier agrees about what
     * family of question this is. That is what stops "will you require
     * sponsorship?" being answered from WORK_AUTH.AUTHORIZED — same shape, same
     * verified provenance, opposite meaning.
     */
    const compatible = proposed ? checkCompatibility(q, proposed, kind) : { ok: true as const };
    const intent = proposed && compatible.ok ? proposed : null;

    /* A rejection is cached as a refusal, not as the rejected intent: asking
       again would spend another call to reach the same answer. */
    await remember(userId, key, q, intent);

    return {
      intent,
      via: 'model',
      sensitivity: intent ? (INTENT_CATALOG.find((i) => i.intent === intent)?.sensitivity ?? null) : null,
    };
  } catch {
    /* A routing that could not be decided is a question for the candidate,
       which is where it was going anyway. */
    void learned;
    return { intent: null, via: 'none', sensitivity: null };
  }
}
