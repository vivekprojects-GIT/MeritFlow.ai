import type { CandidateProfile, Job } from '../jobs-store';
import { judgeAge } from './job-age';
import type { AutopilotPolicy } from './policy-engine';
import { mayAutoSubmit, type PolicyRecord } from './execution-policy';
import type { ResolvedAnswer } from './answer-vault';

/**
 * The Verifier — the boundary Autopilot cannot cross without passing.
 *
 * The single most important property here is that **a model's confidence never
 * authorizes anything**. Every gate below is a deterministic check over
 * structured data: eligibility, policy, evidence, completeness, provenance,
 * execution status. `confidence` is reported because it is useful to a human
 * reading a receipt, but `safe_to_continue` is computed from the blocking
 * reasons, not from the number.
 *
 * That distinction is the whole design. A language model asked "is this safe to
 * submit?" will answer 0.97 with cheerful consistency, including when a résumé
 * asserts a skill the candidate has never demonstrated. So it is not asked.
 */

export type BlockingReason = {
  code:
    | 'ELIGIBILITY'
    | 'TRACK'
    | 'POLICY'
    | 'SCORE'
    | 'UNSUPPORTED_CLAIM'
    | 'MISSING_FIELD'
    | 'UNKNOWN_ANSWER'
    | 'CONTRADICTION'
    | 'LEGAL_ATTESTATION'
    | 'SENSITIVE'
    | 'EXECUTION_POLICY'
    | 'LIMIT';
  message: string;
  /** What the candidate would have to do, when they can do something. */
  userAction?: string;
};

export type VerifierResult = {
  eligibilityPass: boolean;
  resumeClaimsVerified: boolean;
  requiredFieldsComplete: boolean;
  unknownAnswers: string[];
  contradictions: string[];
  legalAttestations: string[];
  unsupportedClaims: string[];
  unresolvedFields: string[];
  /** Reported for humans. Never the thing that authorizes submission. */
  confidence: number;
  /** May the workflow proceed past preparation at all? */
  safeToContinue: boolean;
  /** May it submit unattended? Requires safeToContinue AND an approved path. */
  autopilotAllowed: boolean;
  blocking: BlockingReason[];
  requiredUserActions: string[];
};

export type VerifierInput = {
  job: Job;
  candidate: CandidateProfile;
  policy: AutopilotPolicy;
  execution: PolicyRecord;
  score: number;
  answers: ResolvedAnswer[];
  /** Claims the tailored résumé makes, for checking against evidence. */
  resumeClaims: string[];
  /** Applications already sent today / to this company, for limit checks. */
  counts: { today: number; company: number; active: number };
  /**
   * Attestation wordings the candidate has explicitly authorised, checked
   * against the authorisation store before this call.
   *
   * Passed in rather than looked up because verification is synchronous and
   * deliberately so: it is a pure judgement over facts already gathered, which
   * is what makes it testable without a database.
   *
   * An empty set is the safe default — every attestation blocks.
   */
  authorisedAttestations?: Set<string>;
};

const DAY = 86_400_000;

export function verify(input: VerifierInput): VerifierResult {
  const { job, candidate, policy, execution, score, answers, resumeClaims, counts } = input;
  const authorised = input.authorisedAttestations ?? new Set<string>();
  const blocking: BlockingReason[] = [];
  const userActions: string[] = [];

  /* ── 1. Eligibility ─────────────────────────────────────────────────── */

  /*
   * Age and fit, judged together.
   *
   * A single cutoff was wrong in both directions: at seven days it refused
   * excellent matches a fortnight old, and widened to thirty it would spend the
   * daily allowance on month-old listings with hundreds of applicants already.
   * Age is a discount, not a boundary — the bar rises as a posting ages until
   * no score is high enough.
   */
  const age = judgeAge(
    { postedAt: job.postedAt, detectedAt: job.detectedAt, score, floor: policy.minScore, escalateWithAge: policy.ageEscalation },
    Date.now(),
  );
  const ageHours = age.ageHours;
  if (!age.applies) {
    blocking.push({ code: 'ELIGIBILITY', message: age.reason });
  }

  /* ── 2. Career track ────────────────────────────────────────────────── */

  if (policy.tracks.length > 0 && !policy.tracks.includes(job.track)) {
    blocking.push({ code: 'TRACK', message: `${job.track.replace('_', ' ')} is not one of your selected tracks.` });
  }

  /* ── 3. User policy ─────────────────────────────────────────────────── */

  if (policy.minComp != null && job.minComp != null && job.minComp < policy.minComp) {
    blocking.push({ code: 'POLICY', message: `Pays from $${job.minComp.toLocaleString()}; your floor is $${policy.minComp.toLocaleString()}.` });
  }
  /*
   * Location, which the policy has always carried and nothing has ever read.
   *
   * `policy.locations` is set from the setup wizard and was stored, displayed,
   * and then ignored by every gate — so a candidate who said "Austin or remote"
   * had applications prepared for onsite roles in another state, with no
   * indication that the preference existed. A stored preference that changes
   * nothing is worse than an absent one.
   *
   * Remote always passes: a remote role is in every location the candidate
   * named, and rejecting it for not naming one of them is the wrong reading of
   * a location list.
   */
  if (policy.locations.length > 0 && !job.remote && job.location.trim()) {
    const where = job.location.toLowerCase();
    const wanted = policy.locations.some((l) =>
      l
        .toLowerCase()
        .split(/[,/]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 2)
        .some((part) => where.includes(part)),
    );
    if (!wanted) {
      blocking.push({
        code: 'POLICY',
        message: `${job.location} is not one of your locations, and this role is not remote.`,
      });
    }
  }

  /*
   * Employment type, where the posting states one.
   *
   * Read from the posting's own field rather than inferred from the title, and
   * skipped entirely when the board did not say — an absent value is not
   * evidence of a part-time role.
   */
  if (!policy.allowContract && /\b(contract|contractor|temporary|temp|freelance)\b/i.test(job.employment)) {
    blocking.push({ code: 'POLICY', message: `This is listed as ${job.employment.trim()}, and contract roles are off.` });
  }

  if (!policy.allowContract && job.track === 'contract') {
    blocking.push({ code: 'POLICY', message: 'Contract roles are switched off in your policy.' });
  }
  /* The banded check above already applies the candidate's floor, raised for
     older postings. Repeating it here would report one problem twice. */
  if (age.applies && score < policy.minScore) {
    blocking.push({ code: 'SCORE', message: `Fit ${score} is below your ${policy.minScore}-point minimum.` });
  }

  /* ── 4. Limits ──────────────────────────────────────────────────────── */

  /* The per-day and per-company limits were removed. They blocked runs for
     reasons the candidate never set and could not see; the plan allowance and
     the active-application cap are the two that mean something. */
  if (counts.active >= policy.maxActive) {
    blocking.push({ code: 'LIMIT', message: `You have ${counts.active} active applications; your cap is ${policy.maxActive}.` });
  }

  /* ── 5. Résumé claims against evidence ──────────────────────────────── */

  /* Evidence is the candidate's own résumé text and confirmed skills. A claim
     the tailored résumé makes that appears nowhere in that corpus is a claim
     the system invented, and it must never be submitted under their name. */
  const evidence = `${candidate.resumeText} ${candidate.skills.join(' ')}`.toLowerCase();
  const unsupportedClaims = resumeClaims.filter((claim) => {
    const words = claim.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 3);
    if (words.length === 0) return false;
    const hits = words.filter((w) => evidence.includes(w)).length;
    /* Most of a claim must be traceable, not merely a word or two of it. */
    return hits / words.length < 0.6;
  });
  if (unsupportedClaims.length > 0) {
    blocking.push({
      code: 'UNSUPPORTED_CLAIM',
      message: `${unsupportedClaims.length} résumé claim(s) are not backed by your evidence.`,
      userAction: 'Confirm or remove these claims.',
    });
    userActions.push('Review résumé claims that are not supported by your uploaded evidence.');
  }

  /* ── 6. Answers: completeness, unknowns, attestations ───────────────── */

  const unknownAnswers: string[] = [];
  const legalAttestations: string[] = [];
  const unresolvedFields: string[] = [];

  for (const a of answers) {
    if (a.sensitivity === 'LEGAL_ATTESTATION') {
      /*
       * An attestation the candidate has authorised is not a blocker.
       *
       * This used to block unconditionally, which meant a candidate could grant
       * permission for a privacy acknowledgement, watch the form tick it, and
       * still have the run stop -- the fill path consulted the authorisation
       * store and the verifier did not, so the two disagreed about the same
       * checkbox. Every application carrying a privacy notice, which is very
       * nearly all of them, ended one step short of sending.
       *
       * What has not changed is what can be authorised. Arbitration
       * agreements, background-check consent, binding releases, non-competes
       * and IP assignment cannot be granted class-wide at all, so they can
       * never arrive here pre-cleared, whatever this check says.
       */
      if (!authorised.has(a.question.label)) legalAttestations.push(a.question.label);
      continue;
    }
    if (a.blockedReason) {
      if (a.intent == null) unknownAnswers.push(a.question.label);
      else unresolvedFields.push(`${a.intent} — ${a.blockedReason}`);
    }
  }

  /*
   * A file upload has no vault answer and never will — the résumé is attached
   * as a file by the adapter, not answered as a question. Counting it here
   * blocked every form with a required CV field, which is very nearly every
   * real application: the run reported "1 required field has no answer" and
   * stopped, while the résumé was in fact ready to attach.
   *
   * Legal attestations are excluded for the opposite reason: they are
   * deliberately never auto-answered, and are surfaced as a user action below.
   */
  const missingRequired = answers.filter(
    (a) => a.question.required && !a.value && a.sensitivity !== 'LEGAL_ATTESTATION' && a.question.kind !== 'file',
  );
  if (missingRequired.length > 0) {
    blocking.push({
      code: 'MISSING_FIELD',
      message: `${missingRequired.length} required field(s) have no answer.`,
      userAction: 'Answer them once and they will be reused.',
    });
    userActions.push(...missingRequired.map((a) => a.question.label));
  }
  if (unknownAnswers.length > 0) {
    blocking.push({
      code: 'UNKNOWN_ANSWER',
      message: `${unknownAnswers.length} question(s) are not recognised.`,
      userAction: 'Answer them once; equivalent questions will fill automatically after that.',
    });
  }
  if (legalAttestations.length > 0) {
    blocking.push({
      code: 'LEGAL_ATTESTATION',
      message: `${legalAttestations.length} attestation(s) require you personally.`,
      userAction: 'Only you can agree to these.',
    });
    userActions.push(...legalAttestations);
  }

  /* ── 7. Contradictions ──────────────────────────────────────────────── */

  const contradictions: string[] = [];
  const byIntent = new Map(answers.filter((a) => a.intent).map((a) => [a.intent as string, a]));
  const auth = byIntent.get('WORK_AUTH.AUTHORIZED')?.value?.toLowerCase();
  const spon = byIntent.get('WORK_AUTH.SPONSORSHIP')?.value?.toLowerCase();
  if (auth && spon && /^(no|false)/.test(auth) && /^(no|false)/.test(spon)) {
    contradictions.push('Not authorized to work and not requiring sponsorship cannot both be true.');
  }
  const expected = Number((byIntent.get('COMPENSATION.EXPECTED')?.value ?? '').replace(/[^0-9]/g, ''));
  if (policy.minComp != null && expected > 0 && expected < policy.minComp) {
    contradictions.push(`Stated expectation $${expected.toLocaleString()} is below your own floor of $${policy.minComp.toLocaleString()}.`);
  }
  if (contradictions.length > 0) {
    blocking.push({ code: 'CONTRADICTION', message: contradictions[0], userAction: 'Resolve before applying.' });
  }

  /* ── 8. Execution policy ────────────────────────────────────────────── */

  const executionOk = mayAutoSubmit(execution);
  if (!executionOk) {
    blocking.push({ code: 'EXECUTION_POLICY', message: execution.rationale });
  }

  /* ── Verdict ────────────────────────────────────────────────────────── */

  /* Preparation may continue past everything except a claim we cannot stand
     behind — there is no value in preparing an application built on one. */
  const hardStop = blocking.some((b) => b.code === 'UNSUPPORTED_CLAIM' || b.code === 'CONTRADICTION');
  const safeToContinue = !hardStop;

  /* Unattended submission needs every gate clean *and* an approved path. */
  const autopilotAllowed = blocking.length === 0 && executionOk;

  /* Reported, not decisive: the share of gates that passed. */
  const totalGates = 8;
  const distinctFailures = new Set(blocking.map((b) => b.code)).size;
  const confidence = Math.max(0, Math.round(((totalGates - distinctFailures) / totalGates) * 100) / 100);

  return {
    eligibilityPass: !blocking.some((b) => b.code === 'ELIGIBILITY' || b.code === 'TRACK'),
    resumeClaimsVerified: unsupportedClaims.length === 0,
    requiredFieldsComplete: missingRequired.length === 0,
    unknownAnswers,
    contradictions,
    legalAttestations,
    unsupportedClaims,
    unresolvedFields,
    confidence,
    safeToContinue,
    autopilotAllowed,
    blocking,
    requiredUserActions: [...new Set(userActions)],
  };
}

/** Human-readable "why skipped?" — the first blocking reason, in plain words. */
export function explain(result: VerifierResult): string {
  if (result.autopilotAllowed) return 'All checks passed.';
  const first = result.blocking[0];
  return first ? first.message : 'Held for review.';
}

export const VERIFIER_GATES = [
  'eligibility',
  'career track',
  'user policy',
  'limits',
  'résumé evidence',
  'answer completeness',
  'contradictions',
  'execution policy',
] as const;

export { DAY };
