import { describe, it, expect } from 'vitest';
import { verify, type VerifierInput } from './verifier';
import { SUGGESTED } from './policy-engine';
import type { ResolvedAnswer } from './answer-vault';
import type { CandidateProfile, Job } from '../jobs-store';

/**
 * The gate that decides whether an application may be sent unattended.
 *
 * These cover one rule with two halves, and the second half is the one that
 * matters: an attestation the candidate authorised must stop blocking, and an
 * attestation they did not must keep blocking. Getting the first half without
 * the second would be an automated system agreeing to legal terms on someone's
 * behalf, which is the thing this whole path exists to prevent.
 */

const PRIVACY = 'By selecting "I agree," I understand my information will be processed per the Candidate Privacy Policy.';
const ARBITRATION = 'I agree to resolve any dispute arising from my employment through binding arbitration.';

const job: Job = {
  id: 'job-1',
  company: 'Reddit',
  title: 'Senior Machine Learning Engineer',
  location: 'Remote',
  remote: true,
  track: 'ai' as Job['track'],
  description: 'Build ranking models. 3+ years of experience.',
  skills: ['python', 'ml'],
  minComp: 180_000,
  url: 'https://boards.greenhouse.io/reddit/jobs/1',
  postedAt: Date.now() - 3_600_000,
  detectedAt: Date.now() - 3_600_000,
  discoverySource: 'COMPANY_CAREER_SITE',
  companyBlurb: '',
  seniority: 'senior',
  yearsExp: '3+',
  employment: 'full-time',
  workMode: 'remote',
  applicants: null,
};

const candidate: CandidateProfile = {
  userId: 'user-1',
  careerStage: 'mid',
  targetRoles: ['ML Engineer'],
  locations: ['Dallas'],
  tracks: [{ type: 'ai' as CandidateProfile['tracks'][number]['type'], weight: 1 }],
  skills: ['python', 'ml'],
  minComp: 100_000,
  resumeText: 'Built ranking and retrieval systems in Python.',
  resumeName: 'resume.docx',
  onboardedAt: Date.now() - 86_400_000,
};

function attestation(label: string): ResolvedAnswer {
  return {
    question: { id: 'q1', label, kind: 'boolean', required: true },
    intent: null,
    sensitivity: 'LEGAL_ATTESTATION',
    value: null,
    provenance: null,
    blockedReason: 'Only you can agree to this.',
  } as ResolvedAnswer;
}

function input(over: Partial<VerifierInput> = {}): VerifierInput {
  return {
    job,
    candidate,
    policy: { ...SUGGESTED, userId: 'user-1', updatedAt: Date.now(), minScore: 0, mode: 'FULL' },
    execution: { status: 'PERMITTED_BROWSER', rationale: 'reviewed' },
    score: 90,
    answers: [],
    resumeClaims: ['python'],
    counts: { today: 0, company: 0, active: 0 },
    ...over,
  } as VerifierInput;
}

describe('attestations and the authorisations the candidate granted', () => {
  it('blocks an attestation nobody authorised', () => {
    const r = verify(input({ answers: [attestation(PRIVACY)] }));
    expect(r.autopilotAllowed).toBe(false);
    expect(r.blocking.some((b) => b.code === 'LEGAL_ATTESTATION')).toBe(true);
    expect(r.requiredUserActions).toContain(PRIVACY);
  });

  /* The bug this file was written for: every field filled, permission granted,
     and the run still stopped one step short of sending. */
  it('does not block an attestation the candidate authorised', () => {
    const r = verify(
      input({ answers: [attestation(PRIVACY)], authorisedAttestations: new Set([PRIVACY]) }),
    );
    expect(r.blocking.some((b) => b.code === 'LEGAL_ATTESTATION')).toBe(false);
    expect(r.requiredUserActions).not.toContain(PRIVACY);
  });

  it('still blocks a second attestation that was not authorised', () => {
    const r = verify(
      input({
        answers: [attestation(PRIVACY), attestation(ARBITRATION)],
        authorisedAttestations: new Set([PRIVACY]),
      }),
    );
    expect(r.blocking.some((b) => b.code === 'LEGAL_ATTESTATION')).toBe(true);
    expect(r.requiredUserActions).toContain(ARBITRATION);
    expect(r.requiredUserActions).not.toContain(PRIVACY);
  });

  /* Authorisation is against the exact wording. A different form's checkbox is
     a different agreement, however similar it reads. */
  it('does not treat a near-identical wording as authorised', () => {
    const nearly = PRIVACY.replace('Candidate Privacy Policy', 'Applicant Privacy Notice');
    const r = verify(
      input({ answers: [attestation(nearly)], authorisedAttestations: new Set([PRIVACY]) }),
    );
    expect(r.blocking.some((b) => b.code === 'LEGAL_ATTESTATION')).toBe(true);
  });

  it('blocks everything when no authorisations are passed at all', () => {
    const r = verify(input({ answers: [attestation(PRIVACY)] }));
    expect(r.autopilotAllowed).toBe(false);
  });
});
