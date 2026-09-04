import { getVault } from './answer-vault';
import { getPolicy } from './policy-engine';
import { getCandidateProfile } from '../jobs-store';
import { getProfile } from '../profile-store';
import { listAuthorizations } from './authorization';
import { seedFromResume } from './answer-vault';
import { activeResume } from '../jobs/documents';

/**
 * Everything the engine needs before it can apply without stopping to ask.
 *
 * ## The problem this names
 *
 * Autopilot's interruptions are almost never bugs. A run parks because a form
 * asked something true about the candidate that nobody had ever recorded, and
 * the system will not invent it. That is the correct behaviour and a terrible
 * experience, because the candidate meets it one question at a time, mid-run,
 * with no way to see how many more are coming.
 *
 * Turning that around is the whole point of this file: gather the questions
 * employers actually ask into one list, show which are already answered, and
 * let the candidate fill the rest in one sitting. After that, running is
 * uneventful.
 *
 * ## Derived is shown, not hidden
 *
 * Anything readable from the résumé is filled in and marked as needing a look
 * rather than needing an answer. The distinction matters: a parsed employer
 * name is a good guess about a fact the candidate is going to be held to, and
 * confirming it takes a second where typing it takes a minute. Nothing derived
 * is treated as verified until the candidate says so — the vault records the
 * difference, and the submit gate reads it.
 *
 * ## Why the list is grouped by consequence
 *
 * Not by which form field it fills. A missing phone number is an inconvenience;
 * a missing work-authorisation answer stops every application in the country;
 * a legal attestation is not a fact at all and lives in a different store on
 * purpose. Sorting by what happens when it is absent is what makes the page
 * worth reading top to bottom.
 */

export type FactStatus =
  /** Recorded and confirmed by the candidate. Usable unattended. */
  | 'VERIFIED'
  /** Read from the résumé or profile, and waiting for a glance. */
  | 'NEEDS_REVIEW'
  /** Nothing recorded. This is what stops applications. */
  | 'MISSING';

export type FactGroup =
  | 'IDENTITY'
  | 'CONTACT'
  | 'LOCATION'
  | 'ELIGIBILITY'
  | 'PREFERENCES'
  | 'HISTORY'
  | 'VOLUNTARY'
  | 'AUTHORIZATION';

export type ReadinessFact = {
  /** The vault intent, or a synthetic key for things kept elsewhere. */
  key: string;
  label: string;
  group: FactGroup;
  status: FactStatus;
  /** What is currently recorded, for display. Never a guess. */
  value: string | null;
  /**
   * Whether an application can proceed without this.
   *
   * `blocking` facts are asked by nearly every employer; `optional` ones are
   * asked by some, and their absence costs a few postings rather than all of
   * them. Both are worth filling; only one is worth interrupting a candidate
   * for.
   */
  importance: 'blocking' | 'optional';
  /** Why this is asked, in the candidate's terms. */
  why: string;
};

export type CandidateReadiness = {
  /** 0-100, over blocking facts only. Optional ones do not hold anyone back. */
  percent: number;
  ready: boolean;
  facts: ReadinessFact[];
  counts: { verified: number; needsReview: number; missing: number; blockingMissing: number };
};

/** The catalogue. One row per thing an employer asks that we can hold an answer to. */
const REQUIRED: { key: string; label: string; group: FactGroup; importance: 'blocking' | 'optional'; why: string }[] = [
  { key: 'PROFILE.FIRST_NAME', label: 'Legal first name', group: 'IDENTITY', importance: 'blocking', why: 'On every application form.' },
  { key: 'PROFILE.LAST_NAME', label: 'Legal last name', group: 'IDENTITY', importance: 'blocking', why: 'On every application form.' },
  { key: 'PROFILE.FULL_NAME', label: 'Full name', group: 'IDENTITY', importance: 'blocking', why: 'Some forms ask for one field rather than two.' },
  { key: 'PROFILE.PREFERRED_NAME', label: 'Preferred name', group: 'IDENTITY', importance: 'optional', why: 'Asked when it may differ from your legal name.' },
  { key: 'PROFILE.PRONOUNS', label: 'Pronouns', group: 'IDENTITY', importance: 'optional', why: 'Optional on most forms.' },

  { key: 'PROFILE.EMAIL', label: 'Email', group: 'CONTACT', importance: 'blocking', why: 'Where employers reply.' },
  { key: 'PROFILE.PHONE', label: 'Phone', group: 'CONTACT', importance: 'blocking', why: 'Required on nearly every form.' },
  { key: 'PROFILE.LINKEDIN', label: 'LinkedIn URL', group: 'CONTACT', importance: 'blocking', why: 'Asked by most technical employers.' },
  { key: 'PROFILE.GITHUB', label: 'GitHub URL', group: 'CONTACT', importance: 'optional', why: 'Asked by engineering teams.' },
  { key: 'PROFILE.PORTFOLIO', label: 'Portfolio URL', group: 'CONTACT', importance: 'optional', why: 'Asked for design and research roles.' },
  { key: 'PROFILE.WEBSITE', label: 'Personal site', group: 'CONTACT', importance: 'optional', why: 'Occasionally asked.' },

  { key: 'PROFILE.ADDRESS', label: 'Street address', group: 'LOCATION', importance: 'optional', why: 'Asked by employers running background checks.' },
  { key: 'PROFILE.CITY', label: 'City', group: 'LOCATION', importance: 'blocking', why: 'Asked on most forms.' },
  { key: 'PROFILE.STATE', label: 'State or province', group: 'LOCATION', importance: 'blocking', why: 'Asked on most US forms.' },
  { key: 'PROFILE.ZIP', label: 'ZIP or postcode', group: 'LOCATION', importance: 'optional', why: 'Asked alongside a street address.' },
  { key: 'PROFILE.COUNTRY', label: 'Country', group: 'LOCATION', importance: 'blocking', why: 'Determines which work-authorisation answer applies.' },

  { key: 'WORK_AUTH.AUTHORIZED', label: 'Authorised to work', group: 'ELIGIBILITY', importance: 'blocking', why: 'Asked on virtually every application, and never guessed at.' },
  { key: 'WORK_AUTH.SPONSORSHIP', label: 'Will need sponsorship', group: 'ELIGIBILITY', importance: 'blocking', why: 'The opposite-polarity twin of the question above. Getting these backwards is consequential.' },
  { key: 'LANGUAGE.PROFICIENCY', label: 'English proficiency', group: 'ELIGIBILITY', importance: 'blocking', why: 'Asked constantly by employers hiring across borders.' },
  { key: 'CLEARANCE.SECURITY', label: 'Security clearance', group: 'ELIGIBILITY', importance: 'optional', why: 'Asked by defence and government contractors.' },
  { key: 'EXPERIENCE.YEARS', label: 'Total years of experience', group: 'ELIGIBILITY', importance: 'blocking', why: 'Asked directly, and used to skip roles far above your level.' },

  { key: 'EMPLOYMENT.TYPE', label: 'Employment type', group: 'PREFERENCES', importance: 'blocking', why: 'Full-time, contract, or both.' },
  { key: 'LOGISTICS.REMOTE_INTENT', label: 'Open to remote', group: 'PREFERENCES', importance: 'blocking', why: 'Asked as a work-style preference.' },
  { key: 'LOGISTICS.ONSITE', label: 'Open to on-site', group: 'PREFERENCES', importance: 'blocking', why: 'Asked as a work-style preference.' },
  { key: 'LOGISTICS.RELOCATION', label: 'Willing to relocate', group: 'PREFERENCES', importance: 'blocking', why: 'Asked whenever the role is not remote.' },
  { key: 'LOGISTICS.TRANSPORT', label: 'Reliable transport', group: 'PREFERENCES', importance: 'optional', why: 'Asked for on-site and field roles.' },
  { key: 'LOGISTICS.START_DATE', label: 'Availability', group: 'PREFERENCES', importance: 'blocking', why: 'Asked on most forms as a start date or notice period.' },
  { key: 'COMPENSATION.EXPECTED', label: 'Expected compensation', group: 'PREFERENCES', importance: 'blocking', why: 'Asked as a required field on many forms.' },

  { key: 'HISTORY.CURRENT_EMPLOYER', label: 'Current employer', group: 'HISTORY', importance: 'blocking', why: 'Readable from your résumé; confirm before it is sent.' },
  { key: 'HISTORY.CURRENT_TITLE', label: 'Current title', group: 'HISTORY', importance: 'blocking', why: 'Readable from your résumé; confirm before it is sent.' },
  { key: 'EDUCATION.SCHOOL', label: 'School', group: 'HISTORY', importance: 'blocking', why: 'Readable from your résumé; confirm before it is sent.' },
  { key: 'EDUCATION.DEGREE', label: 'Degree', group: 'HISTORY', importance: 'blocking', why: 'Readable from your résumé; confirm before it is sent.' },
  { key: 'EDUCATION.GRADUATION', label: 'Graduation year', group: 'HISTORY', importance: 'optional', why: 'Asked on forms with a structured education section.' },
  {
    key: 'HISTORY.EMPLOYMENT_COMPLETE',
    label: 'Employment history is complete',
    group: 'HISTORY',
    importance: 'blocking',
    why: 'Without this, "have you worked here before?" cannot be answered No — an absence from a résumé is not evidence of never having worked somewhere.',
  },
  { key: 'HISTORY.CLIENTS_COMPLETE', label: 'Client list is complete', group: 'HISTORY', importance: 'optional', why: 'Same rule, for consulting engagements.' },
  { key: 'HISTORY.CONSULTING_COMPLETE', label: 'Consulting history is complete', group: 'HISTORY', importance: 'optional', why: 'Same rule, for contract work.' },
  { key: 'HISTORY.REFERRAL', label: 'Referral status', group: 'HISTORY', importance: 'optional', why: 'Never invented — usually "not referred".' },

  { key: 'DEMOGRAPHIC.VOLUNTARY', label: 'Voluntary disclosures', group: 'VOLUNTARY', importance: 'optional', why: 'Race, gender, veteran and disability questions. Declining is a valid saved answer.' },
  { key: 'ACCOMMODATION.NEEDED', label: 'Accommodation needed', group: 'VOLUNTARY', importance: 'optional', why: 'Asked alongside the disability question.' },
  { key: 'BACKGROUND.FOREIGN_TIES', label: 'Foreign ties disclosure', group: 'VOLUNTARY', importance: 'optional', why: 'Asked by cleared employers.' },
];

/** Authorisation classes worth pre-granting, and the ones that never can be. */
const AUTHORIZATIONS: { type: string; label: string; why: string }[] = [
  {
    type: 'POLICY',
    label: 'Ordinary recruiting privacy notices',
    why: 'Acknowledging that an employer will process your application. Safe to pre-authorise, and it unblocks most forms.',
  },
  {
    type: 'FUTURE_CONTACT',
    label: 'Being kept on file for future roles',
    why: 'Letting an employer contact you about other openings. Costs you nothing, asked constantly, and skipping it loses whole applications.',
  },
  {
    type: 'MARKETING',
    label: 'Recruiting newsletters and updates',
    why: 'Marketing email from employers you apply to. Optional — leave it unauthorised if you would rather not receive it.',
  },
];

export async function candidateReadiness(userId: string): Promise<CandidateReadiness> {
  const [rawVault, policy, candidate, profile, auths, resume] = await Promise.all([
    getVault(userId),
    getPolicy(userId),
    getCandidateProfile(userId),
    getProfile(userId).catch(() => null),
    listAuthorizations(userId).catch(() => []),
    activeResume(userId).catch(() => null),
  ]);

  /*
   * Fill from the résumé before judging what is missing.
   *
   * Employer, title, school and degree were all showing as MISSING while
   * sitting in plain text in the attached document — asking the candidate to
   * type facts we had already read. Seeding first turns those into "confirm",
   * which is a click rather than a form.
   *
   * `seedFromResume` never overwrites: anything the candidate stated
   * themselves outranks the parse, so confirming a value here is permanent and
   * re-reading the résumé cannot undo it.
   */
  const vault = seedFromResume(new Map(rawVault), resume);

  const facts: ReadinessFact[] = REQUIRED.map((row) => {
    const entry = vault.get(row.key);
    const value = entry?.value?.trim() || null;

    /*
     * Three states, and the middle one carries the weight.
     *
     * A value the candidate typed is verified. A value read from their résumé
     * is present and unconfirmed — usable for filling, but shown here so they
     * can correct a parse before an employer sees it.
     */
    let status: FactStatus = 'MISSING';
    if (value) status = entry?.provenance === 'USER_VERIFIED' ? 'VERIFIED' : 'NEEDS_REVIEW';

    return { ...row, status, value };
  });

  /* The résumé itself is not a vault entry, and nothing works without it. */
  facts.push({
    key: 'PROFILE.RESUME',
    label: 'Master résumé',
    group: 'IDENTITY',
    importance: 'blocking',
    why: 'Everything is tailored from this, and every claim is checked against it.',
    status: candidate?.resumeText && candidate.resumeText.length > 200 ? 'VERIFIED' : 'MISSING',
    value: candidate?.resumeName || null,
  });

  /* A salary floor lives on the policy, not the vault, because the engine
     filters on it before any form is opened. */
  facts.push({
    key: 'POLICY.MIN_COMP',
    label: 'Minimum base salary',
    group: 'PREFERENCES',
    importance: 'blocking',
    why: 'Postings below this are never opened.',
    status: policy?.minComp ? 'VERIFIED' : 'MISSING',
    value: policy?.minComp ? `$${policy.minComp.toLocaleString('en-US')}` : null,
  });

  for (const a of AUTHORIZATIONS) {
    const granted = auths.some((x) => x.type === a.type && !x.revokedAt);
    facts.push({
      key: `AUTH.${a.type}`,
      label: a.label,
      group: 'AUTHORIZATION',
      importance: 'blocking',
      why: a.why,
      status: granted ? 'VERIFIED' : 'MISSING',
      value: granted ? 'Authorised' : null,
    });
  }

  /* Contact details can also sit on the account row, and a candidate who filled
     them there should not be told they are missing. */
  const fromProfile: Record<string, string | undefined> = {
    'PROFILE.EMAIL': profile?.email,
    'PROFILE.PHONE': profile?.phone,
    /*
     * The account holds one `name`; forms want it split.
     *
     * The last token is the surname and everything before it is the given
     * name, which is the opposite of the first split this used: "Sai Vivek
     * Katkuri" became first "Sai", last "Vivek Katkuri", and went to an
     * employer that way.
     *
     * Display only -- the vault keeps whichever halves the candidate confirms,
     * and a candidate whose name does not follow this convention corrects it
     * once on the readiness screen.
     */
    'PROFILE.FIRST_NAME': profile?.name?.trim().split(/\s+/).slice(0, -1).join(' ') || profile?.name?.trim() || undefined,
    'PROFILE.LAST_NAME': (profile?.name?.trim().split(/\s+/).length ?? 0) > 1
      ? profile?.name?.trim().split(/\s+/).slice(-1)[0]
      : undefined,
    'PROFILE.FULL_NAME': profile?.name || undefined,
  };
  for (const f of facts) {
    if (f.status === 'MISSING' && fromProfile[f.key]) {
      f.status = 'NEEDS_REVIEW';
      f.value = fromProfile[f.key] ?? null;
    }
  }

  const blocking = facts.filter((f) => f.importance === 'blocking');
  const blockingSatisfied = blocking.filter((f) => f.status !== 'MISSING').length;

  return {
    percent: blocking.length === 0 ? 100 : Math.round((blockingSatisfied / blocking.length) * 100),
    ready: blockingSatisfied === blocking.length,
    facts,
    counts: {
      verified: facts.filter((f) => f.status === 'VERIFIED').length,
      needsReview: facts.filter((f) => f.status === 'NEEDS_REVIEW').length,
      missing: facts.filter((f) => f.status === 'MISSING').length,
      blockingMissing: blocking.filter((f) => f.status === 'MISSING').length,
    },
  };
}
