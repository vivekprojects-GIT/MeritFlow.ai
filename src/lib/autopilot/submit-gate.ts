import type { Provenance, ResolvedAnswer } from './answer-vault';

/**
 * The last thing between a filled form and a real employer.
 *
 * ## Why this is its own function
 *
 * The decision to send used to be a boolean expression spread across the
 * workflow — eight `&&` terms, some of them reading state a hundred lines
 * above. Every one was correct, and the shape was still wrong: nobody could
 * read the expression and say what it guaranteed, a new condition went in
 * wherever it fit, and a condition that stopped holding failed silently
 * because nothing named it.
 *
 * So the gate is one pure function over explicit inputs. It names every
 * condition, evaluates all of them rather than short-circuiting, and returns
 * the ones that failed. A run that does not submit can then say precisely why,
 * and a condition that is missing is visible as a missing line rather than as
 * an absence nobody notices.
 *
 * ## Pure, and unreachable from a model
 *
 * Nothing here calls a model, and nothing a model produced is trusted as a
 * verdict. Generated text arrives as *data* that earlier stages already
 * checked — a tailored résumé that passed the evidence check, prose whose
 * sentences were verified — and this function only asks whether those checks
 * ran and passed. There is deliberately no input by which a confident-sounding
 * answer could authorise its own submission.
 *
 * ## Failing closed
 *
 * Every condition is expressed as something that must be *true* to send.
 * Missing information is therefore a refusal, not a pass: an empty answers
 * list, an absent verifier, a validation result nobody filled in. The
 * expensive failure is sending something wrong under someone's name; the cheap
 * failure is not sending and saying so.
 */

/** One requirement, and whether this application meets it. */
export type GateCondition = {
  /** Stable identifier, for tests and for the audit trail. */
  code: string;
  /** What the candidate is told when this is the reason nothing was sent. */
  requirement: string;
  passed: boolean;
  /** Present only when it failed: what specifically was wrong. */
  detail?: string;
};

export type GateResult = {
  cleared: boolean;
  conditions: GateCondition[];
  /** The failed ones, in declaration order. */
  failed: GateCondition[];
  /** A sentence naming why nothing was sent, or '' when cleared. */
  reason: string;
};

export type GateInput = {
  /** This ATS path has been reviewed and approved for real submission. */
  executionPermitted: boolean;
  /** The adapter for this destination can actually submit. */
  adapterCanSubmit: boolean;

  /** Candidate's policy allows unattended sending at all. */
  autoSubmitEnabled: boolean;
  modeAllowsSend: boolean;
  notHeldForReview: boolean;

  /** Eligibility, computed upstream: fit, age, track, location, salary. */
  hardFiltersPassed: boolean;
  matchThresholdPassed: boolean;
  jobTypeAllowed: boolean;
  locationAllowed: boolean;
  salaryPolicyPassed: boolean;

  /** The document. */
  resumeAttached: boolean;
  resumeEvidenceValidated: boolean;

  /** The form. */
  formValidationPassed: boolean;
  requiredFieldsFilled: boolean;
  /** Questions the engine could not answer at all. */
  unsupportedQuestions: string[];

  /** Answers, for the provenance and consent checks. */
  answers: ResolvedAnswer[];
  /** Attestation wordings the candidate has explicitly authorised. */
  authorisedAttestations: Set<string>;

  /** Nothing already sent for this employer and role. */
  noDuplicateApplication: boolean;

  /** Human challenges, checked again immediately before sending. */
  noInteractiveCaptcha: boolean;
  noUnresolvedMfa: boolean;
};

/**
 * Provenances that count as a verified origin for a factual answer.
 *
 * `MODEL_GENERATED` is deliberately absent. Prose written from evidence is
 * allowed on the form — it is checked sentence by sentence where it is
 * produced — but it is never a *fact*, and a factual field carrying it means
 * something has gone wrong further up.
 */
const VERIFIED_PROVENANCE: ReadonlySet<Provenance> = new Set<Provenance>([
  'USER_VERIFIED',
  'PROFILE_DERIVED',
  'RESUME_EVIDENCE',
  /* Computed from a verified fact by a stated rule. Typed against the union
     rather than written as a loose string: this set had 'RULE_DERIVED' in it,
     which is not a provenance that exists, so every rule-derived answer failed
     the check and blocked submission. A plain Set<string> accepted the typo
     silently. */
  'DERIVED',
]);

/**
 * Answers that are prose rather than a fact, and are judged differently.
 *
 * `FREE_TEXT` is the vault's class for an essay; a textarea is the form's own
 * signal for the same thing. Either is enough, because a page that asks for a
 * paragraph in a text input is common and the provenance rule below should not
 * reject it for that.
 */
function isProse(a: ResolvedAnswer): boolean {
  return a.sensitivity === 'FREE_TEXT' || a.question.kind === 'textarea';
}

export function checkSubmitGate(input: GateInput): GateResult {
  const filled = input.answers.filter((a) => a.value && !a.blockedReason);

  /*
   * Every factual answer traces to something verified.
   *
   * The check that catches a whole class of error at once: whatever went wrong
   * upstream, a value on its way to an employer either has a recorded origin or
   * it does not, and one without is a fact nobody can account for.
   */
  const unprovenanced = filled.filter(
    (a) => !isProse(a) && !VERIFIED_PROVENANCE.has(a.provenance as Provenance),
  );

  /*
   * Every attestation on the form was authorised for its exact wording.
   *
   * Checked here as well as in the verifier, because this is the function that
   * actually gates the click and it should not depend on another component
   * having remembered.
   */
  const unauthorisedAttestations = input.answers.filter(
    (a) => a.sensitivity === 'LEGAL_ATTESTATION' && !input.authorisedAttestations.has(a.question.label),
  );

  const conditions: GateCondition[] = [
    {
      code: 'EXECUTION_APPROVED',
      requirement: 'This ATS path is approved for real submission',
      passed: input.executionPermitted,
      detail: 'This destination has not been reviewed for unattended sending.',
    },
    {
      code: 'ADAPTER_CAN_SUBMIT',
      requirement: 'The adapter for this destination can submit',
      passed: input.adapterCanSubmit,
      detail: 'No submit implementation for this destination.',
    },
    {
      code: 'AUTO_SUBMIT_ON',
      requirement: 'You have auto-submit switched on',
      passed: input.autoSubmitEnabled,
      detail: 'Auto-submit is off, so this was prepared and not sent.',
    },
    {
      code: 'MODE_ALLOWS',
      requirement: 'Your Autopilot mode allows sending this one',
      passed: input.modeAllowsSend,
      detail: 'Smart mode sends only a spotless application, and this one is not.',
    },
    {
      code: 'NOT_HELD_FOR_REVIEW',
      requirement: 'This is not waiting for your review',
      passed: input.notHeldForReview,
      detail: 'Review-before-send is on and you have not approved this one.',
    },
    {
      code: 'HARD_FILTERS',
      requirement: 'Eligibility filters passed',
      passed: input.hardFiltersPassed,
      detail: 'This posting fails one of your hard filters.',
    },
    {
      code: 'MATCH_THRESHOLD',
      requirement: 'Fit clears the bar for this posting at its age',
      passed: input.matchThresholdPassed,
      detail: 'The fit score is below what this posting needs at its age.',
    },
    {
      code: 'JOB_TYPE',
      requirement: 'The employment type is one you accept',
      passed: input.jobTypeAllowed,
      detail: 'This is not an employment type you have said yes to.',
    },
    {
      code: 'LOCATION',
      requirement: 'The location is one you accept',
      passed: input.locationAllowed,
      detail: 'This location is outside what you have said yes to.',
    },
    {
      code: 'SALARY',
      requirement: 'Compensation clears your minimum',
      passed: input.salaryPolicyPassed,
      detail: 'The stated compensation is below your minimum.',
    },
    {
      code: 'RESUME_ATTACHED',
      requirement: 'The correct résumé file is attached',
      passed: input.resumeAttached,
      detail: 'No résumé file was attached, and an empty CV field is worse than not applying.',
    },
    {
      code: 'RESUME_EVIDENCE',
      requirement: "The résumé's claims are supported by your own history",
      passed: input.resumeEvidenceValidated,
      detail: 'The tailored résumé makes a claim your history does not support.',
    },
    {
      code: 'FORM_VALIDATION',
      requirement: 'The form itself validates',
      passed: input.formValidationPassed,
      detail: 'The form reports its own validation errors.',
    },
    {
      code: 'REQUIRED_FIELDS',
      requirement: 'Every required field is filled',
      passed: input.requiredFieldsFilled,
      detail: 'A required field on this form is still empty.',
    },
    {
      code: 'NO_UNSUPPORTED_QUESTIONS',
      requirement: 'No question was left unanswered',
      passed: input.unsupportedQuestions.length === 0,
      detail:
        input.unsupportedQuestions.length > 0
          ? `${input.unsupportedQuestions.length} question(s) could not be answered: ${input.unsupportedQuestions[0].slice(0, 80)}`
          : undefined,
    },
    {
      code: 'ANSWER_PROVENANCE',
      requirement: 'Every factual answer traces to something you verified',
      passed: unprovenanced.length === 0,
      detail:
        unprovenanced.length > 0
          ? `${unprovenanced.length} answer(s) have no verified origin: ${unprovenanced[0].question.label.slice(0, 70)}`
          : undefined,
    },
    {
      code: 'CONSENT_AUTHORISED',
      requirement: 'Every legal attestation was authorised by you',
      passed: unauthorisedAttestations.length === 0,
      detail:
        unauthorisedAttestations.length > 0
          ? `${unauthorisedAttestations.length} attestation(s) you have not authorised: ${unauthorisedAttestations[0].question.label.slice(0, 70)}`
          : undefined,
    },
    {
      code: 'NO_DUPLICATE',
      requirement: 'No application already sent for this role',
      passed: input.noDuplicateApplication,
      detail: 'An application for this employer and role has already gone out.',
    },
    {
      code: 'NO_CAPTCHA',
      requirement: 'No CAPTCHA requiring a person',
      passed: input.noInteractiveCaptcha,
      detail: 'This form shows a CAPTCHA, which is never solved or bypassed.',
    },
    {
      code: 'NO_MFA',
      requirement: 'No unresolved multi-factor step',
      passed: input.noUnresolvedMfa,
      detail: 'This form is behind a verification step only you can complete.',
    },
  ];

  const failed = conditions.filter((c) => !c.passed);

  return {
    cleared: failed.length === 0,
    conditions,
    failed,
    reason: failed.length === 0 ? '' : (failed[0].detail ?? failed[0].requirement),
  };
}
