/**
 * How old a posting may be, and what it has to be worth at that age.
 *
 * ## Why a single cutoff was wrong in both directions
 *
 * `maxJobAgeHours` was one number, and every posting past it was refused
 * regardless of fit. Set at seven days it held excellent matches that were
 * merely a fortnight old; widened to thirty it would spend the daily allowance
 * on month-old listings that have had hundreds of applicants since.
 *
 * Age is not a hard boundary, it is a discount. An older posting is worth
 * applying to only if it is better than the ones arriving today, so the bar
 * rises as the posting ages and eventually there is no score high enough.
 */

export type AgeBand = {
  /** Postings up to this age fall in this band. */
  maxHours: number;
  /** Fit required to apply at this age. */
  minScore: number;
  /** Added to the score for ranking. Never used to pass a threshold. */
  recencyBonus: number;
  label: string;
};

/**
 * Bands, youngest first.
 *
 * A posting matches the first band it fits inside; anything past the last one
 * is skipped, which is the default rather than an accident.
 */
export const AGE_BANDS: AgeBand[] = [
  { maxHours: 24, minScore: 70, recencyBonus: 10, label: 'posted today' },
  { maxHours: 3 * 24, minScore: 70, recencyBonus: 8, label: 'posted in the last three days' },
  { maxHours: 7 * 24, minScore: 75, recencyBonus: 5, label: 'posted this week' },
  { maxHours: 14 * 24, minScore: 80, recencyBonus: 0, label: 'a fortnight old' },
  { maxHours: 21 * 24, minScore: 88, recencyBonus: -5, label: 'three weeks old' },
  { maxHours: 30 * 24, minScore: 88, recencyBonus: -10, label: 'a month old' },
];

export type AgeVerdict = {
  applies: boolean;
  ageHours: number;
  band: AgeBand | null;
  /** The score this posting must reach at its age. */
  requiredScore: number;
  /** Score adjusted for recency, for ordering the queue. */
  rankedScore: number;
  reason: string;
};

/**
 * Judge one posting by age and fit together.
 *
 * `floor` is the candidate's own minimum, and it is a floor rather than an
 * override: a band may demand more than they asked for, never less. Someone who
 * sets 70 is saying "nothing below 70", not "70 is enough at any age".
 */
export function judgeAge(
  input: {
    postedAt: number | null;
    detectedAt: number;
    score: number;
    floor: number;
    /**
     * Let the bands raise the requirement as a posting ages. Default true.
     *
     * False means the candidate's floor is the whole test, whatever the age.
     */
    escalateWithAge?: boolean;
  },
  now = Date.now(),
): AgeVerdict {
  /* `postedAt` is what the board said and is often missing or rounded to the
     day; `detectedAt` is when we first saw it and always exists. Falling back
     keeps a posting with no stated date from being treated as ancient. */
  const at = input.postedAt || input.detectedAt || 0;
  const ageHours = at ? (now - at) / 3_600_000 : 0;

  const band = AGE_BANDS.find((b) => ageHours <= b.maxHours) ?? null;

  /*
   * Past the last band, and what that means depends on the setting.
   *
   * With escalation on, a month is the end: the bar has been climbing and now
   * nothing clears it. With escalation off the candidate has said their own
   * floor applies at any age, and a hard cutoff a few lines later contradicts
   * that in the same breath -- which it did, refusing the only CAPTCHA-free
   * boards available on a corpus where everything younger was gated.
   *
   * The recency penalty still applies, so an old posting sorts last. It is
   * simply no longer refused outright.
   */
  if (!band) {
    if (input.escalateWithAge === false) {
      const clears = input.score >= input.floor;
      return {
        applies: clears,
        ageHours,
        band: null,
        requiredScore: input.floor,
        rankedScore: input.score - 15,
        reason: clears
          ? `${input.score}% fit, and posted ${Math.round(ageHours / 24)} days ago — your floor applies at any age.`
          : `${input.score}% fit, below your floor of ${input.floor}%.`,
      };
    }
    return {
      applies: false,
      ageHours,
      band: null,
      requiredScore: Number.POSITIVE_INFINITY,
      rankedScore: input.score - 15,
      reason: `Posted ${Math.round(ageHours / 24)} days ago. Nothing over a month is worth an application.`,
    };
  }

  /*
   * Whether age raises the bar, or only orders the queue.
   *
   * Escalation assumes an old posting is a worse bet, which is true on average
   * and useless when it removes every posting a candidate can actually reach.
   * With most boards behind a CAPTCHA, the reachable ones are older by the time
   * they surface, and a rising bar refused all of them.
   *
   * Off, the candidate's own floor stands at any age and the recency bonus
   * below still ranks fresh postings first — so the effect is on *what is
   * eligible*, never on what is preferred.
   */
  const requiredScore = input.escalateWithAge === false ? input.floor : Math.max(band.minScore, input.floor);
  const rankedScore = input.score + band.recencyBonus;

  if (input.score < requiredScore) {
    return {
      applies: false,
      ageHours,
      band,
      requiredScore,
      rankedScore,
      reason: `${input.score}% fit, and something ${band.label} needs ${requiredScore}%.`,
    };
  }

  return {
    applies: true,
    ageHours,
    band,
    requiredScore,
    rankedScore,
    reason: `${input.score}% fit, ${band.label}.`,
  };
}
