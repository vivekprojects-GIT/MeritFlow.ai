import { describe, it, expect } from 'vitest';
import { checkSubmitGate, type GateInput } from './submit-gate';
import type { ResolvedAnswer } from './answer-vault';

/**
 * The gate must fail closed on every condition independently.
 *
 * A test per condition looks repetitive and is the point: the failure this
 * guards against is one term quietly stopping being checked, which no
 * aggregate test would catch.
 */

function answer(over: Partial<ResolvedAnswer> = {}): ResolvedAnswer {
  return {
    question: { id: 'q', label: 'City', kind: 'text', required: true },
    intent: 'PROFILE.CITY',
    sensitivity: 'NORMAL_FACT',
    value: 'Dallas',
    provenance: 'USER_VERIFIED',
    blockedReason: null,
    ...over,
  } as ResolvedAnswer;
}

/** Everything true — the only shape that may send. */
function clean(over: Partial<GateInput> = {}): GateInput {
  return {
    executionPermitted: true,
    adapterCanSubmit: true,
    autoSubmitEnabled: true,
    modeAllowsSend: true,
    notHeldForReview: true,
    hardFiltersPassed: true,
    matchThresholdPassed: true,
    jobTypeAllowed: true,
    locationAllowed: true,
    salaryPolicyPassed: true,
    resumeAttached: true,
    resumeEvidenceValidated: true,
    formValidationPassed: true,
    requiredFieldsFilled: true,
    unsupportedQuestions: [],
    answers: [answer()],
    authorisedAttestations: new Set<string>(),
    noDuplicateApplication: true,
    noInteractiveCaptcha: true,
    noUnresolvedMfa: true,
    ...over,
  };
}

describe('the submit gate', () => {
  it('clears only when everything holds', () => {
    const r = checkSubmitGate(clean());
    expect(r.cleared).toBe(true);
    expect(r.failed).toHaveLength(0);
    expect(r.reason).toBe('');
  });

  /* Each boolean, flipped on its own. */
  const flags: (keyof GateInput)[] = [
    'executionPermitted',
    'adapterCanSubmit',
    'autoSubmitEnabled',
    'modeAllowsSend',
    'notHeldForReview',
    'hardFiltersPassed',
    'matchThresholdPassed',
    'jobTypeAllowed',
    'locationAllowed',
    'salaryPolicyPassed',
    'resumeAttached',
    'resumeEvidenceValidated',
    'formValidationPassed',
    'requiredFieldsFilled',
    'noDuplicateApplication',
    'noInteractiveCaptcha',
    'noUnresolvedMfa',
  ];

  for (const flag of flags) {
    it(`refuses when ${flag} is false`, () => {
      const r = checkSubmitGate(clean({ [flag]: false } as Partial<GateInput>));
      expect(r.cleared).toBe(false);
      expect(r.reason).not.toBe('');
    });
  }

  it('refuses an unanswered question', () => {
    const r = checkSubmitGate(clean({ unsupportedQuestions: ['Describe a Kubernetes migration you led'] }));
    expect(r.cleared).toBe(false);
    expect(r.failed.some((c) => c.code === 'NO_UNSUPPORTED_QUESTIONS')).toBe(true);
  });

  /* The class-catching condition: a value with no accountable origin. */
  it('refuses a factual answer with no provenance', () => {
    const r = checkSubmitGate(clean({ answers: [answer({ provenance: null })] }));
    expect(r.cleared).toBe(false);
    expect(r.failed.some((c) => c.code === 'ANSWER_PROVENANCE')).toBe(true);
  });

  it('accepts an answer a stated rule computed', () => {
    /* 'DERIVED' is the real name of that provenance. The set once held
       'RULE_DERIVED', which is not a provenance at all, and every derived
       answer was refused. */
    expect(checkSubmitGate(clean({ answers: [answer({ provenance: 'DERIVED' })] })).cleared).toBe(true);
  });

  it('refuses a factual answer a model produced', () => {
    const r = checkSubmitGate(clean({ answers: [answer({ provenance: 'MODEL_GENERATED' as never })] }));
    expect(r.cleared).toBe(false);
    expect(r.failed.some((c) => c.code === 'ANSWER_PROVENANCE')).toBe(true);
  });

  /* Prose is judged where it is written, not here. */
  it('allows evidence-checked prose in a textarea', () => {
    const prose = answer({
      question: { id: 'q2', label: 'Why this team?', kind: 'textarea', required: true } as ResolvedAnswer['question'],
      sensitivity: 'FREE_TEXT' as ResolvedAnswer['sensitivity'],
      provenance: 'DERIVED' as never,
      value: 'I have built ranking systems in Python.',
    });
    expect(checkSubmitGate(clean({ answers: [answer(), prose] })).cleared).toBe(true);
  });

  it('refuses an attestation that was never authorised', () => {
    const att = answer({
      question: { id: 'q3', label: 'I agree to arbitration', kind: 'boolean', required: true } as ResolvedAnswer['question'],
      sensitivity: 'LEGAL_ATTESTATION' as ResolvedAnswer['sensitivity'],
      value: 'Yes',
    });
    const r = checkSubmitGate(clean({ answers: [att] }));
    expect(r.cleared).toBe(false);
    expect(r.failed.some((c) => c.code === 'CONSENT_AUTHORISED')).toBe(true);
  });

  it('allows an attestation authorised for its exact wording', () => {
    const label = 'I acknowledge the Candidate Privacy Policy';
    const att = answer({
      question: { id: 'q3', label, kind: 'boolean', required: true } as ResolvedAnswer['question'],
      sensitivity: 'LEGAL_ATTESTATION' as ResolvedAnswer['sensitivity'],
      value: 'Yes',
    });
    expect(checkSubmitGate(clean({ answers: [att], authorisedAttestations: new Set([label]) })).cleared).toBe(true);
  });

  /* Every condition is evaluated, so a run can report all of them at once
     rather than one per re-run. */
  it('reports every failure, not just the first', () => {
    const r = checkSubmitGate(clean({ resumeAttached: false, noInteractiveCaptcha: false, salaryPolicyPassed: false }));
    expect(r.failed).toHaveLength(3);
  });

  it('names every condition it checked', () => {
    expect(checkSubmitGate(clean()).conditions.length).toBe(20);
  });
});
