import { getDb } from '../db';

/**
 * The Answer Vault, keyed by canonical question intent.
 *
 * Application forms ask the same twenty things in a thousand wordings. "Will
 * you require sponsorship?", "Will you now or in the future require
 * sponsorship?" and "Do you need immigration sponsorship?" are one question,
 * and a candidate should answer it once.
 *
 * Canonicalisation is deterministic — patterns, not a model call. That is the
 * point: it runs on every field of every application, it must be fast and free,
 * and its behaviour must not drift between model versions. A question that
 * matches nothing is not guessed at; it becomes an interruption, which is the
 * correct outcome.
 *
 * Every stored answer carries provenance. An answer the user typed and
 * confirmed is not the same object as one inferred from their résumé, and only
 * the former may speak for them unattended.
 */

/** What kind of question this is — drives whether Autopilot may answer it. */
export type QuestionClass =
  | 'NORMAL_FACT'
  | 'PREFERENCE'
  | 'FREE_TEXT'
  | 'SENSITIVE'
  | 'LEGAL_ATTESTATION';

export type Provenance =
  | 'USER_VERIFIED'
  | 'PROFILE_DERIVED'
  | 'RESUME_EVIDENCE'
  /**
   * Computed from a verified fact by a stated rule, with no model involved.
   *
   * Its own provenance rather than folded into the others, because "derived
   * from the country you gave us" is a weaker claim than "you told us this",
   * and an audit trail that collapsed the two would overstate what the
   * candidate actually confirmed.
   */
  | 'DERIVED';

export type VaultAnswer = {
  intent: string;
  /** The employer's wording, for learned answers. Empty for canonical intents. */
  label?: string;
  value: string;
  provenance: Provenance;
  verified: boolean;
  sensitivity: QuestionClass;
  autopilotOk: boolean;
  updatedAt: number;
};

type IntentDef = {
  intent: string;
  sensitivity: QuestionClass;
  /** Any match canonicalises the question to this intent. */
  patterns: RegExp[];
};

/**
 * The canonical intent registry.
 *
 * Ordered most-specific first: "authorized to work" must be tested before a
 * looser sponsorship pattern, or a question about authorisation would be
 * answered with a sponsorship answer — the two have opposite polarity and
 * getting them backwards is a materially false statement on an application.
 */
/**
 * The closed set of questions this system knows how to answer.
 *
 * Exported so the semantic router can offer it to a model as an enum — the
 * model may pick one of these or nothing, and cannot invent a name. That is
 * what keeps a language model in the routing decision without letting it near
 * the answer.
 */
const INTENTS: IntentDef[] = [
  /* Identity fields first. Dry runs against four live Greenhouse boards showed
     every one reporting "First Name / Last Name / Email" as unrecognised — the
     adapter filled them from the profile, but the vault had never heard of
     them, so the verifier counted three unknown questions on every application
     and would have blocked all of them. They are recognised here and sourced
     from the profile. */
  {
    intent: 'PROFILE.ADDRESS',
    sensitivity: 'NORMAL_FACT',
    patterns: [/street\s*address/i, /address\s*line/i, /^\s*address\b/i],
  },
  {
    intent: 'PROFILE.CITY',
    sensitivity: 'NORMAL_FACT',
    patterns: [
      /^\s*city\b/i,
      /city\s*\/?\s*town/i,
      /city\s+of\s+residence/i,
      /(which|what)\s+city\s+(do\s+you\s+)?(live|reside)/i,
      /* A bare "Location" on an application form asks where the candidate is.
         Ashby labels its required location combobox exactly that, and the
         question went unrouted while the rest of the form filled around it. */
      /^\s*(current\s+)?location\s*$/i,
      /where\s+are\s+you\s+(currently\s+)?(located|based)/i,
    ],
  },
  {
    intent: 'PROFILE.STATE',
    sensitivity: 'NORMAL_FACT',
    /* Anchored patterns match a form field's name, not a question. A real
       Instacart posting asked "Which state or province do you currently live
       in?" and it came back unanswered while the state sat in the vault. */
    patterns: [
      /^\s*(state|province|region)\b/i,
      /(which|what)\s+(state|province)\b/i,
      /state\s+or\s+province\b/i,
      /state\s+of\s+residence/i,
    ],
  },
  {
    intent: 'PROFILE.ZIP',
    sensitivity: 'NORMAL_FACT',
    patterns: [/zip|postal\s*code/i],
  },
  {
    intent: 'PROFILE.COUNTRY',
    sensitivity: 'NORMAL_FACT',
    /*
     * Anchored patterns miss the way employers actually word this.
     *
     * A real GitLab posting asked "What is your current country of residence?"
     * and the run came back with it unanswered - while the candidate's country
     * sat in the vault, answered during setup. The anchored pattern only
     * matched a label that *starts* with "country", which is how a form field
     * is named, not how a question is asked.
     */
    patterns: [
      /^\s*country\b/i,
      /country\s+of\s+(residence|citizenship)/i,
      /(which|what)\s+country\s+(do\s+you\s+)?(live|reside)/i,
      /* "Please select the country where you currently reside." */
      /country\s+(where|in\s+which)\s+you/i,
      /select\s+(the\s+)?country/i,
    ],
  },
  {
    intent: 'LOGISTICS.TRANSPORT',
    sensitivity: 'NORMAL_FACT',
    patterns: [/reliable\s+transportation/i, /own\s+transport/i],
  },
  {
    intent: 'ACCOMMODATION.NEEDED',
    sensitivity: 'SENSITIVE',
    patterns: [/workplace\s+accommodation/i, /reasonable\s+accommodation/i],
  },
  {
    intent: 'BACKGROUND.FOREIGN_TIES',
    sensitivity: 'SENSITIVE',
    patterns: [/foreign\s+government/i, /family\s+ties\s+to/i],
  },
  {
    intent: 'PROFILE.FIRST_NAME',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*first\s*name/i, /^\s*given\s*name/i],
  },
  {
    intent: 'PROFILE.LAST_NAME',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*last\s*name/i, /^\s*(family|sur)\s*name/i],
  },
  {
    intent: 'PROFILE.FULL_NAME',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*(full\s*)?name\s*$/i],
  },
  {
    intent: 'PROFILE.EMAIL',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*e-?mail/i],
  },
  {
    intent: 'PROFILE.PHONE',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*(phone|mobile|telephone)/i],
  },
  {
    intent: 'PROFILE.RESUME',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*(resume|r[ée]sum[ée]|cv)\b/i],
  },
  {
    intent: 'PROFILE.COVER_LETTER',
    sensitivity: 'FREE_TEXT',
    patterns: [/cover\s*letter/i],
  },
  {
    intent: 'WORK_AUTH.AUTHORIZED',
    sensitivity: 'NORMAL_FACT',
    patterns: [
      /legally\s+(authori[sz]ed|entitled|eligible)\s+to\s+work/i,
      /* An application asking for "work status" is asking about
         authorisation; nothing else about a candidate's status is an
         employer's business at this stage. */
      /\b(current\s+)?work\s+status\b/i,
      /\bwork\s+eligibility\b/i,
      /are\s+you\s+authori[sz]ed\s+to\s+work/i,
      /* Reddit asks "Are you currently authorized to work in this country?".
         The adverb between "you" and "authorized" defeated the pattern above,
         and the answer was in the vault. Any adverb, or none. */
      /are\s+you\s+\w*\s*authori[sz]ed\s+to\s+work/i,
      /authori[sz]ed\s+to\s+work/i,
      /right\s+to\s+work/i,
      /* Real boards write this several ways — Robinhood asks "Are you legally
         work authorized to work in the US?", which none of the above matched.
         Tolerant of words between "legally" and "authorized", and of the
         "work authorized" compound. */
      /work\s+authori[sz]ed/i,
      /legally[\w\s]{0,20}authori[sz]ed/i,
      /authori[sz]ation\s+to\s+work/i,
      /work\s+authori[sz]ation/i,
    ],
  },
  {
    intent: 'WORK_AUTH.SPONSORSHIP',
    sensitivity: 'NORMAL_FACT',
    patterns: [
      /require\s+(visa\s+|immigration\s+|employer\s+|employment\s+)?sponsorship/i,
      /* Stripe asks "Will you require Stripe to sponsor you for a work permit
         now or in the future for the location(s) you selected" -- the
         employer's own name sits between "require" and "sponsor". */
      /(require|need)[^?]{0,40}spons(or|orship)/i,
      /spons(or|orship)[^?]{0,30}(work\s+permit|visa|employment)/i,
      /need\s+(visa\s+|immigration\s+|employer\s+)?sponsorship/i,
      /sponsorship\s+(be\s+)?required/i,
      /will\s+you\s+now\s+or\s+in\s+the\s+future/i,
    ],
  },
  {
    /*
     * "If this role offers the option to work from a remote location, do you
     * plan to work remotely?"
     *
     * Distinct from LOGISTICS.ONSITE, which asks whether the candidate *can*
     * come in. This asks what they intend to do when given the choice, and the
     * two have different answers for anyone who is willing to do either. It
     * blocked four applications because nothing recognised it.
     */
    intent: 'LOGISTICS.REMOTE_INTENT',
    sensitivity: 'PREFERENCE',
    patterns: [
      /plan\s+to\s+work\s+remotely/i,
      /(intend|expect)\s+to\s+work\s+remotely/i,
      /work\s+(from\s+)?remote(ly)?\s*\??\s*$/i,
      /prefer\s+to\s+work\s+remotely/i,
    ],
  },
  {
    intent: 'LOGISTICS.RELOCATION',
    sensitivity: 'PREFERENCE',
    patterns: [/willing\s+to\s+relocate/i, /open\s+to\s+relocation/i, /able\s+to\s+relocate/i],
  },
  {
    intent: 'LOGISTICS.ONSITE',
    sensitivity: 'PREFERENCE',
    patterns: [/willing\s+to\s+work\s+(on-?site|in\s+office|hybrid)/i, /commute\s+to/i, /work\s+from\s+the\s+office/i],
  },
  {
    intent: 'LOGISTICS.START_DATE',
    sensitivity: 'NORMAL_FACT',
    patterns: [/earliest\s+start\s+date/i, /when\s+(can|could)\s+you\s+start/i, /available\s+to\s+start/i],
  },
  {
    /* The languages the candidate speaks, as a list. Distinct from
       LANGUAGE.PROFICIENCY, which holds a level in one of them -- a form asking
       "what languages are you fluent in?" wants "English", not "Fluent". */
    intent: 'LANGUAGE.SPOKEN',
    sensitivity: 'NORMAL_FACT',
    patterns: [
      /\b(what|which)\s+(spoken\s+)?languages?\b.{0,30}(fluent|speak)/i,
      /languages?\s+(do\s+)?you\s+speak/i,
      /\bspoken\s+languages\b/i,
    ],
  },
  {
    /*
     * Self-assessed skill level, as a rung on a ladder.
     *
     * "What is your level of experience with AI/ML concepts?" offers four
     * choices from "no experience" to "advanced expertise". It is an opinion,
     * not a checkable fact, and the candidate's own answer belongs in the vault
     * so every employer asking it gets the same consistent reply rather than a
     * fresh judgement each time.
     */
    intent: 'EXPERIENCE.LEVEL',
    sensitivity: 'PREFERENCE',
    patterns: [
      /level\s+of\s+experience\s+with/i,
      /how\s+would\s+you\s+(?:describe|rate)\s+your\s+(?:level\s+of\s+)?experience/i,
      /rate\s+your\s+(?:proficiency|expertise|skill)/i,
      /\bproficiency\s+level\b/i,
    ],
  },
  {
    /*
     * Years of experience.
     *
     * Missing from this catalogue entirely until a run skipped a posting over
     * "How many years of relevant experience do you have?" while the answer sat
     * in the candidate's vault. The vault can hold a value the router cannot
     * select: the model chooses from these intents and nothing else, so an
     * intent absent here is unreachable however well it is answered.
     */
    intent: 'EXPERIENCE.YEARS',
    sensitivity: 'NORMAL_FACT',
    /*
     * The candidate's overall experience, and only that.
     *
     * "How many years of experience do you have?" and "How many years of
     * experience do you have with Kubernetes?" differ by two words and by
     * everything else. The first is answered by a number the candidate has
     * given us; the second is a claim about one technology that this system
     * does not hold and must not manufacture from the first.
     *
     * A broader pattern here matched both, which would have written a total of
     * three years into a Kubernetes field -- a false statement on an
     * application, made by the component whose whole purpose is to not do that.
     * The tests that caught it are worth keeping in mind before widening these
     * again: anchoring is the only thing separating the two questions.
     */
    patterns: [
      /^\s*how\s+many\s+years\s+of\s+(relevant\s+|professional\s+|industry\s+|total\s+|overall\s+|work\s+)?experience(\s+do\s+you\s+have)?\s*\??\s*$/i,
      /^\s*years\s+of\s+(relevant\s+|professional\s+|industry\s+|total\s+|overall\s+|work\s+)?experience\s*\??\s*$/i,
      /\byears\s+of\s+(relevant|professional|industry|total|overall)\s+(work\s+)?experience\b/i,
      /\b(total|overall)\s+(years\s+of\s+)?experience\b/i,
      /experience\s+in\s+years/i,
    ],
  },
  {
    /* Full-time, contract, internship. The candidate keeps separate profiles
       for these, so the question is a real preference rather than a fact to
       be derived from anything. */
    intent: 'EMPLOYMENT.TYPE',
    sensitivity: 'NORMAL_FACT',
    patterns: [
      /type\s+of\s+employment/i,
      /employment\s+type/i,
      /open\s+to\s+(full[- ]?time|contract|part[- ]?time|permanent)/i,
      /(full[- ]?time|part[- ]?time)\s+or\s+contract/i,
    ],
  },
  {
    /* Asked constantly by employers hiring across borders, and not derivable:
       a résumé written in English is evidence of nothing a candidate would want
       stated on their behalf as a self-assessed level. */
    intent: 'LANGUAGE.PROFICIENCY',
    sensitivity: 'NORMAL_FACT',
    patterns: [
      /level\s+of\s+english/i,
      /english\s+(language\s+)?(proficiency|level|fluency)/i,
      /proficiency\s+in\s+english/i,
    ],
  },
  {
    intent: 'COMPENSATION.EXPECTED',
    sensitivity: 'PREFERENCE',
    patterns: [/(desired|expected|target)\s+(salary|compensation|pay)/i, /salary\s+expectation/i],
  },
  {
    intent: 'EDUCATION.GRADUATION',
    sensitivity: 'NORMAL_FACT',
    patterns: [/graduation\s+date/i, /when\s+do\s+you\s+graduate/i, /expected\s+graduation/i],
  },
  {
    intent: 'PROFILE.LINKEDIN',
    sensitivity: 'NORMAL_FACT',
    patterns: [/linkedin/i],
  },
  {
    intent: 'PROFILE.GITHUB',
    sensitivity: 'NORMAL_FACT',
    patterns: [/github/i],
  },
  {
    /*
     * "Portfolio" used to resolve two different ways depending on whether the
     * form wrote "Portfolio URL" or just "Portfolio" — the first went to the
     * GitHub intent and the second to the personal-website one, so the same
     * question got two different answers across two employers. It is one
     * question, and now that the product builds an actual portfolio it has one
     * answer.
     */
    intent: 'PROFILE.PORTFOLIO',
    sensitivity: 'NORMAL_FACT',
    patterns: [/portfolio/i],
  },
  {
    intent: 'PROFILE.WEBSITE',
    sensitivity: 'NORMAL_FACT',
    patterns: [/personal\s+(web)?site/i, /^\s*(web)?site\b/i],
  },
  {
    /*
     * The facts a résumé already states.
     *
     * Lever asks for `org` — current employer — on every application, and
     * before these existed it came back unresolved on all of them, while the
     * answer sat on line eleven of the candidate's own CV. A form asking
     * something the résumé plainly says, and the engine calling it unknown, is
     * the system failing at the one thing it has the most evidence for.
     */
    intent: 'HISTORY.CURRENT_EMPLOYER',
    sensitivity: 'NORMAL_FACT',
    patterns: [
      /current\s+(employer|company|organi[sz]ation)/i,
      /* Reddit asks for "the name of your current (or most recent) company".
         A pattern expecting the two words adjacent misses every wording with
         a parenthetical between them, and the answer was in the vault the
         whole time. */
      /(current|most\s+recent)[^)]{0,40}(employer|company|organi[sz]ation)/i,
      /name\s+of\s+your\s+.{0,30}(employer|company)/i,
      /^\s*(employer|company|organi[sz]ation)\s*$/i,
      /who\s+do\s+you\s+(currently\s+)?work\s+for/i,
      /present\s+employer/i,
    ],
  },
  {
    intent: 'HISTORY.CURRENT_TITLE',
    sensitivity: 'NORMAL_FACT',
    /* "What is your current or previous job title?" stopped four separate
       applications while the title sat in the vault, copied from the résumé.
       The "or previous" between the words defeated an adjacent-match. */
    patterns: [
      /current\s+(job\s+)?title/i,
      /current\s+role/i,
      /present\s+(job\s+)?title/i,
      /(current|most\s+recent|previous)[^?]{0,24}(job\s+)?title/i,
      /(job\s+)?title[^?]{0,24}(current|most\s+recent|previous)/i,
    ],
  },
  {
    intent: 'EDUCATION.SCHOOL',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*(school|university|college|institution)\b/i, /where\s+did\s+you\s+study/i],
  },
  {
    intent: 'EDUCATION.DEGREE',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*(degree|qualification)\b/i, /highest\s+(level\s+of\s+)?education/i],
  },
  {
    intent: 'HISTORY.PREVIOUS_EMPLOYMENT',
    sensitivity: 'SENSITIVE',
    patterns: [
      /previously\s+(worked|been\s+employed)/i,
      /ever\s+(worked|been\s+employed)\s+(for|at|with)/i,
      /former\s+employee/i,
      /subsidiary\s+or\s+affiliate/i,
      /affiliated\s+compan/i,
    ],
  },
  {
    intent: 'HISTORY.REFERRAL',
    sensitivity: 'NORMAL_FACT',
    /* Every board words this differently and it is required on most of them.
       A real Affirm posting asked "How did you first learn about Affirm as an
       employer?", which none of the three original patterns matched. */
    patterns: [
      /how\s+did\s+you\s+(first\s+)?(hear|learn|find\s+out)\s+about/i,
      /where\s+did\s+you\s+(hear|learn)\s+about/i,
      /referred\s+by/i,
      /referral\s+source/i,
    ],
  },
  {
    /* On the account already. Asked as an optional free field on Greenhouse and
       Ashby, where leaving it blank is fine but filling it correctly is better
       than asking the candidate for something they have already told us. */
    intent: 'PROFILE.PRONOUNS',
    sensitivity: 'NORMAL_FACT',
    patterns: [/^\s*pronouns?\b/i, /preferred\s+pronouns/i],
  },
  {
    intent: 'PROFILE.PREFERRED_NAME',
    sensitivity: 'NORMAL_FACT',
    patterns: [/preferred\s+(first\s+)?name/i, /what\s+should\s+we\s+call\s+you/i, /nickname/i],
  },
  {
    intent: 'CLEARANCE.SECURITY',
    sensitivity: 'SENSITIVE',
    patterns: [/security\s+clearance/i, /clearance\s+level/i],
  },
  {
    intent: 'DEMOGRAPHIC.VOLUNTARY',
    sensitivity: 'SENSITIVE',
    patterns: [
      /voluntary\s+self-?identification/i,
      /race\s*\/?\s*ethnicity/i,
      /gender\s+identity/i,
      /veteran\s+status/i,
      /disability\s+status/i,
    ],
  },
  {
    intent: 'ATTESTATION.CERTIFY',
    sensitivity: 'LEGAL_ATTESTATION',
    patterns: [
      /i\s+certify/i,
      /i\s+agree\s+to\s+the/i,
      /i\s+acknowledge/i,
      /i\s+understand\s+that/i,
      /under\s+penalty\s+of\s+perjury/i,
      /terms\s+and\s+conditions/i,
    ],
  },
  {
    intent: 'ESSAY.WHY_COMPANY',
    sensitivity: 'FREE_TEXT',
    patterns: [
      /why\s+(do\s+you\s+want\s+to\s+(work|join)|are\s+you\s+interested)/i,
      /why\s+(this\s+)?(company|us)\b/i,
      /what\s+(interests|excites)\s+you\s+about/i,
    ],
  },
];

/** Resolve a raw form question to a canonical intent, or null if unrecognised. */
/** The intents a question may be routed to, without their patterns. */
export const INTENT_CATALOG: { intent: string; sensitivity: QuestionClass }[] = INTENTS.map((i) => ({
  intent: i.intent,
  sensitivity: i.sensitivity,
}));

export function canonicalize(question: string): { intent: string; sensitivity: QuestionClass } | null {
  const q = question.trim();
  if (!q) return null;
  for (const def of INTENTS) {
    if (def.patterns.some((p) => p.test(q))) return { intent: def.intent, sensitivity: def.sensitivity };
  }
  return null;
}

/* ── Learned answers ─────────────────────────────────────────── */

/**
 * The key a question the registry does not recognise is remembered under.
 *
 * Employers ask things no intent registry will ever cover — "How many years
 * with Kubernetes?", "What is your notice period?", "Which of our products have
 * you used?". Each of those stops an application dead, and the candidate answers
 * the same one again on the next posting. Once they have typed it, it should be
 * theirs forever.
 *
 * ## Why the normalisation is so timid
 *
 * The obvious move is fuzzy matching — strip stopwords, stem the words, accept
 * anything close. That is also how a stored answer ends up on the wrong
 * question, and on a job application a confidently wrong answer is worse than a
 * blank one. So this normalises only what carries no meaning: case, surrounding
 * whitespace, punctuation, and the decoration a form puts around a label
 * ("* required"). Two questions match when they are the same question.
 *
 * Anything looser belongs in `INTENTS`, where a human wrote the pattern and can
 * be asked why.
 */
export function learnedKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/\(\s*required\s*\)/g, ' ')
    .replace(/[*†‡]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 120);
  return slug ? `LEARNED.${slug}` : '';
}

/** True for a key produced by `learnedKey`. */
export function isLearned(intent: string): boolean {
  return intent.startsWith('LEARNED.');
}

/**
 * Question shapes a learned answer may never cover, however it was stored.
 *
 * The registry already classifies the attestations it knows, but the learned
 * path exists exactly for questions the registry missed — so a certification
 * worded in a way no pattern caught would otherwise be answered from storage and
 * submitted unattended. That is the one outcome this system must not produce:
 * software asserting, in someone's name, that what they filed is true.
 *
 * Stored, shown, editable — but always handed back to the candidate to send.
 */
const ATTESTATION_SHAPE =
  /\b(certif|attest|declare|acknowledg|consent|i\s+agree|terms\s+and\s+conditions|under\s+penalty|electronic\s+signature|e-sign|esignature|legally\s+bound)\b/i;

/**
 * Whether Autopilot may answer this class of question unattended.
 *
 * A legal attestation is never eligible, regardless of what is stored: an
 * assertion that "I certify the information is true" is a statement only the
 * candidate can make, and having software make it for them is the single worst
 * thing this system could do.
 */
export function autopilotEligible(cls: QuestionClass, provenance: Provenance, verified: boolean): boolean {
  if (cls === 'LEGAL_ATTESTATION') return false;
  if (cls === 'SENSITIVE') return provenance === 'USER_VERIFIED' && verified;
  if (cls === 'FREE_TEXT') return false; /* generated prose gets a human read */
  return verified || provenance === 'USER_VERIFIED';
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

/**
 * Seed the identity intents from the user's own profile.
 *
 * These are not "answers" the candidate stored — they are facts the account
 * already holds, so they are derived rather than asked for. Marked
 * PROFILE_DERIVED and verified, because the person typed them into their own
 * profile; anything missing there stays absent and becomes an interruption,
 * which is the right outcome for an application that requires it.
 */
export function seedIdentity(
  vault: Map<string, VaultAnswer>,
  identity: {
    name?: string;
    email?: string;
    phone?: string;
    website?: string;
    /* Seeded from the career identity rather than the résumé, so an application
       and the portfolio the candidate publishes always point at each other. */
    linkedin?: string;
    github?: string;
    portfolio?: string;
    /* Asked on most Greenhouse and Ashby forms. Held on the account, so there
       is no reason to interrupt someone for it. */
    pronouns?: string;
  },
): Map<string, VaultAnswer> {
  const now = Date.now();
  const add = (intent: string, value: string | undefined) => {
    if (!value?.trim()) return;
    /* Never overwrite something the candidate verified themselves. */
    if (vault.get(intent)?.provenance === 'USER_VERIFIED') return;
    vault.set(intent, {
      intent,
      value: value.trim(),
      provenance: 'PROFILE_DERIVED',
      verified: true,
      sensitivity: 'NORMAL_FACT',
      autopilotOk: true,
      updatedAt: now,
    });
  };

  const parts = (identity.name ?? '').trim().split(/\s+/).filter(Boolean);
  add('PROFILE.FULL_NAME', identity.name);
  add('PROFILE.FIRST_NAME', parts[0]);
  add('PROFILE.LAST_NAME', parts.length > 1 ? parts.slice(1).join(' ') : undefined);
  add('PROFILE.EMAIL', identity.email);
  add('PROFILE.PHONE', identity.phone);
  add('PROFILE.PRONOUNS', identity.pronouns);
  /* The name they go by is their name until they say otherwise. Stored as a
     separate intent so correcting one does not silently rewrite the other. */
  add('PROFILE.PREFERRED_NAME', parts[0]);
  add('PROFILE.WEBSITE', identity.website);
  add('PROFILE.LINKEDIN', identity.linkedin);
  add('PROFILE.GITHUB', identity.github);
  /* Falls back to the personal site: a form asking for a portfolio when the
     candidate has not published one should get the site they do have, rather
     than an interruption. */
  add('PROFILE.PORTFOLIO', identity.portfolio || identity.website);
  return vault;
}


/**
 * Seed what the résumé already says.
 *
 * ## Copies, never inferences
 *
 * Everything here is a value lifted verbatim from the candidate's own parsed
 * résumé — the employer on their most recent role, the school on their most
 * recent qualification, the LinkedIn URL in their header. Those are facts they
 * wrote and are about to send to this employer anyway; declining to reuse them
 * and calling the question "unknown" is the engine failing at the one thing it
 * has the most evidence for.
 *
 * What is deliberately absent is anything **computed**. "Years of experience"
 * looks like it belongs here and does not: deriving it from employment dates
 * means choosing how to treat gaps, overlaps, internships and part-time roles,
 * and the answer goes onto an application as a number the candidate has to
 * stand behind. A copy is evidence; a calculation is a guess wearing a suit.
 *
 * Marked RESUME_EVIDENCE so a receipt says where each value came from, and
 * never overwriting anything the candidate verified themselves.
 */
/**
 * Clean one value lifted out of a résumé.
 *
 * A parser reading a formatted document keeps the formatting: a bullet's
 * leading dash, the run of spaces that right-aligned a date, the parentheses
 * around a degree. None of that is part of the fact, and all of it reaches an
 * employer's form verbatim — a real parse produced
 * `"- Southern Arkansas University          MAY 2025"` for a school name.
 *
 * Conservative on purpose. It removes decoration and never rewrites content:
 * no title-casing, no expanding abbreviations, no reordering. If a value is
 * wrong after this, it is wrong in a way the candidate can see and correct on
 * the readiness screen, which is the point of showing it to them.
 */
export function tidyResumeValue(raw: string): string {
  let v = raw.replace(/\s+/g, ' ').trim();

  /* Bullet glyphs and leading punctuation from the document's layout. */
  v = v.replace(/^[-\u2022\u00b7*\u2013\u2014\s]+/, '').trim();
  v = v.replace(/[-\u2013\u2014\s,;:]+$/, '').trim();

  /* A value wrapped in its own brackets is the bracket's content. */
  const wrapped = v.match(/^\((.+)\)$/) ?? v.match(/^\[(.+)\]$/);
  if (wrapped) v = wrapped[1].trim();

  /* A trailing date is the document's column, not part of the name. */
  v = v.replace(
    /\s*[,\u2013\u2014-]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}$/i,
    '',
  ).trim();
  v = v.replace(/\s*[,\u2013\u2014-]?\s*\d{4}\s*[-\u2013\u2014]\s*(\d{4}|present)$/i, '').trim();

  return v;
}

export function seedFromResume(vault: Map<string, VaultAnswer>, resume: ResumeLike | null): Map<string, VaultAnswer> {
  if (!resume) return vault;
  const now = Date.now();

  const add = (intent: string, value: string | undefined) => {
    const clean = tidyResumeValue(value ?? '');
    if (!clean) return;
    /* Anything the candidate stated themselves outranks the document. */
    if (vault.has(intent)) return;
    vault.set(intent, {
      intent,
      value: clean.slice(0, 300),
      provenance: 'RESUME_EVIDENCE',
      /* A verbatim copy of their own writing is as verified as the document
         they are attaching to the same application. */
      verified: true,
      sensitivity: 'NORMAL_FACT',
      autopilotOk: true,
      updatedAt: now,
    });
  };

  const contact = resume.contact;
  add('PROFILE.FULL_NAME', contact?.name);
  add('PROFILE.EMAIL', contact?.email);
  add('PROFILE.PHONE', contact?.phone);
  add('PROFILE.LINKEDIN', contact?.linkedin);
  add('PROFILE.GITHUB', contact?.github);
  add('PROFILE.WEBSITE', contact?.website);
  add('PROFILE.CITY', contact?.location?.split(',')[0]);

  /* Most recent first is how résumés are written, so entry zero is current. */
  const job = resume.experience?.[0];
  add('HISTORY.CURRENT_EMPLOYER', job?.company);
  add('HISTORY.CURRENT_TITLE', job?.title);

  const school = resume.education?.[0];
  add('EDUCATION.SCHOOL', school?.school);
  add('EDUCATION.DEGREE', [school?.degree, school?.field].filter(Boolean).join(', '));
  add('EDUCATION.GRADUATION', school?.end);

  return vault;
}

/** The parts of a parsed résumé this reads. Structural, to avoid a cycle. */
export type ResumeLike = {
  contact?: { name?: string; email?: string; phone?: string; linkedin?: string; github?: string; website?: string; location?: string };
  experience?: { company?: string; title?: string }[];
  education?: { school?: string; degree?: string; field?: string; end?: string }[];
};

export async function getVault(userId: string): Promise<Map<string, VaultAnswer>> {
  const db = await getDb();
  const res = await db.query<Record<string, unknown>>('SELECT * FROM answer_vault WHERE user_id = $1', [userId]);
  const map = new Map<string, VaultAnswer>();
  for (const r of res.rows) {
    map.set(String(r.intent), {
      intent: String(r.intent),
      label: String(r.label ?? ''),
      value: String(r.value),
      provenance: String(r.provenance) as Provenance,
      verified: Boolean(r.verified),
      sensitivity: String(r.sensitivity) as QuestionClass,
      autopilotOk: Boolean(r.autopilot_ok),
      updatedAt: Number(r.updated_at),
    });
  }
  return map;
}

export async function saveAnswer(
  userId: string,
  input: { intent: string; value: string; provenance: Provenance; verified: boolean; sensitivity: QuestionClass; label?: string },
): Promise<VaultAnswer> {
  const db = await getDb();
  const now = Date.now();
  const autopilotOk = autopilotEligible(input.sensitivity, input.provenance, input.verified);

  await db.query(
    `INSERT INTO answer_vault (user_id, intent, label, value, provenance, verified, sensitivity, autopilot_ok, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id, intent) DO UPDATE SET
       label = EXCLUDED.label, value = EXCLUDED.value, provenance = EXCLUDED.provenance, verified = EXCLUDED.verified,
       sensitivity = EXCLUDED.sensitivity, autopilot_ok = EXCLUDED.autopilot_ok, updated_at = EXCLUDED.updated_at`,
    [
      userId,
      input.intent,
      (input.label ?? '').slice(0, 300),
      input.value.slice(0, 4000),
      input.provenance,
      input.verified,
      input.sensitivity,
      autopilotOk,
      now,
    ],
  );

  return { ...input, value: input.value.slice(0, 4000), autopilotOk, updatedAt: now };
}

/* ── Resolution ──────────────────────────────────────────────────────────── */

export type FormQuestion = { id: string; label: string; required: boolean; kind: 'text' | 'select' | 'boolean' | 'file' | 'textarea' };

export type ResolvedAnswer = {
  question: FormQuestion;
  intent: string | null;
  sensitivity: QuestionClass | null;
  value: string | null;
  provenance: Provenance | null;
  /** Why this could not be filled unattended, when it could not. */
  blockedReason: string | null;
};

/**
 * Resolve a form's questions against the vault.
 *
 * The three outcomes that matter: filled from a verified answer, recognised but
 * not answerable unattended, or unrecognised entirely. Only the first proceeds
 * without the candidate.
 */
export function resolveQuestions(questions: FormQuestion[], vault: Map<string, VaultAnswer>): ResolvedAnswer[] {
  return questions.map((question) => {
    const canon = canonicalize(question.label);
    if (!canon) {
      /*
       * Nothing in the registry claimed this. Before giving up, check whether
       * the candidate has answered this exact question before — that is the
       * whole point of asking them once.
       */
      const key = learnedKey(question.label);
      const learned = key ? vault.get(key) : undefined;

      if (learned && ATTESTATION_SHAPE.test(question.label)) {
        return {
          question,
          intent: key,
          sensitivity: 'LEGAL_ATTESTATION',
          value: learned.value,
          provenance: learned.provenance,
          blockedReason: 'Reads as a legal attestation — only you can agree to this.',
        };
      }

      if (learned && learned.autopilotOk) {
        return {
          question,
          intent: key,
          sensitivity: 'NORMAL_FACT',
          value: learned.value,
          provenance: learned.provenance,
          blockedReason: null,
        };
      }

      return {
        question,
        intent: null,
        sensitivity: null,
        value: learned?.value ?? null,
        provenance: learned?.provenance ?? null,
        blockedReason: question.required ? 'Unrecognised question — needs your answer once.' : null,
      };
    }

    const stored = vault.get(canon.intent);
    if (!stored) {
      return {
        question,
        intent: canon.intent,
        sensitivity: canon.sensitivity,
        value: null,
        provenance: null,
        blockedReason: `No verified answer for ${canon.intent} yet.`,
      };
    }

    if (!stored.autopilotOk) {
      return {
        question,
        intent: canon.intent,
        sensitivity: canon.sensitivity,
        value: stored.value,
        provenance: stored.provenance,
        blockedReason:
          canon.sensitivity === 'LEGAL_ATTESTATION'
            ? 'Legal attestation — only you can agree to this.'
            : `Stored answer is not cleared for unattended use (${stored.provenance}).`,
      };
    }

    return {
      question,
      intent: canon.intent,
      sensitivity: canon.sensitivity,
      value: stored.value,
      provenance: stored.provenance,
      blockedReason: null,
    };
  });
}
