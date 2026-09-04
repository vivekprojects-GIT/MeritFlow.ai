/**
 * Whether a posting is asking for more career than the candidate has.
 *
 * ## Why fit scoring does not already cover this
 *
 * The résumé scorer measures overlap: the skills, the tools, the domain. A
 * three-year engineer and a twelve-year engineer who both write Python, ship
 * services and know Kubernetes score close to identically against the same
 * posting, because the words match. Seniority is the axis that overlap cannot
 * see.
 *
 * So a "Principal ML Engineer, 10+ years" posting scores 84% for a candidate
 * with three years, clears every gate, and produces an application that was
 * never going to be read. That is not a near miss to be tolerated for volume —
 * it is the applications-per-day budget being spent on postings with no path to
 * an interview, and it is the thing that makes an automated applicant look
 * indiscriminate to the employers receiving it.
 *
 * ## Reading the requirement
 *
 * Job descriptions state experience in a dozen shapes and mean different things
 * by them. Two distinctions carry most of the accuracy:
 *
 * **Required versus preferred.** "5+ years required" and "8+ years preferred"
 * in the same posting describe one bar and one wish. Counting the wish as the
 * bar rejects postings the candidate should apply to, so a mention sitting in a
 * preferred, bonus or nice-to-have clause is not a requirement.
 *
 * **The overall bar versus the per-skill bar.** "7+ years of engineering, 2+
 * years with Go" is one seven-year role, not a two-year one. Among genuine
 * requirements the highest is the bar, because that is the one a recruiter
 * screens on.
 *
 * ## Judging it
 *
 * A year under the stated bar is not a rejection. Requirements are written
 * aspirationally, hiring managers know it, and a candidate a year short of a
 * "4+ years" posting is a normal applicant rather than a hopeless one. Several
 * years short is a different thing, and that is where this stops.
 *
 * Unstated is not the same as zero: a posting that never mentions years is
 * judged on its title instead, and a posting with neither is left to the fit
 * score, which is what already handled it.
 */

export type ExperienceRequirement = {
  /** Years the posting asks for, or null when it does not say. */
  years: number | null;
  /** Where the number came from, for the audit trail. */
  via: 'stated' | 'title' | 'none';
  /** The wording the number was read from. */
  evidence: string;
};

export type ExperienceVerdict = {
  applies: boolean;
  requirement: ExperienceRequirement;
  reason: string;
};

/**
 * How far below a stated bar is still worth applying.
 *
 * Two years. One was the first guess and it was too tight to be usable: against
 * a live corpus it left a three-year candidate with *zero* qualifying postings,
 * because the common wording for the roles they actually match is "5+ years"
 * and a two-year stretch is what candidates at that level normally make.
 *
 * Two still refuses the case this gate was built for — a three-year candidate
 * against a ten-year posting is a seven-year gap, and no tolerance in this
 * range admits it. What changed is only the ordinary stretch, which is the
 * difference between a filter and a wall.
 */
export const YEAR_TOLERANCE = 2;

/**
 * Seniority floors, for postings that name a level but never a number.
 *
 * These are the years a title implies in practice rather than by any standard —
 * deliberately conservative, because the title is weaker evidence than a stated
 * requirement and should reject less readily.
 */
const TITLE_FLOORS: [RegExp, number, string][] = [
  [/\b(chief|c[teio]o|vp|vice president|head of|director)\b/i, 12, 'an executive title'],
  [/\b(distinguished|fellow)\b/i, 12, 'a distinguished-engineer title'],
  [/\bprincipal\b/i, 10, 'a principal title'],
  [/\b(staff|architect)\b/i, 8, 'a staff title'],
  [/\b(lead|manager)\b/i, 6, 'a lead title'],
  [/\bsenior\b|\bsr\.?\b/i, 4, 'a senior title'],
];

/** Clauses that describe a wish rather than a requirement. */
const PREFERRED = /\b(preferred|preferrably|preferably|nice[- ]to[- ]have|bonus|a plus|plus if|ideally|desirable|would be great|not required)\b/i;

/**
 * Every "N years" the text states, with the sentence each sits in.
 *
 * Sentence-level context is what separates a requirement from a wish, so the
 * match and its surroundings travel together.
 */
function statedYears(text: string): { years: number; sentence: string }[] {
  const found: { years: number; sentence: string }[] = [];

  /* Sentence-ish: job descriptions are bullet lists as often as prose, so a
     newline or a bullet ends a clause just as a full stop does. */
  const clauses = text.split(/(?:[.;!?\n\r•·]|\s[-–—]\s)+/);

  for (const clause of clauses) {
    /* A range means its lower bound: "3-5 years" is open to a three-year
       candidate, and reading it as five would reject the person it was
       written for. */
    const range = /(\d{1,2})\s*(?:\+)?\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi;
    let m: RegExpExecArray | null;
    let matchedRange = false;
    while ((m = range.exec(clause)) !== null) {
      matchedRange = true;
      found.push({ years: Number(m[1]), sentence: clause });
    }
    if (matchedRange) continue;

    /*
     * A bare "N years" only counts when the clause is about experience.
     *
     * Otherwise "founded 10 years ago", "a 3 year contract" and "5 years of
     * runway" all read as requirements, and the filter starts rejecting
     * postings over the company's own history.
     */
    if (!/\b(experience|exp\b|background|working|worked|industry|professional|track record|building|developing)\b/i.test(clause)) {
      continue;
    }

    const single = /(?:minimum(?:\s+of)?|at least|over|more than)?\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi;
    while ((m = single.exec(clause)) !== null) {
      const n = Number(m[1]);
      /* Above about twenty this is a company statistic, not a requirement. */
      if (n > 0 && n <= 20) found.push({ years: n, sentence: clause });
    }
  }

  return found;
}

/** What the posting requires, reading the description first and the title second. */
export function readRequirement(title: string, description: string): ExperienceRequirement {
  const mentions = statedYears(description);
  const required = mentions.filter((m) => !PREFERRED.test(m.sentence));

  if (required.length > 0) {
    /* The highest genuine requirement is the bar: a posting wanting seven years
       overall and two with a given tool is a seven-year posting. */
    const top = required.reduce((a, b) => (b.years > a.years ? b : a));
    return { years: top.years, via: 'stated', evidence: top.sentence.trim().slice(0, 120) };
  }

  for (const [pattern, floor, label] of TITLE_FLOORS) {
    if (pattern.test(title)) return { years: floor, via: 'title', evidence: label };
  }

  return { years: null, via: 'none', evidence: '' };
}

/**
 * Whether this candidate should apply.
 *
 * `candidateYears` null means the candidate never told us, and an unknown is
 * not grounds for rejection — the fit score already judged the posting, and
 * inventing a seniority the candidate did not state would be the same error
 * this system refuses everywhere else.
 */
export function judgeExperience(
  input: { title: string; description: string; candidateYears: number | null },
  tolerance: number = YEAR_TOLERANCE,
): ExperienceVerdict {
  const requirement = readRequirement(input.title, input.description);

  if (requirement.years === null) {
    return { applies: true, requirement, reason: 'The posting does not state a seniority.' };
  }
  if (input.candidateYears === null) {
    return { applies: true, requirement, reason: 'Your years of experience are not recorded, so this was judged on fit alone.' };
  }

  const shortfall = requirement.years - input.candidateYears;
  if (shortfall <= tolerance) {
    return {
      applies: true,
      requirement,
      reason: `Asks for ${requirement.years} years; you have ${input.candidateYears}.`,
    };
  }

  const asks =
    requirement.via === 'title'
      ? `carries ${requirement.evidence}, which usually means about ${requirement.years} years`
      : `asks for ${requirement.years} years`;

  return {
    applies: false,
    requirement,
    reason: `This role ${asks} and you have ${input.candidateYears}.`,
  };
}
