import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { fastModel, hasAiKey } from '../ai';
import type { Job, CandidateProfile } from '../jobs-store';
import type { Optimization } from '../job-settings';

/**
 * Per-application résumé tailoring and cover letters.
 *
 * Until now the workflow attached a filename and nothing else — the same
 * résumé went to every employer, and no cover letter existed at all.
 *
 * ## The one rule
 *
 * Tailoring reorders and rephrases evidence. It never adds any. A résumé that
 * claims Kubernetes because the posting asked for Kubernetes is a lie the
 * candidate has to defend in an interview they will not get a second shot at,
 * and they will not even know it was made on their behalf.
 *
 * So every generated bullet is checked back against the résumé text, and
 * anything unsupported is dropped and reported rather than sent. The
 * "aggressive" setting widens how boldly existing evidence may be framed; it
 * does not unlock inventing new evidence, and there is no setting that does.
 */

export type TailoredResume = {
  /** A short positioning paragraph for the top of the résumé. */
  summary: string;
  /** Reordered, rephrased achievement bullets drawn from the résumé. */
  bullets: string[];
  /** Skills from the posting that the résumé actually evidences. */
  emphasised: string[];
  /** Posting requirements with nothing behind them. Shown, never papered over. */
  gaps: string[];
  /** Claims that were generated and then dropped for lacking support. */
  dropped: string[];
  fileName: string;
};

export type CoverLetter = {
  body: string;
  fileName: string;
  /** Sentences dropped for referencing something not in the résumé. */
  dropped: string[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/* ── Evidence checking ───────────────────────────────────────────────────── */

/**
 * Is this claim traceable to the résumé?
 *
 * Deliberately lexical rather than a model judging its own output: asking the
 * generator whether it made something up is the one question it is least able
 * to answer. A claim passes when the distinctive words in it appear in the
 * source, which catches invented tools, employers and numbers — the three
 * things that actually get fabricated.
 */
const STOPWORDS = new Set([
  'the','a','an','and','or','but','for','with','to','of','in','on','at','by','from','as','is','are','was','were','be','been',
  'have','has','had','do','does','did','will','would','can','could','should','my','our','their','its','it','this','that',
  'these','those','i','we','you','they','he','she','using','used','use','built','build','led','over','across','into','via',
  'while','than','then','also','more','most','new','work','working','worked','team','teams','project','projects','role',
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * A number in a claim must appear in the source.
 *
 * Fabricated metrics are the most damaging and the most common failure — "cut
 * latency by 40%" reads well and is unfalsifiable until someone asks.
 */
/**
 * Every magnitude a source figure also licenses.
 *
 * A résumé writes "12k requests per second" and "cut escaped defects by half".
 * A tailored bullet, correctly, writes "12,000 requests per second" and "by
 * 50%". Compared as literal digit strings those look like fabrications, and
 * were dropped as such -- so the engine was throwing away faithful restatements
 * of the candidate's own achievements and then, in Smart mode, refusing to send
 * the application because claims had been dropped.
 *
 * This is a widening of what counts as the same number, not of what counts as
 * evidence. A figure that appears nowhere in the résumé in any form is still
 * unsupported, which is the property worth having.
 */
function numericForms(sourceText: string): Set<string> {
  const forms = new Set<string>();
  const lower = sourceText.toLowerCase();

  for (const m of lower.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|bn|b)\b/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    const scale = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1e9;
    forms.add(String(Math.round(n * scale)));
  }

  /* Fractions written as words. "By half" and "by 50%" are the same claim. */
  if (/\bhalf\b/.test(lower)) forms.add('50');
  if (/\b(a\s+)?third\b/.test(lower)) forms.add('33');
  if (/\b(a\s+)?quarter\b/.test(lower)) forms.add('25');
  if (/\btwo\s*[-]?\s*thirds\b/.test(lower)) forms.add('66');
  if (/\bdoubl(e|ed|ing)\b/.test(lower)) forms.add('100');
  if (/\btripl(e|ed|ing)\b/.test(lower)) forms.add('200');

  return forms;
}

function numbersSupported(claim: string, sourceText: string): boolean {
  const nums = claim.match(/\d[\d,.]*/g) ?? [];
  if (nums.length === 0) return true;

  const normalisedSource = sourceText.replace(/,/g, '');
  const forms = numericForms(sourceText);

  return nums.every((raw) => {
    const n = raw.replace(/,/g, '').replace(/\.$/, '');
    if (normalisedSource.includes(n)) return true;
    return forms.has(n);
  });
}

/**
 * The distinctive parts of a claim: proper nouns, product and technology
 * names, versions, and anything containing a digit.
 *
 * These are what actually gets fabricated. Ordinary verbs and nouns are not
 * checked, because rephrasing is the entire point of tailoring — an earlier
 * version required a fraction of *all* words to overlap, which rejected
 * "Shipped PostgreSQL backed features in TypeScript" against a résumé that
 * plainly says PostgreSQL and TypeScript, purely because "shipped", "backed"
 * and "features" were new words.
 *
 * The first word is exempt from the capitalisation test: it is capitalised
 * because it starts the sentence, not because it names anything.
 */
function distinctive(claim: string): string[] {
  const words = claim.trim().split(/\s+/);
  const out: string[] = [];

  /*
   * Sentence openers are capitalised by grammar, not by naming anything.
   *
   * Exempting only index zero handled a one-sentence bullet and broke every
   * summary: the schema asks for two sentences, so the second one's first word
   * -- "Demonstrates", "Brings", "Combines" -- was read as a proper noun that
   * had to appear verbatim in the résumé. It never does. The result was that
   * essentially every generated summary was dropped as unsupported, and the
   * tailored résumé went out with no summary at all.
   */
  const opensSentence = new Set<number>([0]);
  words.forEach((raw, i) => {
    if (/[.!?]["')]?$/.test(raw)) opensSentence.add(i + 1);
  });

  words.forEach((raw, i) => {
    const w = raw.replace(/^[^\w+#]+|[^\w+#.]+$/g, '');
    if (!w) return;
    const hasDigit = /\d/.test(w);
    const properNoun = !opensSentence.has(i) && /^[A-Z]/.test(w);
    /* Tokens like C++, .NET, Node.js carry a symbol that marks them out. */
    const symbolic = /[+#]/.test(w) || /\w\.\w/.test(w);
    if (hasDigit || properNoun || symbolic) out.push(w.toLowerCase());
  });

  return out;
}

/**
 * A claim is supported when every distinctive token in it appears in the
 * source, and every number in it appears in the source.
 *
 * A claim with no distinctive tokens passes: connective prose that names
 * nothing and quantifies nothing has nothing to fabricate.
 */
export function isSupported(claim: string, sourceText: string): boolean {
  if (!numbersSupported(claim, sourceText)) return false;

  const source = tokens(sourceText);
  const sourceLower = sourceText.toLowerCase();

  return distinctive(claim).every((t) => {
    /*
     * A bare figure is `numbersSupported`'s business, not this check's.
     *
     * `distinctive` collects anything containing a digit, so "12,000" arrived
     * here and was required to appear in the resume as that exact string --
     * defeating the numeric widening above, which had already established that
     * the resume's "12k" licenses it. Tokens that mix digits with letters
     * ("4s", "v2", "s3") are names and stay literal.
     */
    if (/^[0-9][0-9,.]*$/.test(t)) return true;

    if (source.has(t)) return true;
    /* Substring fallback so "React" matches "React.js" and "4s" matches a
       source that wrote "4s." with punctuation attached. */
    return sourceLower.includes(t);
  });
}

/* ── Résumé ──────────────────────────────────────────────────────────────── */

const resumeSchema = z.object({
  summary: z.string().describe('Two sentences positioning this candidate for this specific role, using only what the résumé shows.'),
  bullets: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe('Achievement bullets taken from the résumé, reordered and rephrased for this posting. Never add a new fact.'),
  emphasised: z.array(z.string()).max(12).describe('Skills the posting asks for that this résumé genuinely evidences.'),
});

const TONE: Record<Optimization, string> = {
  off: 'Keep the candidate\'s original wording almost exactly. Reorder only.',
  honest: 'Rephrase for clarity and match the posting\'s vocabulary where the résumé already supports it.',
  aggressive:
    'Frame the strongest reading of what the résumé shows, and lead with the most relevant work. You still may not add a fact that is not there.',
};

export async function tailorResume(
  candidate: CandidateProfile,
  job: Job,
  optimization: Optimization = 'honest',
): Promise<TailoredResume> {
  /* .docx, because that is what an ATS can reliably parse. See docx.ts. */
  const fileName = `${slug(job.company)}-${slug(job.title)}-resume.docx`;
  const source = candidate.resumeText ?? '';

  const gaps = job.skills.filter((s) => !isSkillEvidenced(s, candidate));

  /* No key, or no résumé to draw from: return the untailored shape rather than
     failing the run. An application with the original résumé is still an
     application; one that throws is not. */
  if (!hasAiKey() || source.trim().length < 80) {
    return {
      summary: '',
      bullets: [],
      emphasised: job.skills.filter((s) => isSkillEvidenced(s, candidate)),
      gaps,
      dropped: [],
      fileName,
    };
  }

  try {
    const { object } = await generateObject({
      model: fastModel(),
      schema: resumeSchema,
      maxOutputTokens: 1400,
      temperature: 0.2,
      system: [
        'You tailor an existing résumé to one job posting.',
        'You may reorder, cut, and rephrase. You may NOT introduce any employer, tool, technology, credential, metric, or achievement that is not already in the résumé text.',
        'If the posting wants something the résumé does not show, leave it out. Do not hint at it.',
        /*
         * Do not name the gap either.
         *
         * A real summary read "...primarily in Go and Python rather than Ruby
         * on Rails..." -- an honest disclaimer, and exactly right in spirit.
         * The evidence check sees "Ruby" and "Rails", finds neither in the
         * résumé, and drops the whole summary; so the tailored document went
         * out with no summary at all, and Smart mode then held the application
         * because a claim had been dropped. The checker is not wrong to be
         * literal, so the instruction is what changes: say what the candidate
         * has, and stop there.
         */
        'Never name a technology the résumé does not contain, even to say the candidate lacks it. No comparisons, no "rather than", no "although".',
        TONE[optimization],
      ].join(' '),
      prompt: `## The posting\n${job.title} at ${job.company}\n${job.description.slice(0, 4000)}\n\nSkills asked for: ${job.skills.join(', ')}\n\n## The candidate's résumé\n${source.slice(0, 12_000)}`,
    });

    /* Every generated line is checked back against the résumé. */
    const dropped: string[] = [];
    const bullets = object.bullets.filter((b) => {
      const ok = isSupported(b, source);
      if (!ok) dropped.push(b);
      return ok;
    });
    const summaryOk = isSupported(object.summary, source);
    if (!summaryOk) dropped.push(object.summary);

    return {
      summary: summaryOk ? object.summary : '',
      bullets,
      /* Intersected with real evidence: the model listing a skill does not
         make the résumé show it. */
      emphasised: object.emphasised.filter((s) => isSkillEvidenced(s, candidate)),
      gaps,
      dropped,
      fileName,
    };
  } catch {
    return { summary: '', bullets: [], emphasised: [], gaps, dropped: [], fileName };
  }
}

/** A skill counts as evidenced when it appears in the résumé or the stated skill list. */
function isSkillEvidenced(skill: string, candidate: CandidateProfile): boolean {
  const needle = skill.toLowerCase().trim();
  if (!needle) return false;
  if (candidate.skills.some((s) => s.toLowerCase().includes(needle) || needle.includes(s.toLowerCase()))) return true;
  return (candidate.resumeText ?? '').toLowerCase().includes(needle);
}

/**
 * Assemble the document that is actually sent.
 *
 * The tailored summary and bullets lead, because they are the part written for
 * this posting, and the candidate's own résumé follows in full. Nothing is
 * replaced: dropping the original in favour of a generated extract would lose
 * dates, employers and everything the model was not asked to restate, and the
 * candidate would have no idea what an employer received.
 */
export function renderResume(candidate: { resumeText: string }, tailored: TailoredResume, name = ''): string {
  const parts: string[] = [];
  if (name) parts.push(name.toUpperCase(), '');

  if (tailored.summary) parts.push('SUMMARY', tailored.summary, '');
  if (tailored.bullets.length > 0) {
    parts.push('HIGHLIGHTS FOR THIS ROLE', ...tailored.bullets.map((b) => `- ${b}`), '');
  }
  parts.push(tailored.summary || tailored.bullets.length > 0 ? 'FULL RÉSUMÉ' : '', candidate.resumeText.trim());

  return parts.filter((p) => p !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ── Cover letter ────────────────────────────────────────────────────────── */

export async function writeCoverLetter(
  candidate: CandidateProfile,
  job: Job,
  identity: { name?: string; email?: string },
): Promise<CoverLetter> {
  const fileName = `${slug(job.company)}-${slug(job.title)}-cover-letter.docx`;
  const source = `${candidate.resumeText ?? ''}\n${candidate.skills.join(' ')}`;

  if (!hasAiKey() || (candidate.resumeText ?? '').trim().length < 80) {
    return { body: '', fileName, dropped: [] };
  }

  try {
    const { text } = await generateText({
      model: fastModel(),
      maxOutputTokens: 700,
      temperature: 0.4,
      system: [
        'You write a short cover letter: three paragraphs, under 220 words.',
        'Every specific claim must come from the résumé provided. Do not invent projects, employers, numbers, or reasons for wanting the job.',
        'No flattery about the company that you cannot support from the posting text.',
        'Plain sentences. No em-dashes. Do not open with "I am writing to apply".',
      ].join(' '),
      prompt: `## Posting\n${job.title} at ${job.company}\n${job.description.slice(0, 3000)}\n\n## Candidate\nName: ${identity.name ?? ''}\n${(candidate.resumeText ?? '').slice(0, 8000)}`,
    });

    /* Sentence-level check. One fabricated sentence in an otherwise sound
       letter is still a fabricated sentence the candidate has to own. */
    const dropped: string[] = [];
    const kept = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        const s = sentence.trim();
        if (s.length < 25) return true;
        /* Only sentences making concrete claims are checked; connective prose
           has nothing to verify against. */
        const concrete = /\d/.test(s) || /\b[A-Z][a-zA-Z+#.]{2,}\b/.test(s.replace(/^[A-Z]/, ''));
        if (!concrete) return true;
        const ok = isSupported(s, `${source}\n${job.description}`);
        if (!ok) dropped.push(s);
        return ok;
      })
      .join(' ');

    return { body: kept.replace(/\s+/g, ' ').trim(), fileName, dropped };
  } catch {
    return { body: '', fileName, dropped: [] };
  }
}
