import type { VaultAnswer } from './answer-vault';

/**
 * Answers computed from verified facts, never invented.
 *
 * ## The tier this fills
 *
 * There are three kinds of question on an application. Ones the candidate has
 * answered, which the vault serves. Ones nobody can answer for them, which stop
 * the run. And a third kind in between: questions whose answer *follows* from
 * something already verified.
 *
 * "Are you currently located in Canada?" is not in the vault and never will be
 * — there are two hundred countries and an employer picks one. But the
 * candidate's country is verified, and the answer follows from it with no
 * judgement involved. Stopping an application for that is the engine refusing
 * to do arithmetic.
 *
 * ## Why this is not the thin end of guessing
 *
 * Every rule here is a total function of stated facts with no model in it, and
 * each one refuses when its input is missing rather than falling back on
 * something plausible. A derivation that cannot see the candidate's country
 * does not assume a country; it declines, and the question goes to the person.
 *
 * The rules are also deliberately narrow. "Located in X" is answerable because
 * country membership is decidable. "Do you have experience with X" is not here,
 * because how much experience counts as experience is a judgement the candidate
 * owns — and that is the question this file must never grow to cover.
 */

export type Derivation = {
  value: string;
  /** The verified fact this was computed from, for the audit trail. */
  basis: string;
  /** Which rule fired, so a wrong answer is traceable to one place. */
  rule: string;
};

export type DerivedFacts = {
  country: string;
  /** Employers from every history source we hold, lowercased. */
  employers: string[];
  /**
   * The candidate has explicitly asserted that their record of professional
   * relationships is complete — jobs, contracts, consulting, internships,
   * agency placements, the lot.
   *
   * Without this, absence proves nothing. A résumé is a curated document: it
   * routinely omits a three-month contract, a vendor engagement, an internship
   * a decade ago. "Not on the CV" and "never happened" are different claims,
   * and only the candidate can turn the first into the second.
   */
  historyComplete: boolean;
  /**
   * How this posting was found. Answers "How did you hear about this job?"
   * with a fact rather than a plausible-sounding guess.
   */
  discoverySource: string;
  /** Total years of professional experience, as the candidate stated it. */
  yearsExperience: number | null;
  city: string;
  state: string;
  /** Highest qualification held, from the résumé. */
  degreeLevel: 'doctorate' | 'masters' | 'bachelors' | 'none';
  /** The field it is in, lowercased. */
  degreeField: string;
};

/** The verified facts the rules may read. Nothing else is in scope. */
export function factsFrom(
  vault: Map<string, VaultAnswer>,
  resume: { experience?: { company?: string }[]; education?: { degree?: string; field?: string }[] } | null,
  discoverySource = '',
): DerivedFacts {
  const country = (vault.get('PROFILE.COUNTRY')?.value ?? '').trim();
  /*
   * The parser sometimes puts a location line into `company` -- a real résumé
   * produced ", Austin, TX" alongside "Northwind Labs". Those are not employers
   * and letting them into the comparison only creates false matches.
   */
  const fromResume = (resume?.experience ?? [])
    .map((e) => (e.company ?? '').trim().toLowerCase())
    .filter((c) => c.length > 1 && !c.startsWith(',') && /[a-z]/.test(c));

  /* Anything the candidate added beyond the résumé: contracts, clients,
     consulting engagements. Stored as one comma-separated verified answer. */
  const declared = (vault.get('HISTORY.ALL_EMPLOYERS')?.value ?? '')
    .split(/[,;]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  const employers = [...new Set([...fromResume, ...declared])];

  /*
   * All three must be asserted. A candidate who has confirmed their salaried
   * jobs but not their consulting work cannot support "have you ever consulted
   * for X", and answering it from a partial record is the exact failure this
   * flag exists to prevent.
   */
  const complete = ['HISTORY.EMPLOYMENT_COMPLETE', 'HISTORY.CONSULTING_COMPLETE', 'HISTORY.CLIENTS_COMPLETE'].every(
    (intent) => {
      const a = vault.get(intent);
      return Boolean(a) && a!.provenance === 'USER_VERIFIED' && /^(yes|true|complete)$/i.test(a!.value.trim());
    },
  );

  const yearsRaw = (vault.get('EXPERIENCE.YEARS')?.value ?? '').trim();
  const yearsMatch = yearsRaw.match(/\d+(?:\.\d+)?/);
  const yearsExperience = yearsMatch ? Number(yearsMatch[0]) : null;

  const edu = (resume?.education ?? [])[0];
  const degreeText = `${edu?.degree ?? ''} ${edu?.field ?? ''}`.toLowerCase();
  const degreeLevel: DerivedFacts['degreeLevel'] = /ph\.?d|doctor/i.test(degreeText)
    ? 'doctorate'
    : /master|m\.?s\.?|m\.?tech|mba/i.test(degreeText)
      ? 'masters'
      : /bachelor|b\.?s\.?|b\.?tech|b\.?e\.?/i.test(degreeText)
        ? 'bachelors'
        : 'none';

  return {
    country,
    employers,
    historyComplete: complete,
    discoverySource,
    yearsExperience,
    city: (vault.get('PROFILE.CITY')?.value ?? '').trim(),
    state: (vault.get('PROFILE.STATE')?.value ?? '').trim(),
    degreeLevel,
    degreeField: degreeText.trim(),
  };
}

/** Country names and the shorthands boards actually use for them. */
const ALIASES: Record<string, string[]> = {
  'united states': ['united states', 'usa', 'u.s.', 'us', 'america', 'united states of america'],
  'united kingdom': ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'england'],
  canada: ['canada'],
  india: ['india'],
  germany: ['germany', 'deutschland'],
  france: ['france'],
  australia: ['australia'],
  ireland: ['ireland'],
  netherlands: ['netherlands', 'holland'],
  singapore: ['singapore'],
};

function sameCountry(a: string, b: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z. ]/g, '').trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;

  for (const names of Object.values(ALIASES)) {
    if (names.includes(x) && names.includes(y)) return true;
  }
  return false;
}

/**
 * "Are you currently located in <country>?" and its wordings.
 *
 * Only fires when the question names exactly one country we recognise. A
 * question listing several — "located in the US, Canada or Mexico?" — is left
 * alone, because "one of these" and "this one" are different questions and
 * getting that wrong on an application is a false statement.
 */
function locatedIn(question: string, facts: DerivedFacts): Derivation | null {
  if (!facts.country) return null;

  const m = question.match(
    /(?:currently\s+)?(?:located|residing|reside|live|living|based)\s+in\s+(?:the\s+)?([a-z .]+?)\s*\??$/i,
  );
  const named = m?.[1]?.trim();
  if (!named) return null;

  /* A list is not a single country. Refuse rather than pick one. */
  if (/\b(or|and|,)\b/i.test(named)) return null;

  const known = Object.values(ALIASES).some((names) => names.includes(named.toLowerCase()));
  if (!known) return null;

  return {
    value: sameCountry(named, facts.country) ? 'Yes' : 'No',
    basis: `Your country is ${facts.country}.`,
    rule: 'LOCATED_IN_COUNTRY',
  };
}

/**
 * "Have you previously worked at <employer>?"
 *
 * ## Why this needs an explicit assertion
 *
 * An earlier version answered No whenever the employer was absent from the
 * résumé, and that was unsound. A résumé is a curated document — it omits short
 * contracts, agency placements, vendor engagements, an internship from a decade
 * ago. "Not on the CV" and "never happened" are different claims, and deriving
 * the second from the first is inventing a candidate fact, which is the one
 * thing this whole system exists not to do.
 *
 * Worse, this particular fact is one employers act on. A No that turns out to
 * be wrong is a false statement on an application, discovered later, by them.
 *
 * So the rule now requires the candidate to have asserted that their record of
 * professional relationships is complete. Until they do, the question goes to
 * them — which is the correct outcome, not a degraded one.
 *
 * Never answers Yes. A name match could be a different company with the same
 * name, and "yes, I worked there" is theirs to state.
 */
function workedAt(question: string, facts: DerivedFacts): Derivation | null {
  /* The assertion, not the data, is what licenses a negative. */
  if (!facts.historyComplete) return null;
  if (facts.employers.length === 0) return null;

  if (!/(?:worked|been\s+employed|consulted)/i.test(question)) return null;

  /*
   * The employer follows the last preposition, and a regex is the wrong tool.
   *
   * Greenhouse asks "Have you previously worked at or consulted for GitLab?".
   * Leftmost-first matching anchors on the first "at" and a lazy group then
   * swallows "or consulted for GitLab" — the right answer by accident, with a
   * basis line naming a phrase instead of a company. Splitting on the
   * prepositions and taking the tail says what it does.
   */
  const tail = question
    .replace(/[?.!]+\s*$/, '')
    .split(/\s+(?:at|for|with|by)\s+/i)
    .pop();

  const named = (tail ?? '')
    .trim()
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/\s+(inc|llc|ltd|corp|co)\.?$/i, '');

  if (!named || named.length < 2) return null;

  const needle = named.toLowerCase();
  const overlap = facts.employers.some((e) => e.includes(needle) || needle.includes(e));
  if (overlap) return null;

  return {
    value: 'No',
    basis: `${named} appears in none of your verified work history, which you have confirmed is complete.`,
    rule: 'NOT_PREVIOUSLY_EMPLOYED',
  };
}

/**
 * "How did you hear about this job?"
 *
 * Answered from how we actually found the posting, which the ingester recorded
 * at the time. That is a fact, and it is exactly what the question asks.
 *
 * REFERRAL is never produced here. A referral is a relationship, not a URL, and
 * an employer acts on that answer — referred applications are routed to
 * different reviewers and sometimes carry a bonus for the referrer. Claiming
 * one we cannot evidence would be a lie with a beneficiary.
 *
 * A posting whose provenance was never recorded declines, rather than falling
 * back on "Company website" because it sounds harmless.
 */
const SOURCE_ANSWER: Record<string, string> = {
  COMPANY_CAREER_SITE: 'Company website',
  LINKEDIN: 'LinkedIn',
  INDEED: 'Indeed',
  GLASSDOOR: 'Glassdoor',
  ZIPRECRUITER: 'ZipRecruiter',
  MONSTER: 'Monster',
  DICE: 'Dice',
};

function heardAbout(question: string, facts: DerivedFacts): Derivation | null {
  if (
    !/how\s+did\s+you\s+(first\s+)?(hear|learn|find\s+out)\s+about|where\s+did\s+you\s+(hear|learn)\s+about/i.test(
      question,
    )
  ) {
    return null;
  }

  const answer = SOURCE_ANSWER[facts.discoverySource];
  if (!answer) return null;

  return {
    value: answer,
    basis: `This posting was found on ${answer}.`,
    rule: 'DISCOVERY_PROVENANCE',
  };
}

/**
 * "Do you have more than N years of experience?"
 *
 * ## Only ever answers No, and only in one direction
 *
 * A candidate with three years of professional experience cannot have five
 * years of anything within it, so "5+ years deploying ML models in production?"
 * is answerable as No from the total alone. That is arithmetic on a stated
 * fact, not a judgement.
 *
 * The reverse is not sound and is never attempted. Three years of industry
 * experience does not mean three years of any particular skill inside it, so a
 * Yes would be a claim about a specialisation the total says nothing about.
 * Anything that would resolve to Yes declines and goes to the candidate.
 *
 * "Less than N" is also refused. The answer turns on the same specialisation
 * the total cannot speak to, and getting it backwards on an application is a
 * false statement in the direction that flatters.
 */
function yearsOfExperience(question: string, facts: DerivedFacts): Derivation | null {
  const total = facts.yearsExperience;
  if (total == null || !Number.isFinite(total)) return null;

  /* Only the "at least N" shape. "Fewer than N" is deliberately not handled. */
  const m = question.match(
    /(?:more\s+than|at\s+least|minimum\s+of)?\s*(\d+)\s*\+?\s*years?\b/i,
  );
  const threshold = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(threshold)) return null;

  /* A "less than" question is the unsound direction. */
  if (/\b(less|fewer)\s+than\b/i.test(question)) return null;

  /* Only the No side is derivable. */
  if (total >= threshold) return null;

  return {
    value: 'No',
    basis: `You have stated ${total} years of professional experience, which is fewer than ${threshold}.`,
    rule: 'BELOW_YEARS_THRESHOLD',
  };
}

/**
 * "Do you live in the Bay Area, California, Seattle or New York?"
 *
 * A list of places is only answerable in one direction: if the candidate's own
 * city, state and country appear nowhere in it, the answer is No. A Yes would
 * need to know which entry they meant and whether "Bay Area" includes their
 * suburb, which no stated fact settles.
 */
const PLACE_QUESTION = /\b(do|are)\s+you\s+(live|living|located|based|reside|residing)\b/i;

function livesInOneOf(question: string, facts: DerivedFacts): Derivation | null {
  if (!PLACE_QUESTION.test(question)) return null;
  if (!facts.city && !facts.state) return null;

  /* Only a list. A single named place is `locatedIn`'s job, and it knows about
     country aliases this rule deliberately does not. */
  if (!/\s+or\s+|,/.test(question)) return null;

  const asked = question.toLowerCase();
  const mine = [facts.city, facts.state, facts.country].map((v) => v.toLowerCase()).filter(Boolean);

  /* Any overlap at all and we decline: a Yes is the direction that needs to
     know which entry was meant. */
  if (mine.some((place) => place.length > 2 && asked.includes(place))) return null;

  return {
    value: 'No',
    basis: `You are in ${[facts.city, facts.state].filter(Boolean).join(', ')}, which is none of the places listed.`,
    rule: 'NOT_IN_LISTED_PLACES',
  };
}

/**
 * "Do you hold a PhD in Economics?"
 *
 * Answers No when the candidate's highest qualification is below the level
 * asked for, which is decidable from the résumé. Never answers Yes: whether a
 * degree is "closely related" to a named field is a judgement, and claiming a
 * qualification is the worst thing on an application to get wrong.
 */
const DEGREE_RANK: Record<string, number> = { none: 0, bachelors: 1, masters: 2, doctorate: 3 };

function degreeBelow(question: string, facts: DerivedFacts): Derivation | null {
  if (!/\b(do\s+you\s+(hold|have)|are\s+you)\b/i.test(question)) return null;

  const wantsDoctorate = /\b(ph\.?d|doctorate|doctoral)\b/i.test(question);
  const wantsMasters = /\b(master'?s?|m\.?s\.?|graduate\s+degree)\b/i.test(question);
  if (!wantsDoctorate && !wantsMasters) return null;

  /* A question offering either level is satisfied by the lower one. */
  const needed = wantsMasters ? DEGREE_RANK.masters : DEGREE_RANK.doctorate;
  const held = DEGREE_RANK[facts.degreeLevel] ?? 0;
  if (held === 0) return null;
  if (held >= needed) return null;

  return {
    value: 'No',
    basis: `Your highest qualification is a ${facts.degreeLevel === 'masters' ? "master's" : facts.degreeLevel} degree.`,
    rule: 'DEGREE_BELOW_REQUIREMENT',
  };
}

/**
 * "Do you opt in to receive WhatsApp messages from Recruiting?"
 *
 * Answered No, and this is the one rule here that is not about the candidate at
 * all. Opting in is an action; not opting in is the absence of one, and No is
 * what leaving it alone means. Declining a marketing channel cannot misrepresent
 * anyone or cost them the application.
 *
 * Deliberately narrow: only messages *from* the employer, only opt-in wording.
 * Anything that reads as consent to processing rather than to marketing is
 * classified CONSENT_ATTESTATION long before this is reached.
 */
function marketingOptIn(question: string): Derivation | null {
  if (!/\bopt[-\s]?in\b/i.test(question)) return null;
  if (!/\b(message|text|sms|whatsapp|email|newsletter|updates|communications?)\b/i.test(question)) return null;
  /* Never touch anything that mentions the application itself. */
  if (/\b(application|candidate|privacy|data|process)\b/i.test(question)) return null;

  return {
    value: 'No',
    basis: 'Declining an optional marketing channel, which is what not opting in means.',
    rule: 'DECLINE_MARKETING_OPT_IN',
  };
}

const RULES = [
  locatedIn,
  livesInOneOf,
  workedAt,
  heardAbout,
  yearsOfExperience,
  degreeBelow,
  (q: string) => marketingOptIn(q),
];

/**
 * Derive an answer, or decline.
 *
 * Declining is the common case and the correct one: this runs only after the
 * vault has already failed to answer, so anything it cannot compute is a
 * genuine question for the candidate.
 */
export function derive(question: string, facts: DerivedFacts): Derivation | null {
  const q = question.trim();
  if (!q) return null;

  for (const rule of RULES) {
    const hit = rule(q, facts);
    if (hit) return hit;
  }
  return null;
}
