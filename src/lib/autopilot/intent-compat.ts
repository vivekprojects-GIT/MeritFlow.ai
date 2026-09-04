import { classifyQuestion } from './question-class';

/**
 * A deterministic second opinion on what the router decided.
 *
 * ## Why routing alone is not enough
 *
 * The claim that a bad routing can only "fill the wrong stored fact" was too
 * comfortable. Consider:
 *
 *     "Will you now or in the future require sponsorship?"
 *       routed to WORK_AUTH.AUTHORIZED  → "Yes"
 *       should be WORK_AUTH.SPONSORSHIP → "No"
 *
 * Both answers are in the vault, both are verified, both are a bare Yes or No —
 * and they have opposite polarity. Swapping them puts a materially false
 * statement about immigration status on a real application, and nothing
 * downstream would notice, because every individual check passes.
 *
 * ## What this adds
 *
 * Each intent declares the question families it is allowed to answer. The
 * question is classified deterministically, by rules a model never sees, and a
 * routing survives only if the two agree. The model proposes; a regex disposes.
 *
 * ## High-risk intents get a stricter test
 *
 * For immigration status, clearance, demographics and salary commitments, an
 * *overlapping* family is not enough — the deterministic classifier must name
 * the intent's own family exactly. Those are the answers that are hardest to
 * take back and easiest to get backwards.
 */

export type IntentRule = {
  /** Question families this intent may answer, from `classifyQuestion`'s rules. */
  families: string[];
  /** High risk requires an exact family match, not merely a compatible one. */
  risk: 'high' | 'normal';
};

/**
 * Anything absent from this table is `normal` risk with no family restriction.
 *
 * Deliberately partial: listing every intent would be a maintenance burden that
 * adds nothing for a city name. What is here is what is dangerous to get wrong.
 */
export const INTENT_RULES: Record<string, IntentRule> = {
  /* Immigration. The pair that motivated this file — opposite polarity, both
     stored, both a bare Yes/No. */
  'WORK_AUTH.AUTHORIZED': { families: ['WORK_AUTH_AUTHORIZED'], risk: 'high' },
  'WORK_AUTH.SPONSORSHIP': { families: ['WORK_AUTH_SPONSORSHIP'], risk: 'high' },

  /* Legal and protected categories. Wrong answers here are not embarrassing,
     they are consequential. */
  'CLEARANCE.SECURITY': { families: ['CLEARANCE'], risk: 'high' },
  'DEMOGRAPHIC.VOLUNTARY': { families: ['DEMOGRAPHIC'], risk: 'high' },
  'ACCOMMODATION.NEEDED': { families: ['DEMOGRAPHIC', 'ACCOMMODATION'], risk: 'high' },
  'BACKGROUND.FOREIGN_TIES': { families: ['DEMOGRAPHIC', 'BACKGROUND'], risk: 'high' },

  /* A number the candidate is held to. */
  'COMPENSATION.EXPECTED': { families: ['SALARY'], risk: 'high' },

  /* A claim about their own past. */
  'HISTORY.PREVIOUS_EMPLOYMENT': { families: ['PRIOR_EMPLOYMENT'], risk: 'high' },

  /* Ordinary facts. A family check still stops "years of Kubernetes" being
     answered with a city, which is the failure mode that reads as absurd and
     would still have been submitted. */
  'PROFILE.CITY': { families: ['LOCATION'], risk: 'normal' },
  'PROFILE.STATE': { families: ['LOCATION'], risk: 'normal' },
  'PROFILE.COUNTRY': { families: ['LOCATION'], risk: 'normal' },
  'PROFILE.ADDRESS': { families: ['LOCATION', 'CONTACT'], risk: 'normal' },
  'PROFILE.ZIP': { families: ['LOCATION', 'CONTACT'], risk: 'normal' },
  'PROFILE.EMAIL': { families: ['CONTACT'], risk: 'normal' },
  'PROFILE.PHONE': { families: ['CONTACT'], risk: 'normal' },
  'PROFILE.LINKEDIN': { families: ['CONTACT'], risk: 'normal' },
  'PROFILE.GITHUB': { families: ['CONTACT'], risk: 'normal' },
  'PROFILE.PORTFOLIO': { families: ['CONTACT'], risk: 'normal' },
  'PROFILE.WEBSITE': { families: ['CONTACT'], risk: 'normal' },
  'PROFILE.FIRST_NAME': { families: ['NAME'], risk: 'normal' },
  'PROFILE.LAST_NAME': { families: ['NAME'], risk: 'normal' },
  'PROFILE.FULL_NAME': { families: ['NAME'], risk: 'normal' },
  'PROFILE.PRONOUNS': { families: ['NAME', 'DEMOGRAPHIC'], risk: 'normal' },
  'PROFILE.PREFERRED_NAME': { families: ['NAME'], risk: 'normal' },

  'EDUCATION.SCHOOL': { families: ['EDUCATION'], risk: 'normal' },
  'EDUCATION.DEGREE': { families: ['EDUCATION'], risk: 'normal' },
  'EDUCATION.GRADUATION': { families: ['EDUCATION'], risk: 'normal' },

  'HISTORY.CURRENT_EMPLOYER': { families: ['PRIOR_EMPLOYMENT', 'CURRENT_ROLE'], risk: 'normal' },
  'HISTORY.CURRENT_TITLE': { families: ['PRIOR_EMPLOYMENT', 'CURRENT_ROLE'], risk: 'normal' },
  'HISTORY.REFERRAL': { families: ['REFERRAL_SOURCE'], risk: 'normal' },

  'LOGISTICS.RELOCATION': { families: ['RELOCATION'], risk: 'normal' },
  'LOGISTICS.REMOTE_INTENT': { families: ['WORK_MODE'], risk: 'normal' },
  'LOGISTICS.ONSITE': { families: ['WORK_MODE'], risk: 'normal' },
  'LOGISTICS.START_DATE': { families: ['START_DATE'], risk: 'normal' },
  'LOGISTICS.TRANSPORT': { families: ['TRANSPORT'], risk: 'normal' },
};

export type CompatibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * General qualifiers on an experience question. Anything else is a subject.
 *
 * "Years of *professional* experience" is the candidate's career; "years of
 * *Kubernetes* experience" is one skill within it. The words here are the ones
 * that keep a question general.
 */
const GENERAL_EXPERIENCE = /^(relevant|professional|industry|total|overall|work|working|combined|full[- ]?time|paid)$/i;

/**
 * Does this question scope its years to a particular subject?
 *
 * The candidate's total experience answers "how many years of experience do you
 * have". It does not answer "how many years with Kubernetes", and writing three
 * into that field states something about a technology nobody has told us
 * anything about.
 *
 * The router's model will happily map both onto EXPERIENCE.YEARS — it did, on a
 * live posting — because they are the same question apart from the subject. The
 * subject is the whole difference, so it is checked here rather than trusted
 * there.
 */
export function scopesYearsToSubject(question: string): string | null {
  /* "years of experience [do you have] with X" -- the clause between the noun
     and the preposition varies, so a few words are allowed to sit there. */
  const prepositional = question.match(
    /years?\s+(?:of\s+)?(?:hands[-\s]?on\s+)?experience\s+(?:\w+\s+){0,4}?(?:with|in|using)\s+([\w+#.-]{2,40})/i,
  ) ?? question.match(/years?\s+(?:of\s+)?(?:with|in|using)\s+([\w+#.-]{2,40})/i);
  if (prepositional) return prepositional[1].trim();

  /* "years of <subject> experience" -- the adjective slot. */
  const adjective = question.match(/years?\s+of\s+([\w+#.-]{2,30})\s+experience/i);
  if (adjective) {
    const word = adjective[1].trim();
    if (!GENERAL_EXPERIENCE.test(word)) return word;
  }
  return null;
}

/**
 * The vault key holding how long the candidate has worked with one subject.
 *
 * Namespaced rather than enumerated. A fixed list — PYTHON, ML, AWS — is a list
 * that is always missing the technology the current form is asking about, and
 * every addition is a code change for a fact the candidate could simply have
 * stated. Deriving the key from the question instead means any subject is
 * answerable the moment the candidate records a duration for it, and unanswered
 * until then.
 *
 * Normalised so that "Node.js", "node js" and "NodeJS" reach the same entry.
 */
export function subjectYearsIntent(subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return `EXPERIENCE.YEARS.${slug}`;
}

/**
 * Questions that mention an employer while asking something else entirely.
 *
 * A real submitted application answered
 *
 *   "Are you subject to any employment agreements and/or post-employment
 *    restrictions with your current employer or a past employer?"
 *
 * with "Capgemini America Inc." — because the label contains the words
 * "current employer" and a pattern matched them. The question is a yes/no about
 * restrictive covenants; the employer's name is not an answer to it, and the
 * subject matter is one this system must never guess at.
 *
 * The tell is not the employer word, it is the obligation word beside it.
 */
const ASKS_ABOUT_OBLIGATIONS =
  /\b(agreement|covenant|non\s?-?\s?compete|noncompete|restriction|restrictive|obligation|bound\sby|nda|non\s?-?\s?disclosure|garden\sleave|notice\speriod|conflict\sof\sinterest)s?\b/i;

/**
 * A question naming a platform that is not the one this intent holds.
 *
 * "What is your GitLab username?" was answered with a GitHub URL, because the
 * routing cache had learned the two were the same. They are not, and a profile
 * URL for one service is not a username on another.
 */
const PLATFORM_WORDS: [string, RegExp][] = [
  ['PROFILE.GITHUB', /\bgithub\b/i],
  ['PROFILE.LINKEDIN', /\blinked\s?-?in\b/i],
];

/**
 * May this routing be used for this question?
 *
 * An intent with no declared rule passes: the table covers what is dangerous,
 * and demanding an entry for every intent would mean a new intent silently
 * answering nothing until somebody remembered to add one.
 */
export function checkCompatibility(question: string, intent: string, kind = 'text'): CompatibilityResult {
  /*
   * Years scoped to a subject, before anything else.
   *
   * Checked ahead of the family table because the two questions land in the
   * same family and no family rule can separate them.
   */
  if (intent === 'EXPERIENCE.YEARS') {
    const subject = scopesYearsToSubject(question);
    if (subject) {
      return {
        ok: false,
        reason: `This asks about experience with ${subject}, not your overall experience, and that is not something you have told us.`,
      };
    }
  }

  /*
   * A question about employment *obligations* is never answered with an
   * employer's name, however many employer words it contains.
   */
  if (intent.startsWith('HISTORY.') && ASKS_ABOUT_OBLIGATIONS.test(question)) {
    return {
      ok: false,
      reason: 'This asks about employment agreements or restrictions, not about who you work for.',
    };
  }

  /*
   * An intent tied to one platform needs that platform named. Otherwise a
   * GitLab username field is filled with a GitHub URL.
   */
  for (const [platformIntent, word] of PLATFORM_WORDS) {
    if (intent === platformIntent && !word.test(question)) {
      return {
        ok: false,
        reason: `${intent} answers questions that name that service, and this one does not.`,
      };
    }
  }

  /*
   * Two shape rules from answers that reached a live form wrong.
   *
   * "Preferred Office Location" was answered "Yes": it asks *which office*, and
   * LOGISTICS.ONSITE holds whether the candidate will work on-site at all. A
   * yes/no intent must not answer a which/where question.
   *
   * "What spoken languages are you fluent in?" was answered "Fluent": it asks
   * for a *list of languages*, and LANGUAGE.PROFICIENCY holds a level. The
   * intents differ exactly by what kind of noun the question wants back.
   */
  if (intent.startsWith('LOGISTICS.') && /\b(preferred|which|what)\s+(office\s+)?location\b|\bwhich\s+office\b/i.test(question)) {
    return { ok: false, reason: 'This asks which location, and that intent only answers whether.' };
  }
  /*
   * A level word is not an explanation.
   *
   * "Do you have hands-on experience building agentic systems? Please
   * explain." was answered "advanced" -- the level intent matched the word
   * "experience" and a one-word rating landed in an essay box on a live form.
   * A question that asks for prose gets prose or nothing.
   */
  if (intent === 'EXPERIENCE.LEVEL' && /\b(please\s+)?(explain|describe|elaborate|tell\s+us)\b/i.test(question)) {
    return { ok: false, reason: 'This asks for an explanation, not a rating.' };
  }

  if (intent === 'LANGUAGE.PROFICIENCY' && /\b(what|which)\s+(spoken\s+)?languages\b/i.test(question)) {
    return { ok: false, reason: 'This asks which languages you speak, not your level in one.' };
  }

  const rule = INTENT_RULES[intent];
  if (!rule) return { ok: true };

  const observed = classifyQuestion(question, kind);

  /* A question the deterministic classifier could not place is not evidence
     for anything. For a high-risk intent that is a refusal; for an ordinary one
     the router's opinion is the only opinion available and is allowed to
     stand. */
  if (observed.rule === 'UNRECOGNISED' || observed.rule === 'PROSE') {
    return rule.risk === 'high'
      ? { ok: false, reason: `${intent} needs a question that plainly asks for it, and this one does not.` }
      : { ok: true };
  }

  if (rule.families.includes(observed.rule)) return { ok: true };

  return {
    ok: false,
    reason: `This reads as a ${observed.rule.toLowerCase().replace(/_/g, ' ')} question, and ${intent} answers ${rule.families
      .join(' or ')
      .toLowerCase()
      .replace(/_/g, ' ')} questions.`,
  };
}

/** Whether an intent is one of the answers that must never be guessed at. */
export function isHighRisk(intent: string): boolean {
  return INTENT_RULES[intent]?.risk === 'high';
}
