/**
 * Whether the candidate may legally take a job where it is located.
 *
 * ## What this caught
 *
 * A live run reached a Lever form for a role in Canada and stopped at "Please
 * share your eligibility status to work in Canada — Citizen / Permanent
 * Resident / Open Work Permit / Closed Work Permit / Other". That refusal was
 * correct: the candidate is authorised in the United States, "Citizen" would be
 * false and "Other" would be a guess.
 *
 * But it happened at the last possible moment, after a browser had opened, a
 * résumé had been tailored and a form had been filled. A quarter of the corpus
 * — 475 of 2,017 postings — was in that category. The work was always going to
 * be thrown away.
 *
 * ## Why this is not the location preference
 *
 * The scorer already knows where a candidate wants to work, and treats it as a
 * preference that trades against other factors. Legal authorisation is not a
 * preference and does not trade: a candidate who would happily relocate to
 * Toronto still cannot accept the job without a permit, and no amount of fit
 * changes that.
 *
 * ## Unstated is not rejected
 *
 * A posting whose location names no country, or which is simply "Remote", goes
 * through. Plenty of remote roles are open to anyone authorised anywhere, the
 * form asks when it matters, and the authorisation question is answered from
 * verified facts or refused there. This gate exists to skip the cases that are
 * *knowably* wrong, not to guess at the ambiguous ones.
 */

export type GeographyVerdict = {
  applies: boolean;
  /** The country the posting names, or null when it does not name one. */
  postingCountry: string | null;
  reason: string;
};

/**
 * Country names and the obvious cities and regions that imply them.
 *
 * Cities are included because job locations are written for humans: "Toronto"
 * and "Bengaluru" name a country as clearly as "Canada" does, and a list that
 * only matched country names would pass most of what it exists to catch.
 */
const COUNTRIES: [string, RegExp][] = [
  ['United States', /\b(united states|u\.?s\.?a?\b|usa)\b|\b(new york|san francisco|seattle|austin|boston|chicago|denver|atlanta|dallas|los angeles|washington,? d\.?c\.?)\b|\b[A-Z]{2}, (US|USA)\b/i],
  /* Accented spellings included: the stored location was "Montréal" and an
     unaccented pattern let a Canadian role through to a US-only candidate. */
  ['Canada', /\bcanada\b|\b(toronto|vancouver|montr[eé]al|ottawa|calgary|ontario|qu[eé]bec|british columbia|alberta)\b/i],
  ['India', /\bindia\b|\b(bengaluru|bangalore|hyderabad|mumbai|pune|chennai|delhi|gurgaon|noida)\b/i],
  ['Brazil', /\bbrazil\b|\bbrasil\b|\b(sao paulo|são paulo|rio de janeiro|belo horizonte|campinas)\b/i],
  ['United Kingdom', /\b(united kingdom|u\.?k\.?)\b|\b(london|manchester|edinburgh|cambridge, uk)\b/i],
  ['Germany', /\bgermany\b|\b(berlin|munich|münchen|hamburg|frankfurt)\b/i],
  ['Poland', /\bpoland\b|\b(warsaw|krakow|kraków|wroclaw|gdansk)\b/i],
  ['Ireland', /\bireland\b|\bdublin\b/i],
  ['Australia', /\baustralia\b|\b(sydney|melbourne|brisbane|perth)\b/i],
  ['Singapore', /\bsingapore\b/i],
  ['Netherlands', /\bnetherlands\b|\bamsterdam\b/i],
  ['France', /\bfrance\b|\bparis\b/i],
  ['Spain', /\bspain\b|\b(madrid|barcelona)\b/i],
  ['Mexico', /\bmexico\b|\b(mexico city|guadalajara|monterrey)\b/i],
  ['Japan', /\bjapan\b|\btokyo\b/i],
  ['Israel', /\bisrael\b|\btel aviv\b/i],
];

/** Which country a posting's location names, or null. */
export function countryOf(location: string): string | null {
  const text = location.trim();
  if (!text) return null;
  for (const [name, pattern] of COUNTRIES) {
    if (pattern.test(text)) return name;
  }
  return null;
}

/**
 * The country a stored work-authorisation answer refers to.
 *
 * The vault writes these as "Yes (United States)" — the answer and the country
 * it applies to, kept together precisely so a later reader can tell *where* the
 * candidate is authorised rather than only that they are.
 */
export function authorisedCountry(workAuthValue: string | undefined, profileCountry?: string): string | null {
  const inBrackets = workAuthValue?.match(/\(([^)]+)\)/)?.[1]?.trim();
  const candidate = inBrackets || profileCountry?.trim() || '';
  if (!candidate) return null;
  return countryOf(candidate) ?? candidate;
}

export function judgeGeography(input: {
  location: string;
  /** Where the candidate is authorised to work, e.g. "United States". */
  authorised: string | null;
  /** True when the posting is remote and names no country. */
}): GeographyVerdict {
  const postingCountry = countryOf(input.location);

  if (!input.authorised) {
    return {
      applies: true,
      postingCountry,
      reason: 'Your work authorisation is not recorded, so this was judged on fit alone.',
    };
  }

  if (postingCountry === null) {
    return {
      applies: true,
      postingCountry,
      reason: 'This posting does not name a country, so the form is asked when it matters.',
    };
  }

  if (postingCountry === input.authorised) {
    return { applies: true, postingCountry, reason: `In ${postingCountry}, where you are authorised to work.` };
  }

  return {
    applies: false,
    postingCountry,
    reason: `This role is in ${postingCountry} and you are authorised to work in ${input.authorised}.`,
  };
}
