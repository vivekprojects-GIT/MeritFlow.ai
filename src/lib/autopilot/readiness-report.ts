import { getVault } from './answer-vault';
import { getCandidateProfile } from '../jobs-store';
import { getProfile } from '../profile-store';
import { getPolicy } from './policy-engine';
import { activeResume } from '../jobs/documents';
import { listAuthorizations } from './authorization';

/**
 * Is this candidate's record complete enough to apply on their behalf?
 *
 * ## Why a machine-readable report
 *
 * The existing readiness check answers "can Autopilot act at all" and returns
 * prose for a banner. This answers a different question — "what exactly is
 * unverified, and what would an application be missing" — and it has to be
 * checkable rather than readable, because it is the gate a submission is
 * measured against and a sentence cannot be a gate.
 *
 * ## Verified means the candidate said so
 *
 * A value present in the database is not a verified value. Every check below
 * asks for provenance, and `PROFILE_DERIVED` — a fact copied from the account —
 * counts, while `RESUME_EVIDENCE` counts only for things a résumé can actually
 * establish. Nothing counts merely because it is non-empty.
 */

export type ReadinessReport = {
  status: 'READY' | 'BLOCKED';
  candidate: { id: string; email: string; name: string };
  /** Facts an application needs that are missing or unverified. */
  unverifiedFacts: { field: string; why: string }[];
  /** Fields no adapter could fill from what we hold. */
  blockedFields: { field: string; why: string }[];
  /** Consent classes with no standing authorization. */
  blockedAuthorizations: { type: string; why: string }[];
  /** What the résumé being sent is, and where it came from. */
  resume: { name: string; parserVersion: number; traceable: boolean } | null;
  checkedAt: number;
};

type Check = { field: string; why: string };

export async function readinessReport(userId: string): Promise<ReadinessReport> {
  const [profile, candidate, policy, vault, resume, authorizations] = await Promise.all([
    getProfile(userId),
    getCandidateProfile(userId),
    getPolicy(userId),
    getVault(userId),
    activeResume(userId),
    listAuthorizations(userId),
  ]);

  const unverified: Check[] = [];
  const blocked: Check[] = [];

  /** A vault answer counts only when the candidate stands behind it. */
  const verified = (intent: string): boolean => {
    const a = vault.get(intent);
    if (!a) return false;
    return a.verified && (a.provenance === 'USER_VERIFIED' || a.provenance === 'PROFILE_DERIVED');
  };

  const need = (intent: string, field: string, why: string) => {
    if (!verified(intent)) unverified.push({ field, why });
  };

  /* Identity. Without a name nothing can be filled anywhere. */
  const name = (profile?.name ?? '').trim();
  if (!name) blocked.push({ field: 'name', why: 'No name on the account.' });
  else if (!name.includes(' ')) blocked.push({ field: 'surname', why: 'Forms ask for first and last separately.' });

  if (!(profile?.email ?? '').trim()) blocked.push({ field: 'email', why: 'No email on the account.' });
  if (!(profile?.phone ?? '').trim()) blocked.push({ field: 'phone', why: 'Most applications require one.' });

  /* Contact and location. */
  need('PROFILE.COUNTRY', 'country', 'Needed for location questions, and for deriving them.');
  need('PROFILE.CITY', 'city', 'Asked on most applications.');

  /* Work authorisation — required on nearly every US application. */
  need('WORK_AUTH.AUTHORIZED', 'work_authorization', 'Almost every application asks, and it cannot be guessed.');
  need('WORK_AUTH.SPONSORSHIP', 'sponsorship', 'Asked alongside authorisation, with opposite polarity.');

  /* Preferences the policy claims to enforce. */
  if (!policy) blocked.push({ field: 'policy', why: 'Autopilot has not been switched on.' });
  if (policy && policy.locations.length === 0 && (candidate?.locations.length ?? 0) === 0) {
    unverified.push({ field: 'location_preference', why: 'No locations set, so the location gate cannot run.' });
  }
  if (policy && policy.minComp == null) {
    unverified.push({ field: 'salary_preference', why: 'No salary floor set, so the salary gate cannot run.' });
  }

  /*
   * Employment history completeness.
   *
   * Not a nicety. Without it, every "have you worked here before" question —
   * which Greenhouse asks constantly — goes to the candidate, because a résumé
   * cannot establish a negative.
   */
  for (const [intent, field] of [
    ['HISTORY.EMPLOYMENT_COMPLETE', 'employment_history_complete'],
    ['HISTORY.CONSULTING_COMPLETE', 'consulting_history_complete'],
    ['HISTORY.CLIENTS_COMPLETE', 'client_history_complete'],
  ] as const) {
    if (!verified(intent)) {
      unverified.push({
        field,
        why: 'Until you confirm this record is complete, "have you worked here before" goes to you every time.',
      });
    }
  }

  /*
   * Education, read from the résumé rather than the vault.
   *
   * The vault only learns it during a run, when `seedFromResume` copies it
   * across — so checking the vault here reported "no school on file" for a
   * candidate whose résumé names their university, and would have gone on
   * reporting it until the first application had already run. The résumé is
   * where this fact actually lives.
   */
  const school = (resume?.education ?? [])[0]?.school?.trim() ?? '';
  if (!school && !vault.get('EDUCATION.SCHOOL')) {
    unverified.push({ field: 'education', why: 'No school found on your résumé or in your answers.' });
  }

  /* The résumé itself, and whether we can say which version went out. */
  const resumeInfo = resume
    ? {
        name: resume.contact?.name ?? name ?? 'Résumé',
        parserVersion: 0,
        traceable: true,
      }
    : null;
  if (!resume) blocked.push({ field: 'resume', why: 'No parsed résumé, so nothing can be tailored or attached.' });

  /* Consent classes with nothing standing behind them. */
  const live = authorizations.filter((a) => a.revokedAt == null && (a.expiresAt == null || a.expiresAt > Date.now()));
  const blockedAuth = live.some((a) => a.type === 'POLICY')
    ? []
    : [
        {
          type: 'POLICY',
          why: 'Privacy-policy acknowledgements appear on most Greenhouse forms and will stop each run until authorized.',
        },
      ];

  return {
    status: blocked.length === 0 && unverified.length === 0 && blockedAuth.length === 0 ? 'READY' : 'BLOCKED',
    candidate: { id: userId, email: profile?.email ?? '', name },
    unverifiedFacts: unverified,
    blockedFields: blocked,
    blockedAuthorizations: blockedAuth,
    resume: resumeInfo,
    checkedAt: Date.now(),
  };
}
