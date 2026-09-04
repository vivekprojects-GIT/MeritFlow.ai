/**
 * Matching a stored answer to the options a dropdown actually offers.
 *
 * ## The mismatch this exists for
 *
 * The vault stores work eligibility as `"Yes (United States)"` — deliberately,
 * so a US answer is visibly not a German one. Application forms offer `Yes`
 * and `No`. Playwright's `selectOption` matches exactly, so the stored answer
 * matched neither and every dropdown on every form came back as "Autopilot
 * could not type into this field". A real account, correctly onboarded, could
 * not complete a single application because of it.
 *
 * ## Why it refuses rather than guesses
 *
 * This picks the value that goes onto someone's job application. A wrong
 * dropdown is not a cosmetic error — answering "No" to work authorisation, or
 * "Yes" to needing sponsorship, is a materially false statement about the
 * candidate that they then have to explain.
 *
 * So every rule below is exact-by-construction, and anything ambiguous returns
 * null. Null is not a failure: it becomes an unanswered question the candidate
 * resolves once, which is the correct outcome for a form this cannot read.
 */

export type SelectOption = { label: string; value: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The answer with any parenthetical or trailing qualifier removed.
 *
 * `"Yes (United States)"` becomes `"yes"`; `"No — I do not require sponsorship"`
 * becomes `"no"`. Only the leading clause is kept, because that is the part a
 * two-option dropdown is asking about.
 */
function head(answer: string): string {
  return norm(answer.split(/[(—–\-,;:]/)[0]);
}

/** Options whose label or value equals `want`, deduplicated by value. */
function exact(options: SelectOption[], want: string): SelectOption[] {
  const hits = options.filter((o) => norm(o.label) === want || norm(o.value) === want);
  return hits.filter((o, i) => hits.findIndex((x) => x.value === o.value) === i);
}

/**
 * Pick the option that matches a stored answer, or null when unsure.
 *
 * Tried in descending order of certainty. A placeholder — an option with an
 * empty value, which is the "Please choose" row — is never selectable.
 */
export function chooseOption(answer: string, options: SelectOption[]): SelectOption | null {
  const real = options.filter((o) => o.value.trim() !== '' && o.label.trim() !== '');
  if (real.length === 0 || !answer.trim()) return null;

  /* 1. The answer as given. */
  const whole = exact(real, norm(answer));
  if (whole.length === 1) return whole[0];

  /* 2. The answer with its qualifier stripped: "Yes (United States)" → "Yes". */
  const lead = head(answer);
  const byHead = exact(real, lead);
  if (byHead.length === 1) return byHead[0];

  /*
   * 3. An option that begins with the answer's leading clause, when exactly
   *    one does. This catches "Yes" against "Yes, I am authorized" without
   *    catching "No" against "No, but I will require sponsorship" — the
   *    uniqueness requirement is what makes it safe, since a yes/no pair
   *    where both options start with the same word is genuinely ambiguous
   *    and gets refused.
   */
  if (lead) {
    const starts = real.filter((o) => norm(o.label).startsWith(lead) || norm(o.value).startsWith(lead));
    const unique = starts.filter((o, i) => starts.findIndex((x) => x.value === o.value) === i);
    if (unique.length === 1) return unique[0];
  }

  /* Anything else is a guess, and a guess here is a false statement. */
  return null;
}
