/**
 * Fixtures for the visual bench.
 *
 * Shapes are copied from each route's response and each component's own payload
 * type, not invented — a fixture that drifts from the real response makes the
 * bench worse than useless, because it shows a screen that cannot happen.
 *
 * The data is deliberately *awkward* rather than tidy: a rejection in the
 * inbox, a run that needs the user, an unanswered vault question, a job with no
 * salary. Designs look fine on happy-path data and fall apart on the rows a
 * real account actually contains.
 */

const now = Date.now();
const HOUR = 3_600_000;
const DAY = 86_400_000;

/* ── Jobs, matches, tracker ──────────────────────────────────────────────── */

function job(over: Record<string, unknown> = {}) {
  return {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    company: 'Acme',
    title: 'Data Engineer',
    location: 'Plano, TX',
    remote: false,
    track: 'experienced',
    description: 'Build and operate data platforms.',
    skills: ['Python', 'SQL'],
    minComp: 140_000,
    url: 'https://boards.greenhouse.io/acme/jobs/1',
    postedAt: now - 2 * DAY,
    companyBlurb: '',
    seniority: 'Senior',
    yearsExp: '5+',
    employment: 'Full-time',
    workMode: 'Hybrid',
    applicants: 18,
    ...over,
  };
}

const parts = { skills: 26, role: 18, seniority: 13, evidence: 9, location: 8, compensation: 7, freshness: 5 };

function match(over: Record<string, unknown> = {}) {
  return { job: job(), score: 86, parts, gaps: [], state: null, ...over };
}

const MATCHES = [
  match({
    job: job({ company: 'Capital One', title: 'Senior AI Engineer', remote: true, minComp: 185_000, applicants: 7, postedAt: now - 6 * HOUR, skills: ['Python', 'LangGraph', 'AWS'] }),
    score: 94,
    gaps: [],
  }),
  match({
    job: job({ company: 'NVIDIA', title: 'ML Platform Engineer', location: 'Santa Clara, CA', minComp: 210_000, applicants: 64 }),
    score: 88,
    gaps: ['CUDA'],
  }),
  match({
    job: job({ company: 'Fifth Third Bank', title: 'Lead Data Engineer', minComp: null, applicants: null, postedAt: now - 9 * DAY }),
    score: 79,
    gaps: ['Kafka', 'Scala'],
  }),
  match({
    job: job({ company: 'Chewy', title: 'Data Engineer II', track: 'entry_level', minComp: 120_000, remote: true }),
    score: 71,
    gaps: ['dbt'],
    state: 'APPLIED',
  }),
];

const APPLICATIONS = [
  { ...match({ job: job({ company: 'Chewy', title: 'Data Engineer II' }), score: 71 }), state: 'APPLIED', createdAt: now - 5 * DAY, updatedAt: now - 5 * DAY },
  { ...match({ job: job({ company: 'Stripe', title: 'Data Engineer' }), score: 83 }), state: 'INTERVIEW', createdAt: now - 12 * DAY, updatedAt: now - DAY },
  { ...match({ job: job({ company: 'Ramp', title: 'Analytics Engineer' }), score: 68 }), state: 'REJECTED', createdAt: now - 20 * DAY, updatedAt: now - 3 * DAY },
  { ...match({ job: job({ company: 'Databricks', title: 'Solutions Engineer' }), score: 77 }), state: 'NEEDS_USER_INPUT', createdAt: now - 2 * DAY, updatedAt: now - HOUR },
];

export const JOBS = {
  hasProfile: true,
  profile: {
    userId: 'demo',
    careerStage: 'experienced',
    targetRoles: ['AI Engineer', 'Data Engineer'],
    locations: ['Plano, TX', 'Remote'],
    tracks: [{ type: 'experienced', weight: 1 }],
    skills: ['Python', 'SQL', 'LangGraph', 'Airflow'],
    minComp: 150_000,
    resumeText: 'x'.repeat(4200),
    resumeName: 'resume.pdf',
  },
  matches: MATCHES,
  applications: APPLICATIONS,
  funnel: {
    total: 4,
    byState: { APPLIED: 1, INTERVIEW: 1, REJECTED: 1, NEEDS_USER_INPUT: 1 },
    /* Percentages, matching funnelOf, which already multiplies by 100. */
    interviewRate: 25,
    meanScore: 74.75,
  },
};

/* ── Auto Apply ──────────────────────────────────────────────────────────── */

export const AUTOPILOT = {
  enabled: true,
  policy: { mode: 'SMART', minScore: 75, minComp: 150_000, maxPerDay: 10, maxPerCompany: 2, allowContract: false },
  runs: [
    { id: 'r1', jobId: 'job-a', state: 'DRY_RUN_COMPLETE', executionPolicy: 'UNREVIEWED', score: 94, blockedReason: '', attempts: 1, awaitingApproval: true, company: 'Capital One', title: 'Senior AI Engineer', jobUrl: 'https://x/1', updatedAt: now - HOUR },
    { id: 'r2', jobId: 'job-b', state: 'NEEDS_USER_ACTION', executionPolicy: 'UNREVIEWED', score: 88, blockedReason: '"Years of experience with Kubernetes" — no verified answer for this question yet.', attempts: 1, awaitingApproval: false, company: 'NVIDIA', title: 'ML Platform Engineer', jobUrl: 'https://x/2', updatedAt: now - 3 * HOUR },
    { id: 'r3', jobId: 'job-c', state: 'NEEDS_USER_ACTION', executionPolicy: 'BLOCKED', score: 81, blockedReason: "Workday's site terms prohibit accessing the site with automated scripts without consent.", attempts: 1, awaitingApproval: false, company: 'Fifth Third Bank', title: 'Lead Data Engineer', jobUrl: 'https://x/3', updatedAt: now - 5 * HOUR },
    { id: 'r4', jobId: 'job-d', state: 'SKIPPED', executionPolicy: 'UNREVIEWED', score: 44, blockedReason: 'Below your minimum match score.', attempts: 0, awaitingApproval: false, company: 'Chewy', title: 'Data Engineer II', jobUrl: 'https://x/4', updatedAt: now - DAY },
  ],
  events: [
    { id: 'e1', kind: 'DRY_RUN_COMPLETE', summary: 'Capital One — ready, waiting for your approval. Waiting for you to approve it.', detail: '', createdAt: now - HOUR },
    { id: 'e2', kind: 'NEEDS_USER_ACTION', summary: 'NVIDIA — "Years of experience with Kubernetes" needs your answer once.', detail: '', createdAt: now - 3 * HOUR },
    { id: 'e3', kind: 'PREPARING', summary: 'Fifth Third Bank — dropped 2 unsupported claims while tailoring.', detail: '', createdAt: now - 4 * HOUR },
  ],
  counts: { discovered: 4, qualified: 3, prepared: 1, dryRunComplete: 1, needsUser: 2, submitted: 0 },
  submission: { vendors: [], reviewBefore: true, autoSubmit: false, autonomous: false, lastRunAt: 0 },
  readiness: { ready: false, gaps: [{ code: 'phone', message: 'A phone number. Most application forms require one.' }] },
  usage: { used: 6, limit: 20, remaining: 14, exhausted: false, isPro: false },
};

/* ── Inbox ───────────────────────────────────────────────────────────────── */

export const INBOX = {
  messages: [
    { id: 'm1', fromName: 'Greenhouse', fromAddr: 'no-reply@greenhouse.io', subject: 'Verify your email address', preview: 'Your verification code is 448201. It expires in 10 minutes.', otp: '448201', company: 'Capital One', category: 'VERIFICATION', receivedAt: now - 20 * 60_000, forwarded: true, read: false },
    { id: 'm2', fromName: 'Stripe Recruiting', fromAddr: 'recruiting@stripe.com', subject: 'Next steps — Data Engineer', preview: 'We would love to schedule a 45 minute conversation next week.', otp: '', company: 'Stripe', category: 'INTERVIEW', receivedAt: now - 5 * HOUR, forwarded: true, read: false },
    { id: 'm3', fromName: 'Ramp', fromAddr: 'careers@ramp.com', subject: 'Your application', preview: 'After careful consideration we have decided to move forward with other candidates.', otp: '', company: 'Ramp', category: 'REJECTION', receivedAt: now - 3 * DAY, forwarded: true, read: true },
    { id: 'm4', fromName: 'HackerRank', fromAddr: 'no-reply@hackerrank.com', subject: 'Complete your assessment by Friday', preview: 'You have been invited to complete a 90 minute assessment.', otp: '', company: 'NVIDIA', category: 'ASSESSMENT', receivedAt: now - DAY, forwarded: true, read: true },
  ],
  /* Key names copied from the route, not guessed: it returns applyEmail and
     sent, and a fixture using different names silently renders the empty
     state instead of the screen being reviewed. */
  applyEmail: 'sai.apply@meritflow.mail',
  sent: [],
};

/* ── Calendar ────────────────────────────────────────────────────────────── */

export const CALENDAR = {
  interviews: [
    { id: 'i1', company: 'Stripe', title: 'Data Engineer', kind: 'INTERVIEW', startsAt: now + 2 * DAY, durationMin: 45, location: 'Google Meet', notes: 'With the platform team.', source: 'detected', confirmed: false },
    { id: 'i2', company: 'NVIDIA', title: 'ML Platform Engineer', kind: 'ASSESSMENT', startsAt: now + 4 * DAY, durationMin: 90, location: 'HackerRank', notes: '', source: 'detected', confirmed: true },
    { id: 'i3', company: 'Capital One', title: 'Senior AI Engineer', kind: 'CALL', startsAt: null, durationMin: 30, location: '', notes: 'Recruiter suggested "sometime next week".', source: 'detected', confirmed: false },
  ],
  archive: [
    { id: 'a1', company: 'Chewy', title: 'Data Engineer II', jobUrl: 'https://boards.greenhouse.io/chewy/jobs/9', jdSnapshot: 'Own the ingestion pipelines…', resumeSummary: 'Data engineer with seven years building ingestion platforms.', resumeBullets: ['Cut nightly batch runtime by 40%.'], coverLetter: 'Dear Chewy team, …', answers: [{ question: 'Are you legally authorized to work in the US?', value: 'Yes' }], ats: 'greenhouse', mode: 'DRY_RUN', reference: '', createdAt: now - 5 * DAY },
  ],
  subscribeUrl: 'http://localhost:3000/api/jobs/calendar/feed/abc123',
};

/* ── Settings ────────────────────────────────────────────────────────────── */

export const SETTINGS = {
  settings: {
    optimization: 'honest',
    autoApprove: false,
    reviewBefore: true,
    autoSubmit: false,
    publicPortfolio: false,
    emailRecs: true,
    emailProduct: false,
    timezone: 'America/Chicago',
  },
  answers: [
    { intent: 'WORK_AUTH.AUTHORIZED', value: 'Yes', provenance: 'USER_VERIFIED', verified: true, sensitivity: 'NORMAL_FACT', autopilotOk: true, updatedAt: now - 9 * DAY },
    { intent: 'WORK_AUTH.SPONSORSHIP', value: 'No', provenance: 'USER_VERIFIED', verified: true, sensitivity: 'NORMAL_FACT', autopilotOk: true, updatedAt: now - 9 * DAY },
    { intent: 'COMPENSATION.EXPECTED', value: '$165,000', provenance: 'USER_VERIFIED', verified: true, sensitivity: 'PREFERENCE', autopilotOk: true, updatedAt: now - 2 * DAY },
    { intent: 'DEMOGRAPHIC.VOLUNTARY', value: 'Prefer not to say', provenance: 'USER_VERIFIED', verified: false, sensitivity: 'SENSITIVE', autopilotOk: false, updatedAt: now - DAY },
  ],
  resume: { name: 'resume.pdf', chars: 4200 },
  billing: { isPro: false, plan: null, status: null, currentPeriodEnd: null, purchases: [] },
  applyEmail: 'sai.apply@meritflow.mail',
  applyDomainConfigured: true,
  referralCode: 'SAIVIVEK',
  sources: [
    { source: 'Google Jobs', open: 41 },
    { source: 'Greenhouse', open: 22 },
  ],
  account: { email: 'katkurisaivivekk@gmail.com', role: 'student', accountKind: 'personal' },
  mail: INBOX.messages.slice(0, 3).map((m) => ({
    id: m.id,
    fromName: m.fromName,
    subject: m.subject,
    otp: m.otp,
    company: m.company,
    receivedAt: m.receivedAt,
    forwarded: m.forwarded,
  })),
  mailForwardingConfigured: true,
  /* Empty is the real default -- no ATS is enabled for submission until an
     operator reviews that path. The component reads .length on it without a
     guard, so omitting it crashes the whole tab. */
  submitVendors: [] as string[],
};

export const PROFILE = {
  id: 'demo',
  email: 'katkurisaivivekk@gmail.com',
  role: 'student',
  accountKind: 'personal',
  name: 'Sai Vivek Katkuri',
  avatarUrl: null,
  headline: 'AI Engineer · Data Platforms',
  bio: '',
  phone: '+1 (469) 454-8320',
  birthDate: '',
  pronouns: '',
  location: 'Plano, TX',
  timezone: 'America/Chicago',
  website: '',
  department: '',
  studentId: '',
};
