import { scoreJob, type CandidateProfile, type Job } from '../jobs-store';
import { judgeAge } from './job-age';
import { judgeExperience } from './experience-fit';
import { judgeRoleFit } from './role-fit';
import { judgeGeography } from './work-geography';
import { resolveExecutionPolicy, detectAts, mayAutoSubmit, mayDriveBrowser } from './execution-policy';
import type { AutopilotPolicy } from './policy-engine';

/**
 * Why this job was, or was not, applied to.
 *
 * ## The gap this fills
 *
 * Every gate in this system already computes a reason. `judgeAge` explains its
 * band, `judgeExperience` names the shortfall, the submit gate lists every
 * condition it checked. All of it was being thrown away: a batch ended with
 * "Nothing clears the fit each posting needs at its age" and a candidate could
 * not tell whether that meant one job missed by a point or a thousand were
 * decades stale.
 *
 * A single aggregate sentence is the wrong shape for a decision made
 * per-posting. This assembles the per-posting version — an ordered list of
 * every gate a job met, ending at the one that stopped it — so the answer to
 * "why didn't you apply to this?" is a specific sentence about that job rather
 * than a summary about the batch.
 *
 * ## Ordered, and it stops where the engine stopped
 *
 * The steps run in the same order the runner and workflow use, and the trace
 * ends at the first failure — because that is what actually happened. Showing
 * later gates as passed or failed would be inventing a result for work that was
 * never done.
 *
 * ## Selection only
 *
 * This covers the decisions made before a browser opens: is this job worth the
 * attempt, and is this destination one we may act on. What happens after the
 * form loads is recorded on the receipt and the submit gate, which have their
 * own reasons and are joined onto this trace by the caller.
 */

export type TraceStep = {
  /** Stable identifier for the gate. */
  code: string;
  /** What this gate asks, in the candidate's terms. */
  gate: string;
  passed: boolean;
  /** Why it passed or failed, specific to this posting. */
  reason: string;
};

export type JobDecision = {
  jobId: string;
  company: string;
  title: string;
  url: string;
  score: number;
  steps: TraceStep[];
  /** True when every selection gate passed and the job reached the queue. */
  reachedQueue: boolean;
  /** The gate that stopped it, or null when it reached the queue. */
  stoppedAt: TraceStep | null;
};

export function traceJobDecision(input: {
  job: Job;
  candidate: CandidateProfile;
  policy: AutopilotPolicy;
  candidateYears: number | null;
  /** Where the candidate may work, e.g. "United States". */
  authorisedCountry?: string | null;
  /** Jobs with a run already recorded, so a repeat is reported as such. */
  alreadyHandled?: boolean;
  now?: number;
}): JobDecision {
  const { job, candidate, policy, candidateYears } = input;
  const now = input.now ?? Date.now();
  const steps: TraceStep[] = [];

  const score = scoreJob(candidate, job).score;

  /* Ordered exactly as the runner evaluates them. */

  if (input.alreadyHandled) {
    steps.push({
      code: 'ALREADY_HANDLED',
      gate: 'Not applied to before',
      passed: false,
      reason: 'There is already a run for this posting, so it is not attempted again.',
    });
    return { ...summary(job, score, steps), score };
  }
  steps.push({
    code: 'ALREADY_HANDLED',
    gate: 'Not applied to before',
    passed: true,
    reason: 'No previous run for this posting.',
  });

  const age = judgeAge(
    { postedAt: job.postedAt, detectedAt: job.detectedAt, score, floor: policy.minScore, escalateWithAge: policy.ageEscalation },
    now,
  );
  steps.push({
    code: 'AGE_AND_FIT',
    gate: 'Fit clears the bar for this posting at its age',
    passed: age.applies,
    /* `judgeAge` already writes the sentence, and it names both numbers: the
       band's requirement and what this posting actually scored. */
    reason: age.reason ?? `${score}% fit.`,
  });
  if (!age.applies) return { ...summary(job, score, steps), score };

  const geography = judgeGeography({ location: job.location, authorised: input.authorisedCountry ?? null });
  steps.push({
    code: 'WORK_GEOGRAPHY',
    gate: 'You may legally work where this role is',
    passed: geography.applies,
    reason: geography.reason,
  });
  if (!geography.applies) return { ...summary(job, score, steps), score };

  const role = judgeRoleFit({ title: job.title, targetRoles: candidate.targetRoles });
  steps.push({
    code: 'DISCIPLINE',
    gate: 'The role is the kind of work you want',
    passed: role.applies,
    reason: role.reason,
  });
  if (!role.applies) return { ...summary(job, score, steps), score };

  const seniority = judgeExperience({ title: job.title, description: job.description, candidateYears });
  steps.push({
    code: 'SENIORITY',
    gate: 'The role is not far above your experience',
    passed: seniority.applies,
    reason: seniority.reason,
  });
  if (!seniority.applies) return { ...summary(job, score, steps), score };

  const { ats, employerDomain } = detectAts(job.url);
  const mechanism = ats === 'greenhouse' ? 'api' : 'browser';
  const execution = resolveExecutionPolicy({ ats, employerDomain, mechanism });

  steps.push({
    code: 'DESTINATION_READABLE',
    gate: 'This destination may be opened',
    passed: mayDriveBrowser(execution),
    reason: mayDriveBrowser(execution)
      ? `${ats} is approved for automated reading.`
      : `${ats} is not approved for automation: ${execution.rationale}`,
  });
  if (!mayDriveBrowser(execution)) return { ...summary(job, score, steps), score };

  steps.push({
    code: 'DESTINATION_SUBMITTABLE',
    gate: 'This destination may be submitted to',
    passed: mayAutoSubmit(execution),
    reason: mayAutoSubmit(execution)
      ? `${ats} is approved for unattended submission.`
      : `${ats} can be prepared but not sent unattended: ${execution.rationale}`,
  });

  /*
   * A destination that can be read but not submitted to still reaches the
   * queue: preparing the application is useful on its own, and the submit gate
   * makes the final call with the form in front of it.
   */
  return { ...summary(job, score, steps), score };
}

function summary(job: Job, score: number, steps: TraceStep[]) {
  const stoppedAt = steps.find((s) => !s.passed) ?? null;
  return {
    jobId: job.id,
    company: job.company,
    title: job.title,
    url: job.url,
    score,
    steps,
    reachedQueue: stoppedAt === null,
    stoppedAt,
  };
}

/**
 * Why a whole corpus produced the queue it did.
 *
 * Counts each gate's rejections so the aggregate answer names the cause rather
 * than the symptom: "1,852 postings were too old for their fit" is actionable,
 * "nothing clears the bar" is not.
 */
export function summariseDecisions(decisions: JobDecision[]): {
  reachedQueue: number;
  byGate: { code: string; gate: string; rejected: number; example: string }[];
} {
  const byGate = new Map<string, { gate: string; rejected: number; example: string }>();

  for (const d of decisions) {
    if (!d.stoppedAt) continue;
    const cur = byGate.get(d.stoppedAt.code) ?? { gate: d.stoppedAt.gate, rejected: 0, example: '' };
    cur.rejected += 1;
    if (!cur.example) cur.example = `${d.company} — ${d.stoppedAt.reason}`;
    byGate.set(d.stoppedAt.code, cur);
  }

  return {
    reachedQueue: decisions.filter((d) => d.reachedQueue).length,
    byGate: [...byGate.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.rejected - a.rejected),
  };
}
