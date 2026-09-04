import { getPolicy } from './policy-engine';
import { judgeAge } from './job-age';
import { judgeExperience } from './experience-fit';
import { judgeRoleFit } from './role-fit';
import { judgeGeography, authorisedCountry } from './work-geography';
import { getVault } from './answer-vault';
import { getCandidateProfile, listJobs, scoreJob, type Job } from '../jobs-store';
import { getJobSettings } from '../job-settings';
import { runDryRun, type DryRunOutcome } from './workflow';
import { logEvent, listRuns } from './state-machine';
import { autopilotReadiness } from './readiness';
import { getUsage, recordUsage } from '../jobs/usage';

/**
 * The batch runner.
 *
 * Autopilot previously required a click per job, which is not autopilot. This
 * walks the queue: picks what clears the policy, runs each one to completion,
 * and stops when a cap is reached.
 *
 * ## Sequential, deliberately
 *
 * Each run drives a real browser and touches a real employer's site. Running
 * them in parallel would multiply load on someone else's infrastructure for no
 * benefit to the candidate, and would make the per-day and per-company caps
 * racy — two concurrent runs both reading "4 sent today" against a limit of 5
 * would both proceed. One at a time keeps the counters truthful.
 */

export type RunnerOutcome = {
  attempted: number;
  submitted: number;
  prepared: number;
  /** Cleared every check and waiting only on the candidate pressing send. */
  awaitingApproval: number;
  needsUser: number;
  failed: number;
  skipped: number;
  stoppedBecause: string;
  results: { jobId: string; company: string; title: string; state: string; reason: string; awaitingApproval?: boolean }[];
};

/** Hard ceiling per invocation, independent of policy. */
const MAX_PER_INVOCATION = 25;

export async function runAutopilot(
  userId: string,
  options: {
    limit?: number;
    jobIds?: string[];
    /**
     * Only consider postings first seen within this many hours.
     *
     * Set by autonomous mode, which runs unattended and every hour. Without it
     * an unattended account works backwards through a corpus of hundreds of
     * postings, most of them weeks old, spending a daily cap on roles that have
     * had a queue of applicants since before the candidate signed up. Being
     * early is most of what an automated applicant can offer.
     *
     * Not applied to a hand-picked list: a candidate who explicitly asked for a
     * particular posting has said what they want, and its age is their call.
     */
    maxAgeHours?: number;
  } = {},
): Promise<RunnerOutcome> {
  const out: RunnerOutcome = {
    attempted: 0,
    submitted: 0,
    prepared: 0,
    awaitingApproval: 0,
    needsUser: 0,
    failed: 0,
    skipped: 0,
    stoppedBecause: '',
    results: [],
  };

  const [policy, candidate, settings] = await Promise.all([
    getPolicy(userId),
    getCandidateProfile(userId),
    getJobSettings(userId),
  ]);

  /* Checked before any browser opens. Discovering a missing name after twenty
     tailored resumes and twenty page loads wastes the candidate time and the
     employers bandwidth, and buries the cause. */
  const readiness = await autopilotReadiness(userId);
  if (!readiness.ready) {
    return { ...out, stoppedBecause: `Finish these first: ${readiness.gaps.map((g) => g.message).join(' ')}` };
  }
  if (!candidate) return { ...out, stoppedBecause: 'No candidate profile yet.' };
  if (!policy) return { ...out, stoppedBecause: 'Autopilot has not been switched on.' };

  /*
   * The plan is the only ceiling.
   *
   * A per-day throttle and a per-company cap used to sit in front of it. Both
   * were inventions: the plan already says how many applications an account
   * gets, and a second limit on top of it only produced runs that stopped for
   * reasons the candidate had not chosen and could not see. What is left is the
   * allowance they are actually paying for, enforced here rather than only
   * displayed -- a counter that is shown but not enforced is a number, not a
   * limit.
   */
  const usage = await getUsage(userId);
  if (usage.exhausted) {
    return {
      ...out,
      stoppedBecause: `You have used all ${usage.limit} applications on the free plan this month. Pro removes the limit.`,
    };
  }

  const planBudget = usage.remaining ?? Number.MAX_SAFE_INTEGER;
  const limit = Math.min(options.limit ?? MAX_PER_INVOCATION, planBudget, MAX_PER_INVOCATION);

  /* Already-handled jobs are excluded up front rather than being started and
     then skipped, so a re-run does not re-open a browser per finished job. */
  const runs = await listRuns(userId, 500);
  const done = new Set(
    runs
      .filter((r) => !['DISCOVERED', 'FAILED', 'RETRYING'].includes(r.state))
      .map((r) => r.jobId),
  );

  /*
   * The whole open corpus, not a recent slice.
   *
   * This read 400 jobs, ordered by when we first detected them. With a corpus
   * of nearly two thousand that is a window, not a limit — and because the
   * ordering is by detection rather than by fit, the postings it excluded were
   * not the worst ones, just the ones found earliest. A candidate's best match
   * could sit permanently outside the window while the runner reported that
   * nothing cleared the bar.
   *
   * Scoring the full corpus is local string work over rows already in memory,
   * and the age and seniority gates cut it to a queue of tens before anything
   * opens a browser. The cap that matters is the per-run application limit,
   * which is applied further down and is the one the candidate actually set.
   */
  const all = await listJobs(5000);

  /* `postedAt` is what the board said; `detectedAt` is when we first saw it.
     Boards routinely omit or round the former, so the fallback keeps a posting
     with no stated date from being treated as infinitely old. */
  const freshEnough = (j: Job) => {
    if (!options.maxAgeHours) return true;
    const at = j.postedAt || j.detectedAt || 0;
    if (!at) return false;
    return Date.now() - at <= options.maxAgeHours * 3_600_000;
  };

  const picked = options.jobIds?.length
    ? all.filter((j) => options.jobIds!.includes(j.id))
    : all.filter((j) => !done.has(j.id) && freshEnough(j));

  /* An explicit request naming ids that are not in the corpus is a different
     failure from "nothing qualified", and saying so saves the caller checking
     their filters against a queue that never contained the job. */
  if (options.jobIds?.length && picked.length === 0) {
    return { ...out, stoppedBecause: 'None of those postings are in the open corpus.' };
  }

  /*
   * Ordered by fit adjusted for recency, filtered by what each posting needs at
   * its own age. A fresh 78% is worth more of the day's allowance than a
   * three-week-old 82%, and the old ordering could not say so.
   */
  /*
   * Seniority, which the fit score cannot see.
   *
   * Overlap scoring reads skills, so a three-year engineer and a twelve-year
   * engineer with the same toolkit score alike against a principal posting.
   * Applying anyway spends the day's budget on postings with no path to an
   * interview, which is the difference between a lot of applications and good
   * ones.
   */
  const vault = await getVault(userId);
  /* Legal authorisation is not a preference and does not trade against fit:
     a role the candidate cannot accept is not a near miss. */
  const authorised = authorisedCountry(vault.get('WORK_AUTH.AUTHORIZED')?.value, vault.get('PROFILE.COUNTRY')?.value);

  const yearsEntry = vault.get('EXPERIENCE.YEARS');
  const parsedYears = Number(String(yearsEntry?.value ?? '').match(/\d{1,2}/)?.[0]);
  const candidateYears = Number.isFinite(parsedYears) ? parsedYears : null;

  const overreach: string[] = [];
  const offTarget: string[] = [];
  const wrongCountry: string[] = [];

  const queue = picked
    .map((job) => {
      const score = scoreJob(candidate, job).score;
      const age = judgeAge(
        { postedAt: job.postedAt, detectedAt: job.detectedAt, score, floor: policy.minScore, escalateWithAge: policy.ageEscalation },
        Date.now(),
      );
      const seniority = judgeExperience(
        { title: job.title, description: job.description, candidateYears },
        undefined,
      );
      /*
       * Discipline, which the fit score cannot enforce.
       *
       * The scorer is a weighted sum, so a weak role match is paid for by
       * seniority, location and freshness: a backend platform role reached the
       * queue at 70% for an AI engineer, level with an ML role that matched
       * perfectly. Ranking may trade those off; deciding may not.
       */
      const role = judgeRoleFit({ title: job.title, targetRoles: candidate.targetRoles });
      const geography = judgeGeography({ location: job.location, authorised });
      return { job, score, age, seniority, role, geography };
    })
    .filter(({ job, age, seniority, role, geography }) => {
      if (!age.applies) return false;
      if (!geography.applies) {
        wrongCountry.push(`${job.company} — ${job.title}: ${geography.reason}`);
        return false;
      }
      if (!role.applies) {
        offTarget.push(`${job.company} — ${job.title}: ${role.reason}`);
        return false;
      }
      if (!seniority.applies) {
        overreach.push(`${job.company} — ${job.title}: ${seniority.reason}`);
        return false;
      }
      return true;
    })
    .sort((a, b) => b.age.rankedScore - a.age.rankedScore);

  /* Worth recording: a candidate seeing "nothing to apply to" deserves to know
     the postings existed and why they were passed over. */
  if (wrongCountry.length > 0) {
    await logEvent(
      userId,
      'SKIPPED',
      `${wrongCountry.length} posting${wrongCountry.length === 1 ? '' : 's'} passed over as outside where you can work.`,
      JSON.stringify(wrongCountry.slice(0, 20)),
    );
  }

  if (offTarget.length > 0) {
    await logEvent(
      userId,
      'SKIPPED',
      `${offTarget.length} posting${offTarget.length === 1 ? '' : 's'} passed over as the wrong discipline.`,
      JSON.stringify(offTarget.slice(0, 20)),
    );
  }

  if (overreach.length > 0) {
    await logEvent(
      userId,
      'SKIPPED',
      `${overreach.length} posting${overreach.length === 1 ? '' : 's'} passed over as too senior.`,
      JSON.stringify(overreach.slice(0, 20)),
    );
  }

  if (queue.length === 0) {
    const window = options.maxAgeHours ? ` posted in the last ${options.maxAgeHours} hours` : '';
    const seniority =
      overreach.length > 0 ? ` ${overreach.length} were passed over as asking for more experience than you have.` : '';
    const discipline = offTarget.length > 0 ? ` ${offTarget.length} were the wrong discipline.` : '';
    const geo = wrongCountry.length > 0 ? ` ${wrongCountry.length} were outside where you can work.` : '';
    return {
      ...out,
      stoppedBecause: `Nothing${window} clears the fit each posting needs at its age.${seniority}${discipline}${geo}`,
    };
  }

  await logEvent(
    userId,
    'QUEUED',
    `Autopilot started: ${Math.min(limit, queue.length)} jobs, ${settings.autoSubmit ? 'submitting' : 'preparing only'}.`,
  );

  for (const { job } of queue) {
    if (out.attempted >= limit) {
      out.stoppedBecause = `Reached this run's limit of ${limit}.`;
      break;
    }

    out.attempted += 1;
    let result: DryRunOutcome;
    try {
      result = await runDryRun(userId, job);
    } catch (err) {
      out.failed += 1;
      out.results.push({ ...ref(job), state: 'FAILED', reason: err instanceof Error ? err.message : 'Run failed.' });
      continue;
    }

    out.results.push({ ...ref(job), state: result.finalState, reason: result.reason, awaitingApproval: result.awaitingApproval });

    if (result.finalState === 'SUBMITTED' || result.finalState === 'CONFIRMED') {
      out.submitted += 1;
      /* Counted only when an employer actually received something. Charging
         for a prepared draft would bill people for work they still have to
         do themselves. */
      await recordUsage(userId);
    }
    else if (result.finalState === 'DRY_RUN_COMPLETE') {
      out.prepared += 1;
      if (result.awaitingApproval) out.awaitingApproval += 1;
    }
    else if (result.finalState === 'NEEDS_USER_ACTION') out.needsUser += 1;
    else if (result.finalState === 'FAILED') out.failed += 1;
    else out.skipped += 1;
  }

  if (!out.stoppedBecause) out.stoppedBecause = 'Worked through the queue.';

  await logEvent(
    userId,
    'DRY_RUN_COMPLETE',
    `Autopilot finished: ${out.submitted} sent, ${out.awaitingApproval} awaiting your approval, ${out.prepared - out.awaitingApproval} prepared, ${out.needsUser} need you, ${out.failed} failed.`,
    JSON.stringify({ stoppedBecause: out.stoppedBecause }),
  );

  return out;
}

function ref(job: Job) {
  return { jobId: job.id, company: job.company, title: job.title };
}


