import { getProfile } from '../profile-store';
import { getCandidateProfile } from '../jobs-store';
import { getPolicy } from './policy-engine';
import { getVault } from './answer-vault';

/**
 * Is this candidate ready for Autopilot to act on their behalf?
 *
 * ## Why this exists
 *
 * Profile fields live on the `users` row and sign-up never sets a name. A
 * candidate who signed up, completed JobPilot onboarding and pressed Run got a
 * browser opened per job, a résumé tailored per job, and then every single one
 * rejected with "The form is not complete: First Name, Last Name" — a message
 * that names the symptom and hides the cause. Nothing could ever be submitted,
 * and nothing said why.
 *
 * Checked once, up front, so the answer arrives before the work rather than
 * after it, and names the thing to fix rather than the field that failed.
 */

/**
 * A machine-readable code alongside the sentence.
 *
 * The first version returned prose only, and the prose said "add it in
 * Profile" — but there is no Profile page, only a modal behind the avatar. A
 * code lets the screen offer the fix in place instead of directing someone to
 * a location that does not exist.
 */
export type ReadinessGap = {
  code: 'name' | 'surname' | 'email' | 'phone' | 'candidate' | 'resume' | 'policy' | 'work-auth';
  message: string;
};

export type Readiness = {
  ready: boolean;
  /** What to fix. Empty when ready. */
  gaps: ReadinessGap[];
};

export async function autopilotReadiness(userId: string): Promise<Readiness> {
  const [profile, candidate, policy, vault] = await Promise.all([
    getProfile(userId),
    getCandidateProfile(userId),
    getPolicy(userId),
    getVault(userId),
  ]);

  const gaps: ReadinessGap[] = [];

  /* A name is not optional. Almost every application form requires first and
     last name, so without one nothing can be submitted anywhere. It is checked
     first because it is both the most common gap and the least obvious. */
  const name = (profile?.name ?? '').trim();
  if (!name) {
    gaps.push({ code: 'name', message: 'Your full name. Applications cannot be filled without it.' });
  } else if (!name.includes(' ')) {
    /* Forms ask for the two parts separately, and splitting a single word
       gives an empty surname that fails the same way. */
    gaps.push({ code: 'surname', message: 'Your last name. Forms ask for first and last separately.' });
  }

  if (!(profile?.email ?? '').trim()) gaps.push({ code: 'email', message: 'An email address on your profile.' });
  if (!(profile?.phone ?? '').trim()) {
    gaps.push({ code: 'phone', message: 'A phone number. Many applications require one.' });
  }

  if (!candidate) gaps.push({ code: 'candidate', message: 'Your career profile. Finish JobPilot setup.' });
  else if ((candidate.resumeText ?? '').trim().length < 80) {
    gaps.push({ code: 'resume', message: 'A résumé, so applications can be tailored. Add one under Settings, Résumé.' });
  }

  if (!policy) gaps.push({ code: 'policy', message: 'An Autopilot mode. Pick one above.' });

  /*
   * Work authorisation, which is the gap this check was missing.
   *
   * Onboarding writes these two answers only when the eligibility rows carry a
   * country, and writes nothing at all when they do not -- silently, because
   * the writer skips empty values. A real account finished setup with thirteen
   * stored answers, address through security clearance, and neither of these.
   *
   * Nearly every US application asks it and marks it required, so without a
   * cleared answer every single run reached the form, filled it, and stopped at
   * "The form is not complete: Are you legally authorized to work in the US?".
   * Readiness said "ready" throughout, which is precisely the failure this
   * module was written to prevent -- naming the symptom at the form instead of
   * the cause up front.
   */
  const authorized = vault.get('WORK_AUTH.AUTHORIZED');
  if (!authorized?.autopilotOk) {
    gaps.push({
      code: 'work-auth',
      message:
        'Whether you are authorized to work, and whether you need sponsorship. Almost every application requires it, and without it each one stops at the last step.',
    });
  }

  return { ready: gaps.length === 0, gaps };
}
