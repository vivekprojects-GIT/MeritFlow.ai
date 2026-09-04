import { generateText } from 'ai';
import { fastModel, hasAiKey } from '../ai';
import { isSupported } from './tailor';
import type { CandidateProfile, Job } from '../jobs-store';

/**
 * Answering the prose questions on an application.
 *
 * ## The gap this closes
 *
 * "Why do you want to join Figma?" and "In 1-2 sentences, why might you be a
 * good fit for this team?" are on a large share of forms, and until now every
 * one of them stopped an application. The vault cannot hold them — the answer
 * is different for every employer — and derivation cannot compute them.
 *
 * But they are answerable. The candidate has a résumé full of real work and the
 * posting says what the team does, and a truthful paragraph joining the two is
 * exactly what a person would write. Refusing to produce one is not caution, it
 * is the system declining to do the easy part of its job.
 *
 * ## Positive is not the same as invented
 *
 * The answer should be the strongest *true* case, and the constraint that makes
 * that safe is the same one the résumé tailorer uses: every sentence is checked
 * back against the candidate's own evidence, and one that names a technology,
 * employer or number they cannot support is dropped. What survives is enthusiasm
 * grounded in things they actually did.
 *
 * If nothing survives, this returns null. A blank is better than a fabrication,
 * and the caller treats null as a reason to stop rather than to continue.
 *
 * ## What it will never do
 *
 * Answer a factual question. This is reached only for `OPEN_ENDED`, after the
 * vault, derivation and the router have all declined — so it never competes
 * with a stored fact, and it is never the thing that answers "are you
 * authorized to work here".
 */

export type OpenEndedAnswer = {
  text: string;
  /** Sentences the evidence check removed, for the receipt. */
  dropped: string[];
};

/** How long the question asks the answer to be. */
function lengthHint(question: string): { words: number; instruction: string } {
  const m = question.match(/(\d+)\s*[-–to]{1,3}\s*(\d+)\s+sentences?/i) ?? question.match(/(\d+)\s+sentences?/i);
  if (m) {
    const upper = Number(m[2] ?? m[1]);
    return { words: Math.max(30, upper * 28), instruction: `Write ${m[0]}.` };
  }
  if (/\bbrief|short|concise\b/i.test(question)) return { words: 60, instruction: 'Two sentences at most.' };
  return { words: 110, instruction: 'Three or four sentences.' };
}

export async function answerOpenEnded(
  question: string,
  candidate: CandidateProfile,
  job: Job,
): Promise<OpenEndedAnswer | null> {
  const source = `${candidate.resumeText ?? ''}\n${candidate.skills.join(' ')}`;
  if (!hasAiKey() || source.trim().length < 80) return null;

  const { words, instruction } = lengthHint(question);

  try {
    const { text } = await generateText({
      model: fastModel(),
      maxOutputTokens: 400,
      temperature: 0.3,
      system: [
        'You answer one question on a job application, in the candidate\'s voice.',
        instruction,
        `Stay under ${words} words.`,
        'Every specific claim must come from the résumé provided: employers, technologies, projects, numbers.',
        'You may say what about the role interests them, but only by connecting it to work the résumé shows.',
        'Do not invent experience, do not claim familiarity with the company beyond what the posting says, and do not flatter.',
        'Plain sentences. No em-dashes. Do not restate the question.',
      ].join(' '),
      prompt: [
        `## The question\n${question}`,
        `## The role\n${job.title} at ${job.company}\n${job.description.slice(0, 2500)}`,
        `## The candidate's résumé\n${source.slice(0, 8000)}`,
      ].join('\n\n'),
    });

    /*
     * Sentence by sentence, against the same evidence check the résumé uses.
     *
     * Short connective sentences carry no claim and pass; anything naming a
     * technology, an employer or a figure has to be traceable to the résumé.
     * One fabricated sentence in an otherwise sound answer is still a
     * fabrication the candidate has to own in an interview.
     */
    const dropped: string[] = [];
    const kept = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((sentence) => {
        if (sentence.length < 25) return Boolean(sentence);
        /* Evidence for this answer includes the posting: "your work on
           notification relevance" is a fact about the job, not a claim about
           the candidate. */
        const ok = isSupported(sentence, `${source}\n${job.description}`);
        if (!ok) dropped.push(sentence);
        return ok;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    /* A couple of surviving words is not an answer. Better to stop than to
       submit a fragment. */
    if (kept.length < 40) return null;

    return { text: kept, dropped };
  } catch {
    return null;
  }
}
