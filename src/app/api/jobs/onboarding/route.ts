import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { saveAnswer, type QuestionClass } from '@/lib/autopilot/answer-vault';
import { savePolicy } from '@/lib/autopilot/policy-engine';
import { saveJobSettings } from '@/lib/job-settings';
import { saveCandidateProfile } from '@/lib/jobs-store';
import { getProfile, updateProfile } from '@/lib/profile-store';
import { getCareerLinks, saveCareerLinks } from '@/lib/career/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Persist the onboarding wizard.
 *
 * Everything the candidate typed becomes a USER_VERIFIED vault answer, which is
 * the only provenance Autopilot may act on unattended. That is the whole value
 * of the flow: answer once here, and every application asking the same question
 * in any wording fills without interrupting them again.
 */

type Yes = 'yes' | 'no' | 'prefer_not';

const YES_LABEL: Record<Yes, string> = { yes: 'Yes', no: 'No', prefer_not: 'Prefer not to say' };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  let d: Record<string, unknown>;
  try {
    d = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '');
  const yes = (k: string): Yes | null => {
    const v = d[k];
    return v === 'yes' || v === 'no' || v === 'prefer_not' ? v : null;
  };

  /* One writer for every answer, so provenance and sensitivity are never set
     inconsistently across the twenty-odd fields. */
  const put = async (intent: string, value: string, sensitivity: QuestionClass = 'NORMAL_FACT') => {
    if (!value) return;
    await saveAnswer(user.id, { intent, value, provenance: 'USER_VERIFIED', verified: true, sensitivity });
  };

  await Promise.all([
    put('PROFILE.ADDRESS', str('address')),
    put('PROFILE.CITY', str('city')),
    put('PROFILE.ZIP', str('zip')),
    put('PROFILE.STATE', str('state')),
    put('PROFILE.COUNTRY', str('country')),
    put('PROFILE.PHONE', str('phone')),
    put('PROFILE.LINKEDIN', str('linkedin')),
  ]);

  /* Work eligibility is per country. The vault is keyed by intent, so the
     country is carried in the value rather than flattened away — "Yes (United
     States)" is answerable on a US posting and visibly wrong on a German one,
     which is better than a bare "Yes" that looks right everywhere. */
  const eligibility = Array.isArray(d.eligibility) ? d.eligibility : [];
  const authLines: string[] = [];
  const sponsorLines: string[] = [];
  for (const raw of eligibility) {
    if (typeof raw !== 'object' || raw === null) continue;
    const e = raw as Record<string, unknown>;
    const country = typeof e.country === 'string' ? e.country.trim() : '';
    if (!country) continue;
    if (e.authorized === 'yes' || e.authorized === 'no') authLines.push(`${YES_LABEL[e.authorized as Yes]} (${country})`);
    if (e.sponsorship === 'yes' || e.sponsorship === 'no') sponsorLines.push(`${YES_LABEL[e.sponsorship as Yes]} (${country})`);
  }
  await put('WORK_AUTH.AUTHORIZED', authLines.join('; '));
  await put('WORK_AUTH.SPONSORSHIP', sponsorLines.join('; '));

  const yn = async (key: string, intent: string, sensitivity: QuestionClass = 'PREFERENCE') => {
    const v = yes(key);
    if (v) await put(intent, YES_LABEL[v], sensitivity);
  };

  /*
   * "Can you start immediately?" is a yes/no. "When can you start?" is a date.
   *
   * These were the same stored answer, so a form asking when the candidate
   * could start was filled with the word "Yes" - a nonsense answer that would
   * have gone out on real applications. A yes becomes the date it means; a no
   * means we do not know the date, so nothing is stored and the candidate is
   * asked once, after which the answer book has it forever.
   */
  if (yes('startNow') === 'yes') await put('LOGISTICS.START_DATE', 'Immediately', 'PREFERENCE');

  await Promise.all([
    yn('inPerson', 'LOGISTICS.ONSITE'),
    yn('relocate', 'LOGISTICS.RELOCATION'),
    yn('transport', 'LOGISTICS.TRANSPORT', 'NORMAL_FACT'),
    yn('accommodation', 'ACCOMMODATION.NEEDED', 'SENSITIVE'),
    yn('clearance', 'CLEARANCE.SECURITY', 'SENSITIVE'),
    yn('foreignTies', 'BACKGROUND.FOREIGN_TIES', 'SENSITIVE'),
  ]);

  /* Demographics are stored as one sensitive answer, and `autopilotEligible`
     already refuses to use SENSITIVE data unless it is user-verified. */
  const demo = [
    str('gender') && `Gender: ${str('gender')}`,
    str('ethnicity') && `Race/Ethnicity: ${str('ethnicity')}`,
    yes('veteran') && `Veteran: ${YES_LABEL[yes('veteran') as Yes]}`,
    yes('disability') && `Disability: ${YES_LABEL[yes('disability') as Yes]}`,
  ].filter(Boolean).join('; ');
  await put('DEMOGRAPHIC.VOLUNTARY', demo, 'SENSITIVE');

  /* Free-text notes are FREE_TEXT, which is never autopilot-eligible: prose the
     candidate wrote for one purpose should not be pasted into a form field it
     was not written for. */
  await put('PROFILE.NOTES', str('notes'), 'FREE_TEXT');

  /*
   * Two switches, not one.
   *
   * `mode` is what the engine may send. `reviewBefore` is whether it waits for
   * the candidate first. Setup used to collapse them: choosing "review before
   * submit" set MANUAL, and MANUAL means the engine never submits at all --
   * not even after the candidate presses Approve, because `canSubmit` requires
   * a non-MANUAL mode and an approval only lifts the review hold.
   *
   * So the wizard promised "pause on a review screen so you can check each
   * application before it is submitted" and then configured an account where
   * nothing could ever be submitted. Every run ended at "ready to send", which
   * is what people reported: prepared applications, forever, and no way to
   * finish them from the screen that offered to.
   *
   * SMART either way. It sends only spotless applications -- nothing with an
   * unanswered question or a dropped claim -- and the review switch decides
   * whether even those wait for a person. MANUAL stays available in Auto Apply
   * for anyone who wants the engine to prepare and never send.
   */
  await savePolicy(user.id, { mode: 'SMART' });
  await saveJobSettings(user.id, { reviewBefore: d.reviewBeforeSubmit !== false });

  /*
   * Record that setup happened.
   *
   * Everything above lands in the answer vault, which is the right home for it
   * but is not what the Jobs screen checks before deciding whether to show the
   * wizard again. Without this row the wizard reappeared on the next load with
   * every field blank, so finishing setup and never finishing setup looked
   * identical to the product. The location is carried over because the wizard
   * asked for it and job matching can use it immediately.
   */
  const place = [str('city'), str('state'), str('country')].filter(Boolean).join(', ');
  await saveCandidateProfile(user.id, {
    onboardedAt: Date.now(),
    ...(place ? { locations: [place] } : {}),
  });

  /*
   * The same answer, in the place that is actually read.
   *
   * Phone and LinkedIn were written to the answer vault and nowhere else, while
   * the readiness check reads `profile.phone` and the form fillers read the
   * career links. So a candidate typed their phone number into the setup wizard
   * and was then told, permanently, that Autopilot could not act because it did
   * not have a phone number - with no way to see that the two were different
   * fields. Storing one fact in two schemas is a design smell; consulting only
   * one of them is a bug.
   *
   * Written without overwriting anything already there: setup runs once, and an
   * account that has since corrected its number should keep the correction.
   */
  const phone = str('phone');
  const linkedin = str('linkedin');

  if (phone) {
    const current = await getProfile(user.id);
    if (!(current?.phone ?? '').trim()) await updateProfile(user.id, { phone });
  }

  if (linkedin) {
    const links = await getCareerLinks(user.id);
    if (!links.linkedin) await saveCareerLinks(user.id, { linkedin });
  }

  return NextResponse.json({ ok: true });
}
