import { getDb } from '../db';
import { getCandidateProfile, scoreJob, type CandidateProfile, type Job } from '../jobs-store';
import { getProfile } from '../profile-store';
import { getPolicy } from './policy-engine';
import {
  getVault,
  resolveQuestions,
  seedFromResume,
  seedIdentity,
  type ResolvedAnswer,
  type VaultAnswer,
} from './answer-vault';
import { detectAts, mayAutoSubmit, mayDriveBrowser, resolveExecutionPolicy } from './execution-policy';
import { otpFor } from '../mail/inbound';
import { greenhouseAdapter } from './adapters/greenhouse';
import { genericBrowserAdapter, matchIdentity } from './adapters/generic';
import { leverAdapter } from './adapters/lever';
import { ashbyAdapter } from './adapters/ashby';
import type { AtsAdapter, ApplicationReceipt } from './adapters/types';
import type { FieldResolver } from './navigator/types';
import { verify, explain, type VerifierResult } from './verifier';
import { checkSubmitGate } from './submit-gate';
import { recordApplicationAudit } from './audit';
import { derive, factsFrom, type DerivedFacts } from './derive';
import { classifyQuestion } from './question-class';
import { routeQuestion } from './intent-router';
import { answerOpenEnded } from './open-ended';
import { checkAuthorization } from './authorization';
import { advance, applicationKey, ensureRun, logEvent, runByApplicationKey, type RunState } from './state-machine';
import { getJobSettings } from '../job-settings';
import { getCareerLinks } from '../career/store';
import { canonicalUrl } from './canonical-url';
import { activeResume } from '../jobs/documents';
import { tailorResume, writeCoverLetter, renderResume } from './tailor';
import { archiveApplication } from '../jobs/archive';
import { resumeToDocx } from '../jobs/docx-template';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * The dry-run workflow.
 *
 * Deterministic and linear — no planner, no supervisor. Each node moves the
 * durable state forward and every gate is a plain function over structured
 * data. That is what makes a failure debuggable: the run stops at a named
 * state with a named reason, rather than somewhere inside a model's reasoning.
 *
 * Most runs end at DRY_RUN_COMPLETE. The branch to a real submission requires
 * four independent conditions to hold at once: the execution policy permits
 * the vendor, the adapter implements `submit`, the verifier cleared the run,
 * and the form validated. They are kept separate deliberately, since each one
 * failing is a different problem with a different fix.
 */

/**
 * Order is significance, not preference of convenience.
 *
 * Vendor adapters first: a structured API states which fields are required and
 * what the options are, where a DOM read has to infer both. The generic
 * browser adapter is last and claims anything left over — without it, a feed
 * sourced from Google Jobs matched no adapter at all and every run stopped at
 * "No adapter for unknown".
 */
const ADAPTERS: AtsAdapter[] = [greenhouseAdapter, leverAdapter, ashbyAdapter, genericBrowserAdapter];

/**
 * Which human-blocked state a stop reason describes.
 *
 * Matched on the reason the driver already produced, so there is one wording
 * rather than two. Anything unrecognised stays the general case.
 */
function humanBlockState(reason: string): RunState {
  const r = reason.toLowerCase();
  if (r.includes('captcha') || r.includes('are you human') || r.includes('challenge')) return 'CAPTCHA_REQUIRED';
  if (r.includes('verification code') || r.includes('two-factor') || r.includes('one-time') || r.includes('mfa')) {
    return 'MFA_REQUIRED';
  }
  if (r.includes('account')) return 'ACCOUNT_REQUIRED';
  return 'NEEDS_USER_ACTION';
}

/**
 * Whether trying again could plausibly work.
 *
 * Timeouts, resets and 5xx are worth another attempt. A form we could not
 * recognise is not: the page changed, and running the same code against it
 * three times produces three identical failures and three browser launches.
 */
function retryable(reason: string): boolean {
  const r = reason.toLowerCase();
  return (
    r.includes('timeout') ||
    r.includes('timed out') ||
    r.includes('econnreset') ||
    r.includes('econnrefused') ||
    r.includes('socket hang up') ||
    r.includes('network') ||
    /\b5\d\d\b/.test(r)
  );
}

/**
 * Where an application goes when it cannot be finished without the candidate.
 *
 * ## Two products, one engine
 *
 * With `neverAsk` off, an application that hits an unanswerable question waits
 * in a queue for the candidate. That is right for someone reviewing each one.
 *
 * With it on, the promise is different: "you have my résumé, handle it". Parking
 * an application because one employer asked something unusual breaks that
 * promise and builds a queue nobody works through. There are a thousand open
 * postings; losing a few costs nothing, and moving on is what the candidate
 * asked for.
 *
 * ## What it does not change
 *
 * Anything about what may be answered. A fact this system cannot support is
 * still unanswered, an attestation is still unauthorised, and nothing is
 * invented to get past either. The only difference is whether the run waits or
 * walks away.
 */
function parkOrSkip(neverAsk: boolean, blocked: RunState): RunState {
  if (!neverAsk) return blocked;
  /* A CAPTCHA and an unknown question are both "not without you". Under
     neverAsk both become the same thing: the next posting. */
  return 'SKIPPED';
}

/**
 * What kind of stop an unreadable application was.
 *
 * Matched on the reason the adapter produced, which is written for the
 * candidate, so there is one wording rather than two. Anything unrecognised
 * stays a failure: a new kind of breakage should look like breakage until
 * somebody decides otherwise.
 */
function classifyInspectFailure(message: string): 'GONE' | 'UNSUPPORTED' | 'FAILED' {
  const m = message.toLowerCase();

  /* The employer took it down. Common and completely normal on a feed that is
     hours old; not a defect in anything. */
  if (/\b404\b/.test(m) || m.includes('no longer') || m.includes('not found')) return 'GONE';

  /* There was never an application here to fill. Aggregator links, careers
     landing pages, and portals nothing has an adapter for. */
  if (
    m.includes('no application form') ||
    m.includes('stopped responding to autopilot') ||
    m.includes('requires an account') ||
    m.includes('sign in')
  ) {
    return 'UNSUPPORTED';
  }

  return 'FAILED';
}

/**
 * States that mean an employer already has this application.
 *
 * Everything at or past submission, including the outcome states a recruiter
 * reply moves a run into. A rejection is still an application that was sent,
 * and re-applying to a role that already said no is worse than not applying.
 */
const APPLIED_STATES: ReadonlySet<RunState> = new Set<RunState>([
  'SUBMITTING',
  'SUBMITTED',
  'CONFIRMED',
  'RECRUITER_RESPONSE',
  'ASSESSMENT',
  'INTERVIEW',
  'REJECTED',
  'OFFER',
]);

export type DryRunOutcome = {
  finalState: RunState;
  verifier: VerifierResult | null;
  receipt: ApplicationReceipt | null;
  /** Why the run stopped where it did, in the candidate's language. */
  reason: string;
  /** Prepared and cleared, waiting only on the candidate pressing send. */
  awaitingApproval?: boolean;
};

export async function runDryRun(
  userId: string,
  job: Job,
  options: {
    /**
     * The candidate looked at this exact application and pressed send.
     *
     * Only set by the approve endpoint, and it bypasses one gate — the review
     * hold — because a hold whose whole purpose is to wait for a human cannot
     * also block that human's decision. Every other gate still applies: an
     * approval is consent, not an override of the verifier.
     */
    approvedByUser?: boolean;
  /**
   * The candidate named this posting themselves, rather than it being picked
   * from the corpus.
   *
   * Turns off the *selection* filters — fit score, age, location, employment
   * type, salary floor. Those exist to choose which postings are worth an
   * attempt out of two thousand; when someone pastes a URL that choice has
   * already been made by the person whose application it is, and re-litigating
   * it refuses the thing they asked for.
   *
   * Turns off nothing else. CAPTCHAs still stop it, unauthorised attestations
   * still stop it, an answer without verified provenance still stops it, and
   * the duplicate guard still stops it. Those are not preferences.
   */
  chosenByCandidate?: boolean;
  } = {},
): Promise<DryRunOutcome> {
  const stop = async (state: RunState, reason: string, extra: Parameters<typeof advance>[3] = {}) => {
    await advance(userId, job.id, state, { blockedReason: reason, ...extra });
    await logEvent(userId, state, `${job.company} — ${reason}`, '', undefined);
    return reason;
  };

  /* When this application began, so a verification code that predates it is
     never mistaken for an answer to it. */
  const startedAt = Date.now();

  const existing = await ensureRun(userId, job.id, { company: job.company, title: job.title });

  /*
   * A job that has already been applied to is never run again.
   *
   * The state machine was supposed to prevent this on its own: SUBMITTED has
   * no transition back into the preparation states, so every `advance` below
   * would be rejected. But `advance` reports a refusal by returning `ok: false`
   * and this function never reads the result -- so the run sailed past every
   * rejected transition and reached the submit branch a second time. An
   * end-to-end run against a live form sent the same application twice.
   *
   * Checked here, once, before any work: the guard has to be a return, not a
   * transition, because the thing it protects against is precisely a caller
   * that ignores transitions.
   */
  /*
   * The same role at the same company, whichever row it arrived in.
   *
   * The state check below catches a re-run of this exact posting. This catches
   * the case it cannot see: the posting ingested twice under two job ids, which
   * produces two runs that each believe they are the first.
   */
  const key = applicationKey({ userId, company: job.company, title: job.title });
  const twin = await runByApplicationKey(userId, key);
  /*
   * A refused duplicate is a skip, not a copy of the other run's state.
   *
   * These returned the *twin's* state as this run's outcome, so a twin that had
   * crashed mid-send left this run reporting SUBMITTING — a transient state,
   * shown against a posting nothing was being sent to. What actually happened
   * here is that the engine declined to apply, which is what SKIPPED means.
   */
  if (twin && APPLIED_STATES.has(twin.state) && twin.jobId !== job.id) {
    const reason = `Already applied to ${job.company} for ${job.title}. Autopilot will not send a second application for the same role.`;
    await stop('SKIPPED', reason);
    return { finalState: 'SKIPPED', verifier: null, receipt: null, reason };
  }

  /*
   * The same posting, already applied to: report where it stands and change
   * nothing. Moving this run would overwrite the record of a real submission
   * with a skip, which is the one thing a duplicate guard must never do.
   */
  if (existing && APPLIED_STATES.has(existing.state)) {
    const reason = `Already applied to ${job.company}. Autopilot will not send a second application to the same posting.`;
    return { finalState: existing.state, verifier: null, receipt: null, reason };
  }

  /* ── load ──────────────────────────────────────────────────────────── */
  const [candidate, policy, vault, identity] = await Promise.all([
    getCandidateProfile(userId),
    getPolicy(userId),
    getVault(userId),
    getProfile(userId),
  ]);

  if (!candidate) {
    const reason = await stop('SKIPPED', 'No candidate profile yet.');
    return { finalState: 'SKIPPED', verifier: null, receipt: null, reason };
  }
  if (!policy) {
    const reason = await stop('SKIPPED', 'Autopilot has not been switched on.');
    return { finalState: 'SKIPPED', verifier: null, receipt: null, reason };
  }

  /* ── eligibility + match ───────────────────────────────────────────── */
  await advance(userId, job.id, 'QUALIFIED');
  const { score } = scoreJob(candidate, job);
  await advance(userId, job.id, 'MATCHED', { score });

  /*
   * Resolve the posting to the page that actually holds the form.
   *
   * A careers page embedding a board — `instacart.careers/job/?gh_jid=…` — has
   * no form in its markup, and the URL parser read its first path segment as
   * the board token, producing a board called "job". The registry already knows
   * the employer's real token, so the two compose into the direct board URL.
   */
  const applyUrl = await canonicalUrl(job);

  /* ── execution policy, resolved before any work is done ────────────── */
  const { ats, employerDomain } = detectAts(applyUrl);
  const adapter = ADAPTERS.find((a) => a.detect(applyUrl));

  /* Mechanism follows the adapter that will actually run, not the vendor:
     Greenhouse reads its public API, everything else drives a browser, and the
     policy table judges those two differently. */
  /* Greenhouse reads its public API; Lever reads its public API for the posting
     and a browser for the form, so it is judged as a browser path. */
  const mechanism = adapter?.vendor === 'greenhouse' ? 'api' : 'browser';
  const execution = resolveExecutionPolicy({ ats, employerDomain, mechanism });

  if (!adapter) {
    const reason = await stop('SKIPPED', `No adapter for ${ats}. Prepare this one manually.`, {
      executionPolicy: execution.status,
      score,
    });
    return { finalState: 'SKIPPED', verifier: null, receipt: null, reason };
  }

  /* A blocked path is not visited at all.
   *
   * The block previously only stopped the final click, so a posting whose
   * rationale is "their terms prohibit automated access" still had a scripted
   * browser session opened against it. Reading a page is automated access; the
   * gate belongs before the visit, not before the submit. */
  if (mechanism === 'browser' && !mayDriveBrowser(execution)) {
    const reason = await stop('NEEDS_USER_ACTION', execution.rationale, { executionPolicy: execution.status, score });
    return { finalState: 'NEEDS_USER_ACTION', verifier: null, receipt: null, reason };
  }

  /* ── inspect the real application ──────────────────────────────────── */
  await advance(userId, job.id, 'PREPARING', { executionPolicy: execution.status });

  /* Identity comes from the account, not from stored answers. Seeded before
     inspection because a multi-page form is read one page at a time and each
     page's questions are answered as it appears. */
  /* LinkedIn, GitHub and the portfolio come from the career identity, which is
     where the candidate maintains them. They used to be deliberately absent
     here — the profile stored one URL and copying it into a LinkedIn box would
     have been a confidently wrong answer — but now each has its own field, so
     each can be answered from the right one. */
  const career = await getCareerLinks(userId);

  seedIdentity(vault, {
    name: identity?.name,
    email: identity?.email,
    phone: identity?.phone,
    pronouns: identity?.pronouns,
    website: identity?.website,
    linkedin: career.linkedin,
    github: career.github,
    portfolio: career.portfolio,
  });

  /*
   * The résumé fills what the account does not.
   *
   * Ordered after `seedIdentity` on purpose: the account is what the candidate
   * maintains, the résumé is a document they wrote once. Where both speak, the
   * account wins; where only the résumé does — current employer, school,
   * graduation date — a question that was previously "unknown" now has the
   * answer the candidate is attaching to the same application.
   */
  const resumeDoc = await activeResume(userId);
  seedFromResume(vault, resumeDoc);

  /*
   * Identity for the adapters, vault first.
   *
   * The halves of a name were being split off the account's single `name`
   * field by taking the first word as the given name and the rest as the
   * surname. "Sai Vivek Katkuri" became "Sai" / "Vivek Katkuri", and because
   * adapters prefer a non-empty profile value it went to employers that way on
   * real applications -- past the vault, which held the halves the candidate
   * had confirmed themselves.
   *
   * So a confirmed vault answer wins, and the split is only the fallback for an
   * account that has never been through the readiness screen. The fallback also
   * reads the *last* word as the surname, which is the convention the split had
   * backwards.
   */
  const nameParts = (identity?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const profileFields = {
    firstName: vault.get('PROFILE.FIRST_NAME')?.value || nameParts.slice(0, -1).join(' ') || nameParts[0] || '',
    lastName: vault.get('PROFILE.LAST_NAME')?.value || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''),
    email: identity?.email ?? '',
    phone: identity?.phone ?? '',
    website: identity?.website ?? '',
    linkedin: career.linkedin,
    github: career.github,
    /* A form asking for a portfolio when none is published gets the personal
       site rather than an interruption. */
    portfolio: career.portfolio || identity?.website || '',
  };

  /*
   * The verified facts derivation may read. Built once, from the same vault and
   * the same résumé the rest of the run uses, so a derived answer can never be
   * computed from anything the candidate has not stated.
   */
  const facts = factsFrom(vault, resumeDoc, job.discoverySource);
  /*
   * One consent checker for the whole run, bound to this candidate and this
   * employer. Scoped to the company so an acknowledgement authorized for one
   * employer does not silently cover another.
   */
  const consentFor = async (type: string, text: string) => {
    const check = await checkAuthorization(userId, { type, scope: job.company, exactText: text });
    return check.allowed
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: check.reason };
  };

  /* Same routing the answers list uses, so the filler and the validator can
     never disagree about whether a question was answered. */
  const routeFor = async (label: string, kind: string): Promise<string | null> => {
    const routed = await routeQuestion(userId, label, kind);
    const stored = routed.intent ? vault.get(routed.intent) : undefined;
    return stored?.autopilotOk && stored.value ? stored.value : null;
  };

  const resolveFields = buildResolver(vault, profileFields, facts, consentFor, routeFor, candidate, job);

  let inspect;
  try {
    inspect = await adapter.inspect(applyUrl, { resolve: resolveFields });
  } catch (err) {
    /*
     * Not everything that stops here is a failure.
     *
     * A run list came back three-quarters red: a LinkedIn link with no form
     * behind it, an Oracle careers portal nothing has an adapter for, and a
     * Greenhouse posting the employer had taken down. All three were marked
     * FAILED, which tells the candidate their product is broken when what
     * actually happened is that two of those destinations were never
     * applicable and the third no longer exists.
     *
     * FAILED should mean "this should have worked and did not". Everything
     * else gets classified as what it is, so the run list is a list of things
     * worth looking at rather than a wall of red.
     */
    const message = err instanceof Error ? err.message : 'Could not read the application.';
    const kind = classifyInspectFailure(message);

    if (kind === 'GONE') {
      /* Close the posting so it stops being offered and re-attempted. */
      try {
        const db = await getDb();
        await db.query("UPDATE jobs SET status = 'closed' WHERE id = $1", [job.id]);
      } catch {
        /* Non-fatal: the run's own outcome matters more than the bookkeeping. */
      }
      const reason = await stop('SKIPPED', 'This posting has been taken down by the employer.');
      return { finalState: 'SKIPPED', verifier: null, receipt: null, reason };
    }

    if (kind === 'UNSUPPORTED') {
      const state = parkOrSkip(policy.neverAsk, 'NEEDS_USER_ACTION');
      const reason = await stop(
        state,
        `${message} Autopilot cannot apply through this destination — open it yourself, or wait for a direct posting from the same employer.`,
      );
      return { finalState: state, verifier: null, receipt: null, reason };
    }

    const reason = await stop('FAILED', message);
    return { finalState: 'FAILED', verifier: null, receipt: null, reason };
  }

  /*
   * A pasted posting learns its real identity from the page.
   *
   * The stub row a pasted URL creates says "jobs.ashbyhq.com — Pasted
   * posting", and that is what the tracker, the calendar and the documents
   * list all showed for an application that in fact went to Gen Digital. The
   * inspect just read the employer's own page; its company and title are
   * facts, and the row is updated so every later surface names the real role.
   */
  if (/^Pasted posting/.test(job.title) && inspect.company && inspect.title) {
    try {
      const db = await getDb();
      await db.query('UPDATE jobs SET company = $1, title = $2 WHERE id = $3', [
        inspect.company.slice(0, 120),
        inspect.title.slice(0, 200),
        job.id,
      ]);
      job = { ...job, company: inspect.company.slice(0, 120), title: inspect.title.slice(0, 200) };
    } catch {
      /* Cosmetic bookkeeping; the run itself matters more. */
    }
  }

  /*
   * Say which kind of human is needed.
   *
   * A CAPTCHA is permanent for us and there is nothing the candidate can do
   * except open the page themselves. An account wall is a one-time setup they
   * can complete and then never see again for that employer. Reporting both as
   * "needs you" made the queue a list of identical rows with different reasons
   * buried in a sentence.
   */
  if (inspect.requiresAccount) {
    const state = parkOrSkip(policy.neverAsk, 'ACCOUNT_REQUIRED');
    const reason = await stop(state, 'This employer requires an account before the form can be started.');
    return { finalState: state, verifier: null, receipt: null, reason };
  }

  if (inspect.requiresHumanChallenge) {
    const state = parkOrSkip(policy.neverAsk, 'CAPTCHA_REQUIRED');
    const reason = await stop(state, 'This application shows a CAPTCHA, which only you can complete.');
    return { finalState: state, verifier: null, receipt: null, reason };
  }

  /* ── tailor the résumé and write a cover letter ─────────────────────── */
  /* Per posting, not per candidate: the same résumé sent to every employer is
     the thing this replaces. Both are evidence-checked inside `tailor`, so a
     claim with nothing behind it is dropped before it reaches an employer. */
  const settings = await getJobSettings(userId);
  const [tailored, cover] = await Promise.all([
    tailorResume(candidate, job, settings.optimization),
    writeCoverLetter(candidate, job, { name: identity?.name, email: identity?.email }),
  ]);

  if (tailored.dropped.length > 0 || cover.dropped.length > 0) {
    await logEvent(
      userId,
      'PREPARING',
      `${job.company} — dropped ${tailored.dropped.length + cover.dropped.length} unsupported claims while tailoring.`,
      JSON.stringify({ resume: tailored.dropped, cover: cover.dropped }),
    );
  }

  await advance(userId, job.id, 'RESUME_READY');

  /* ── resolve questions against the vault ───────────────────────────── */
  /*
   * The same three tiers the filler uses, in the same order.
   *
   * This list is what the verifier reads, what the receipt shows, and what
   * `validate` measures completeness against — so a question answered during
   * filling but missing here reads as an incomplete form and holds the run.
   * That is exactly what happened to Reddit's privacy acknowledgement: the
   * filler ticked it from a standing authorisation and this list still called
   * it unanswered, so the application never went.
   */
  /* Sentences the evidence check removed from generated prose. Reported with
     the tailoring drops, because they are the same kind of event. */
  const openEndedDropped: string[] = [];
  const answers: ResolvedAnswer[] = [];
  for (const a of resolveQuestions(inspect.questions, vault)) {
    if (a.value && !a.blockedReason) {
      answers.push(a);
      continue;
    }

    /* Consent, from the authorization vault and nowhere else. */
    const cls = classifyQuestion(a.question.label, a.question.kind);
    if (cls.kind === 'CONSENT_ATTESTATION') {
      const check = await checkAuthorization(userId, {
        type: cls.rule,
        scope: job.company,
        exactText: a.question.label,
      });
      answers.push(
        check.allowed
          ? { ...a, value: 'Yes', provenance: 'USER_VERIFIED', blockedReason: null }
          : { ...a, value: null, blockedReason: check.reason },
      );
      continue;
    }

    /* Then a derivation from verified facts. */
    const derived = derive(a.question.label, facts);
    if (derived) {
      answers.push({ ...a, value: derived.value, provenance: 'DERIVED' as const, blockedReason: null });
      continue;
    }

    /*
     * Last: ask what this question *means*.
     *
     * The pattern registry recognises wordings somebody wrote a rule for, and
     * every employer words things differently — ten separate patterns were
     * added by hand in one session, each covering one phrasing. The router maps
     * an unrecognised question onto the same closed set of intents, and the
     * value still comes from the vault. A routing is cached, so a phrasing costs
     * one call ever.
     */
    const routed = await routeQuestion(userId, a.question.label, a.question.kind);
    const stored = routed.intent ? vault.get(routed.intent) : undefined;

    if (stored?.autopilotOk && stored.value) {
      answers.push({
        ...a,
        intent: routed.intent,
        sensitivity: routed.sensitivity,
        value: stored.value,
        provenance: stored.provenance,
        blockedReason: null,
      });
      continue;
    }

    /*
     * Last resort, and only for prose.
     *
     * "Why do you want to join Figma?" cannot be stored — the answer differs
     * for every employer — and cannot be computed. It can be written, from the
     * candidate's own résumé and the posting, and checked sentence by sentence
     * against that evidence exactly as the tailored résumé is. Anything that
     * survives is enthusiasm grounded in work they actually did.
     *
     * Never reached for a factual question: those have already been through the
     * vault, derivation and the router, and a fact this system cannot support
     * stays unanswered.
     */
    if (cls.kind === 'OPEN_ENDED') {
      const written = await answerOpenEnded(a.question.label, candidate, job);
      if (written) {
        if (written.dropped.length > 0) openEndedDropped.push(...written.dropped);
        answers.push({ ...a, value: written.text, provenance: 'DERIVED' as const, blockedReason: null });
        continue;
      }
    }

    answers.push(a);
  }

  await advance(userId, job.id, 'ANSWERS_READY');

  /* ── verify ────────────────────────────────────────────────────────── */
  const counts = await applicationCounts(userId, job.company);
  const resumeClaims = candidate.skills.slice(0, 12);

  /*
   * Which attestations the candidate has already agreed to, checked against
   * the exact wording on this form.
   *
   * Same store and same call the filler uses, so the two cannot disagree about
   * a checkbox -- the disagreement they used to have is why applications sat
   * at "ready to send" with every field filled.
   */
  const authorisedAttestations = new Set<string>();
  for (const a of answers) {
    if (a.sensitivity !== 'LEGAL_ATTESTATION') continue;
    const cls = classifyQuestion(a.question.label, a.question.kind);
    if (cls.kind !== 'CONSENT_ATTESTATION') continue;
    const check = await consentFor(cls.rule, a.question.label);
    if (check.allowed) authorisedAttestations.add(a.question.label);
  }

  const verifier = verify({
    job,
    candidate,
    policy,
    execution,
    score,
    answers,
    resumeClaims,
    counts,
    authorisedAttestations,
  });

  /* The verifier's eligibility verdict is a selection judgement too, and on a
     pasted posting it is computed from a blank row. Its *safety* findings —
     attestations, unsupported claims, missing fields — are untouched. */
  if (!verifier.safeToContinue && !(options.chosenByCandidate === true && verifier.blocking.every((b) => b.code === 'ELIGIBILITY' || b.code === 'POLICY' || b.code === 'TRACK'))) {
    const reason = await stop('NEEDS_USER_ACTION', explain(verifier), { verifier });
    return { finalState: 'NEEDS_USER_ACTION', verifier, receipt: null, reason };
  }

  await advance(userId, job.id, 'VERIFIED', { verifier });
  await advance(userId, job.id, 'QUEUED');

  /* ── fill and validate ─────────────────────────────────────────────── */
  await advance(userId, job.id, 'FILLING');

  const resumeFileName = tailored.fileName;
  /* The document an employer receives: tailored highlights first, the
     candidate own résumé in full underneath, so nothing is lost. */
  const resumeDocument = renderResume(candidate, tailored, identity?.name ?? '');

  /*
   * What the tailoring was worth, on the same scorer that judged the original.
   *
   * The screen showed a fit percentage for the posting and then a tailored
   * résumé with no number attached, which left the obvious question unanswered:
   * did any of that help? Re-scoring the tailored document against the same job
   * answers it in the only honest way -- same function, same weights, different
   * input. A tailoring pass that does not move the number is one worth seeing
   * not move.
   */
  const tailoredFit = scoreJob({ ...candidate, resumeText: resumeDocument }, job).score;

  /*
   * Optimisation that makes the fit worse is not optimisation.
   *
   * The gate the posting passed was the *original* résumé scoring at or above
   * the floor for its age. Tailoring is meant to take that number up. When it
   * takes it down -- a posting whose language pulls the summary away from what
   * the candidate actually did -- sending the tailored version means applying
   * with a worse document than the one that qualified.
   *
   * So the tailored résumé has to earn the attachment. If it does not, the
   * candidate's own résumé goes instead, and the receipt says so.
   */
  const keepOriginal = tailoredFit < score;
  const finalDocument = keepOriginal ? candidate.resumeText || resumeDocument : resumeDocument;
  const fitAfter = keepOriginal ? score : tailoredFit;
  let resumePath: string | null = null;
  const fill = adapter.fill({ inspect, answers, profile: profileFields, resumeFileName });

  const validation = adapter.validate({ inspect, fill });
  await advance(userId, job.id, 'VALIDATED');

  /*
   * What is genuinely still unanswered.
   *
   * Two corrections over the naive concatenation, both found by running a real
   * account against a real form:
   *
   * **File fields are not vault questions.** `resolveQuestions` sees "Resume",
   * canonicalises it to PROFILE.RESUME, finds no stored answer and reports it
   * blocked -- while the adapter has already attached the actual file. The
   * résumé therefore appeared as an unanswered question on every receipt, and
   * in Smart mode, which sends only a spotless application, that alone would
   * have held back every application forever.
   *
   * **The same question was counted twice.** A required field with no answer
   * arrives from `fill.unfilled` and again from the blocked answers, so one
   * missing work-authorisation answer read as two problems.
   *
   * Deduplicated by the question's own wording, which is what the candidate
   * sees and acts on.
   */
  const attached = new Set(fill.mappings.filter((m) => m.source === 'file').map((m) => m.field));

  /*
   * Field ids are not questions.
   *
   * `fill.unfilled` reports the id the ATS uses -- `org` on Lever, a bare UUID
   * on Ashby -- and putting that in front of a candidate asks them to answer
   * something only the form understands. The inspected questions carry the
   * wording the employer actually printed, so unresolved items are labelled
   * from there and fall back to the id only when nothing matches.
   */
  const asked = new Map(inspect.questions.map((q) => [q.id, q]));

  const receiptUnresolved = [
    ...fill.unfilled.map((u) => {
      const q = asked.get(u.field);
      return {
        question: q?.label || u.field,
        reason: u.reason,
        kind: q?.kind ?? ('text' as const),
        required: q?.required ?? true,
      };
    }),
    ...answers
      .filter((a) => a.blockedReason && a.question.kind !== 'file' && !attached.has(a.question.id))
      .map((a) => ({
        question: a.question.label,
        reason: a.blockedReason!,
        kind: a.question.kind,
        required: a.question.required,
      })),
  ].filter((item, i, all) => all.findIndex((o) => o.question === item.question) === i);

  /* Questions this run produced a value for. An unresolved question in this
     set was a fill failure, not a missing fact. */
  const answeredIntents = new Set(answers.filter((a) => !a.blockedReason && a.value).map((a) => a.question.label));

  const receipt: ApplicationReceipt = {
    company: inspect.company || job.company,
    role: inspect.title || job.title,
    ats: inspect.ats,
    /* Prepared, not sent. Only the submit branch below rewrites this to
       SUBMITTED, and only after an employer confirmation was actually seen. */
    mode: 'DRY_RUN',
    preparedAt: Date.now(),
    multiStep: inspect.multiStep,
    resumeFileName,
    tailoring: {
      summary: tailored.summary,
      bullets: tailored.bullets,
      emphasised: tailored.emphasised,
      gaps: tailored.gaps,
      dropped: [...tailored.dropped, ...cover.dropped, ...openEndedDropped],
      coverLetter: cover.body,
      coverLetterFileName: cover.fileName,
      document: finalDocument,
      fitBefore: score,
      fitAfter,
      usedOriginal: keepOriginal,
    },
    fields: fill.mappings,
    answers: answers.map((a) => ({
      question: a.question.label,
      intent: a.intent,
      value: a.blockedReason ? null : a.value,
      provenance: a.provenance,
    })),
    unresolved: receiptUnresolved,
    validation,
    executionPolicy: { status: execution.status, rationale: execution.rationale },
  };

  /* ── submit, when every gate agrees ────────────────────────────────── */
  /*
   * Four independent conditions, all required:
   *   1. the execution policy permits this vendor (operator allowlist)
   *   2. the adapter actually implements submission
   *   3. the verifier cleared the run
   *   4. the form validated
   *
   * They are separate on purpose. Any one of them failing is a different
   * problem with a different fix, and collapsing them into one flag is how a
   * run ends up submitting because an unrelated check was relaxed.
   */
  /*
   * Smart and Full previously behaved identically — the only mode test was
   * `!== 'MANUAL'` — while the UI described them as different things. They
   * now differ on a real, checkable bar:
   *
   *   Smart  sends only a spotless application. Anything the engine could not
   *          fully answer, or any claim it had to drop while tailoring, parks
   *          the run for a human.
   *   Full   sends whenever the form validates and the verifier is happy.
   */
  const spotless = receiptUnresolved.length === 0 && tailored.dropped.length === 0 && cover.dropped.length === 0;
  const modeAllows = policy.mode === 'FULL' || (policy.mode === 'SMART' && spotless);

  /* The review hold. When on, a prepared application waits for the candidate
     to approve it rather than going out — which is what makes this a
     human-in-the-loop mode rather than a preference nobody can act on. */
  const heldForReview = settings.reviewBefore && !options.approvedByUser;

  /*
   * One gate, every condition named.
   *
   * This replaced an eight-term boolean expression. The terms were right; the
   * shape was not — a reader could not say what it guaranteed, and a condition
   * that stopped holding failed silently because nothing named it. The gate
   * evaluates all of them, so a run that does not send can say exactly which
   * requirements it missed instead of only the first.
   *
   * Nothing a model produced reaches it as a verdict. Generated text arrives
   * having already been checked elsewhere, and the gate only asks whether those
   * checks passed.
   */
  /* Named by the candidate, so the selection filters do not apply. */
  const chosen = options.chosenByCandidate === true;

  const gate = checkSubmitGate({
    executionPermitted: mayAutoSubmit(execution),
    adapterCanSubmit: typeof adapter.submit === 'function',

    autoSubmitEnabled: settings.autoSubmit,
    modeAllowsSend: policy.mode !== 'MANUAL' && modeAllows,
    notHeldForReview: !heldForReview,

    /*
     * Eligibility was judged by the verifier, which owns fit, age, track,
     * location and salary. Its verdict is carried through rather than
     * recomputed, so the two can never disagree.
     *
     * A posting the candidate named themselves skips these: a pasted URL
     * arrives as a record with no description, no location and no salary, so
     * the verifier scores it at 46% and refuses on five counts that are all
     * artefacts of a blank row. The person asked for this one.
     */
    hardFiltersPassed: chosen || verifier.eligibilityPass,
    matchThresholdPassed: chosen || verifier.eligibilityPass,
    jobTypeAllowed: chosen || verifier.eligibilityPass,
    locationAllowed: chosen || verifier.eligibilityPass,
    salaryPolicyPassed: chosen || verifier.eligibilityPass,

    resumeAttached: Boolean(resumeFileName),
    resumeEvidenceValidated: verifier.resumeClaimsVerified,

    formValidationPassed: validation.valid,
    requiredFieldsFilled: verifier.requiredFieldsComplete,
    unsupportedQuestions: receiptUnresolved.filter((u) => u.required).map((u) => u.question),

    answers,
    authorisedAttestations,

    /* The run would not have reached here under a duplicate key: starting a run
       for an application key already sent is refused when the run is created. */
    noDuplicateApplication: true,

    noInteractiveCaptcha: !inspect.requiresHumanChallenge,
    noUnresolvedMfa: !inspect.requiresAccount,
  });

  const canSubmit = gate.cleared;

  if (canSubmit) {
    await advance(userId, job.id, 'SUBMITTING');
    try {
      /* The actual file. Until this existed the submit path passed
         `resumePath: null`, so the file input on every form was left empty
         while `validate()` counted the résumé as attached — applications
         reported success with no CV on them. */
      resumePath = await writeResumeFile(tailored.fileName, finalDocument);

      /* No file, no send. The form asks for a résumé and validation already
         counted it as satisfied, so continuing here is exactly how an empty
         CV reaches an employer under someone's name. */
      const wantsFile = inspect.questions.some((q) => q.kind === 'file');
      if (wantsFile && !resumePath) {
        const reason = await stop('NEEDS_USER_ACTION', 'Could not attach your résumé, so nothing was sent.', {
          receipt,
          verifier,
        });
        return { finalState: 'NEEDS_USER_ACTION', verifier, receipt, reason };
      }

      const outcome = await adapter.submit!({
        inspect,
        fill,
        resumeFileName,
        resumePath,
        /*
         * Correlated to this application, not "whatever arrived last".
         *
         * A batch runs several applications at once and their verification
         * emails land within a minute of each other. The previous lookup took
         * the most recent code in the mailbox, so one employer's code was
         * typed into another's form -- it fails, the run stalls, and nothing
         * reports why, because a code was found and used.
         */
        requestOtp: () => otpFor(userId, { jobId: job.id, company: job.company, ats: inspect.ats, since: startedAt }),
        /* Pages three and four of a wizard are not visible until one and two
           are done, so their questions are answered against the same vault as
           they appear — and refused the same way when it has no answer. */
        resolve: resolveFields,
      });

      if (outcome.outcome === 'submitted') {
        const sent: ApplicationReceipt = {
          ...receipt,
          mode: 'SUBMITTED',
          /* What convinced us, kept with the record. A submission whose only
             support was a generated reference is a submission nobody can
             audit afterwards -- which is exactly the position one run left us
             in. */
          confirmation: { reference: outcome.reference, capturedAt: Date.now(), evidence: outcome.evidence },
        };
        await advance(userId, job.id, 'SUBMITTED', { receipt: sent, verifier, awaitingApproval: false });

        /* The append-only record of what this employer received, and on what
           basis. Written before the archive because it is the one thing that
           must survive even if the snapshot below fails. */
        if (existing?.id) {
          await recordApplicationAudit({ userId, runId: existing.id, jobId: job.id, receipt: sent, submitted: true });
        }

        /* Snapshot what actually went out, before the posting can change. */
        await archiveApplication(userId, {
          jobId: job.id,
          company: sent.company,
          title: sent.role,
          jobUrl: job.url,
          jdSnapshot: job.description,
          resumeSummary: tailored.summary,
          resumeBullets: tailored.bullets,
          coverLetter: cover.body,
          answers: sent.answers.map((a) => ({ question: a.question, value: a.value ?? '' })),
          ats: sent.ats,
          mode: 'SUBMITTED',
          reference: outcome.reference,
        });
        const msg = `${job.company} — application submitted. Reference ${outcome.reference}.`;
        await logEvent(userId, 'SUBMITTED', msg, JSON.stringify({ ats: inspect.ats, evidence: outcome.evidence }));
        return { finalState: 'SUBMITTED', verifier, receipt: sent, reason: msg };
      }

      if (outcome.outcome === 'unconfirmed') {
        /*
         * Recorded as an application that may exist.
         *
         * The receipt keeps DRY_RUN mode -- it is not evidence of a send -- but
         * the audit line is written anyway, because if this did reach the
         * employer there must be a record of exactly what they received.
         */
        const observed = outcome.evidence.length > 0 ? ` Observed: ${outcome.evidence.join('; ')}.` : '';
        const why = `${outcome.reason} Check your email before treating this as applied.${observed}`;
        await advance(userId, job.id, 'SUBMISSION_UNCONFIRMED', { receipt, verifier, blockedReason: why });
        if (existing?.id) {
          await recordApplicationAudit({ userId, runId: existing.id, jobId: job.id, receipt, submitted: false });
        }
        await logEvent(userId, 'SUBMISSION_UNCONFIRMED', `${job.company} — ${why}`, JSON.stringify({ ats: inspect.ats }));
        return { finalState: 'SUBMISSION_UNCONFIRMED', verifier, receipt, reason: why };
      }

      if (outcome.outcome === 'needsUser') {
        /* Same distinction as before the form was opened: a CAPTCHA that
           appeared on the last page is still a CAPTCHA, and the queue should
           say so rather than "needs you".

           And the same neverAsk rule: a block discovered at the submit step is
           no more answerable by the candidate mid-run than one found at the
           start, so it moves to the next posting rather than building a queue.
           Applying it in only one of the two places was an inconsistency that
           showed up as parked runs on an account set to never ask. */
        const kind = parkOrSkip(policy.neverAsk, humanBlockState(outcome.reason));
        const reason = await stop(kind, outcome.reason, { receipt, verifier });
        return { finalState: kind, verifier, receipt, reason };
      }

      const state = retryable(outcome.reason) ? 'FAILED_RETRYABLE' : 'FAILED_FINAL';
      const reason = await stop(state, outcome.reason, { receipt, verifier });
      return { finalState: state, verifier, receipt, reason };
    } catch (err) {
      /*
       * A thrown error during submission is the one case that must never be
       * quietly retried. The browser may have reached the employer before it
       * failed, and we cannot tell from here -- so a transient-looking error is
       * still marked retryable only for the *preparation* path, never once
       * SUBMITTING has been entered.
       */
      const message = err instanceof Error ? err.message : 'Submission failed.';
      const reason = await stop('NEEDS_USER_ACTION', `${message} We cannot tell whether the employer received this — check your email before applying again.`, {
        receipt,
        verifier,
      });
      return { finalState: 'NEEDS_USER_ACTION', verifier, receipt, reason };
    } finally {
      /* The temp PDF has served its purpose once the browser has read it, and
         a résumé left in the system temp directory is somebody's personal
         data sitting where it has no reason to be. */
      await cleanupResumePdf(resumePath);
    }
  }

  /* Parked purely for approval: everything cleared, only the review hold is
     holding it. Persisted so the approval queue survives a refresh and cannot
     disagree with what the run actually decided. */
  const awaitingApproval =
    heldForReview && mayAutoSubmit(execution) && settings.autoSubmit && validation.valid && modeAllows && policy.mode !== 'MANUAL';

  /*
   * A prepared application with unanswered required questions is the common
   * case for neverAsk: nothing is wrong, this employer simply asked something
   * we cannot support. Skipped rather than queued, with the reason kept.
   */
  if (policy.neverAsk && !canSubmit && receiptUnresolved.some((u) => u.required)) {
    const missing = receiptUnresolved.filter((u) => u.required);

    /*
     * Two different failures wear the same shape here, and saying the wrong one
     * sends the next person to the wrong place entirely.
     *
     * A question with no answer is this system declining to invent a fact —
     * working as intended. A question we *had* an answer for and could not put
     * into the page is a broken adapter, and reporting it as "could not be
     * answered" hides a bug behind a safety message.
     */
    const unanswerable = missing.filter((u) => !answeredIntents.has(u.question));
    const unfillable = missing.filter((u) => answeredIntents.has(u.question));

    const why =
      unfillable.length > 0
        ? `Skipped: ${unfillable.length} field${unfillable.length === 1 ? '' : 's'} had an answer that would not go into the form (${unfillable[0].question.slice(0, 60)} — ${unfillable[0].reason.slice(0, 60)}).`
        : `Skipped: ${unanswerable.length} required question${unanswerable.length === 1 ? '' : 's'} could not be answered from your verified information (${(unanswerable[0]?.question ?? '').slice(0, 70)}).`;

    /* Only claim the skip if the row actually moved. Reporting a state the
       database does not hold is how a run looks handled and is not. */
    const moved = await advance(userId, job.id, 'SKIPPED', { receipt, verifier, blockedReason: why });
    if (moved.ok) {
      await logEvent(userId, 'SKIPPED', `${job.company} — ${why}`, '');
      return { finalState: 'SKIPPED', verifier, receipt, reason: why };
    }
  }

  await advance(userId, job.id, 'DRY_RUN_COMPLETE', { receipt, verifier, awaitingApproval });
  /* Prepared runs are archived as well: the posting can be taken down before
     the candidate gets round to sending, and the snapshot is the only copy. */
  await archiveApplication(userId, {
    jobId: job.id,
    company: receipt.company,
    title: receipt.role,
    jobUrl: job.url,
    jdSnapshot: job.description,
    resumeSummary: tailored.summary,
    resumeBullets: tailored.bullets,
    coverLetter: cover.body,
    answers: receipt.answers.map((a) => ({ question: a.question, value: a.value ?? '' })),
    ats: receipt.ats,
    mode: 'DRY_RUN',
    reference: '',
  });

  /*
   * Why it stopped short of sending — from the gate, not re-derived.
   *
   * This used to be a hand-written chain of the same conditions the gate
   * checks, in the same order, ending at `explain(verifier)`. Two copies of one
   * decision drift, and this pair drifted into a contradiction a candidate
   * actually saw: two prepared applications reported "All checks passed" and
   * were not sent, because the verifier was happy and a *different* gate
   * condition had failed. The chain had no branch for that condition, so it
   * fell through to the verifier's opinion.
   *
   * The gate evaluates every condition and returns the ones that failed. Asking
   * it is both shorter and incapable of disagreeing with the thing that made
   * the decision.
   */
  const held =
    gate.failed.length > 0
      ? gate.failed.map((c) => c.detail ?? c.requirement).join(' ')
      : 'Ready to send.';

  /* Said plainly, because "3 questions answered" on a five-page Workday-style
     application is a misleading thing to show someone who is deciding whether
     to send it. */
  const steps = inspect.multiStep ? ' This application continues over several pages — the ones after the first open when submission is enabled for this employer.' : '';
  const summary = `${job.company} — ${awaitingApproval ? 'ready, waiting for your approval' : 'ready to send'}. ${held}${steps}`;
  /*
   * The whole gate reading goes into the event.
   *
   * An activity feed that says "prepared" and nothing else cannot answer the
   * only question anyone asks of it. Every condition, passed and failed, is
   * small enough to store and is the difference between a log and a record.
   */
  await logEvent(
    userId,
    'DRY_RUN_COMPLETE',
    summary,
    JSON.stringify({
      score,
      validation,
      gate: gate.conditions.map((c) => ({ code: c.code, passed: c.passed, detail: c.passed ? undefined : c.detail })),
    }),
  );

  return { finalState: 'DRY_RUN_COMPLETE', verifier, receipt, reason: summary, awaitingApproval };
}

/**
 * The only source of values the navigator can reach.
 *
 * This is the load-bearing piece of the whole multi-page design. The loop
 * decides *where to go*; this decides *what may be said*, and the two are
 * separate functions in separate modules so the boundary is visible rather than
 * remembered.
 *
 * Three outcomes, exactly as the single-page path already produced:
 *
 *  - an identity field, answered from the account
 *  - a recognised question with a verified answer in the vault
 *  - anything else, refused with the reason the candidate will see
 *
 *  - a prose question, written from the résumé and checked back against it
 *
 * The fourth branch never infers a *fact*. A form asking "how many years of
 * Kubernetes?" when nobody has ever answered it still gets a refusal, because
 * no amount of writing makes an unknown number known. It covers only the
 * questions whose answer is an essay — "tell us about your experience with
 * agentic systems" — where the material is the candidate's own résumé and every
 * sentence is checked against it before it is used.
 *
 * This is the same branch the single-page path already had. Its absence here is
 * why a multi-step form parked on a question the single-page form answered.
 */
function buildResolver(
  vault: Map<string, VaultAnswer>,
  profile: Record<string, string>,
  facts: DerivedFacts,
  consent: (type: string, text: string) => Promise<{ allowed: boolean; reason: string }>,
  route: (label: string, kind: string) => Promise<string | null>,
  candidate: CandidateProfile,
  job: Job,
): FieldResolver {
  return async (fields) => {
    const answers: { field: string; value: string }[] = [];
    const blocked: { field: string; reason: string }[] = [];

    const questions = fields.map((f) => ({ id: f.id, label: f.label, required: f.required, kind: f.kind }));
    const resolved = new Map(resolveQuestions(questions, vault).map((a) => [a.question.id, a]));

    for (const q of questions) {
      /* File inputs are attached, not typed. Neither answered nor blocked here:
         the navigator uploads the prepared résumé, and a form that wants one
         when none exists is stopped by the planner with its own message. */
      if (q.kind === 'file') continue;

      /* A blank profile slot is not a missing answer -- the vault below may
         hold it. Same rule as the adapters. */
      const identity = matchIdentity(`${q.id} ${q.label}`.toLowerCase(), profile);
      if (identity) {
        answers.push({ field: q.id, value: identity });
        continue;
      }

      const hit = resolved.get(q.id);
      if (hit?.value && !hit.blockedReason) {
        answers.push({ field: q.id, value: hit.value });
        continue;
      }

      /*
       * Consent is never answered from the vault, however verified it looks.
       *
       * A stored "Yes" against a privacy acknowledgement is a fact about what
       * the candidate once ticked, not a permission to tick it again on a
       * different form with different wording. Permissions live in their own
       * store and are checked against the exact text.
       */
      const kind = classifyQuestion(q.label, q.kind);
      if (kind.kind === 'CONSENT_ATTESTATION') {
        const check = await consent(kind.rule, q.label);
        if (check.allowed) answers.push({ field: q.id, value: 'Yes' });
        else blocked.push({ field: q.id, reason: check.reason });
        continue;
      }

      /* The vault could not answer. Before giving the question to the
         candidate, see whether it follows from something already verified —
         "are you located in Canada" follows from a country they have stated. */
      const derived = derive(q.label, facts);
      if (derived) {
        answers.push({ field: q.id, value: derived.value });
        continue;
      }

      /* Then what the question means, mapped onto the same closed set. The two
         paths must agree or a field is typed and simultaneously reported
         unanswered — which is exactly what happened with consent. */
      const routed = await route(q.label, q.kind);
      if (routed) {
        answers.push({ field: q.id, value: routed });
        continue;
      }

      /* Prose, last, and only for prose. */
      if (kind.kind === 'OPEN_ENDED') {
        const written = await answerOpenEnded(q.label, candidate, job);
        if (written) {
          answers.push({ field: q.id, value: written.text });
          continue;
        }
      }

      blocked.push({ field: q.id, reason: hit?.blockedReason ?? 'No verified answer for this question yet.' });
    }

    return { answers, blocked };
  };
}

/** Counts the limit gates need. One query, not three. */
/**
 * Write the tailored résumé to a temporary PDF for the form's file input.
 *
 * A real file, because an ATS file field cannot be satisfied with a name — and
 * a name is all this path had. Returning null means no attachment is possible,
 * which the caller treats as a reason to stop rather than to continue: an
 * application sent with an empty CV field is worse than one not sent, because
 * it burns the opening and reports success.
 */
async function writeResumeFile(fileName: string, body: string): Promise<string | null> {
  try {
    const dir = await mkdtemp(join(tmpdir(), 'meritflow-'));
    /*
     * Word, not PDF.
     *
     * An ATS parses the attachment to fill its own fields, and a PDF is a
     * page-description format: the text is positioned glyph runs with no
     * reading order, so extraction is a heuristic that regularly returns
     * jumbled fragments or nothing. The candidate never sees it, because the
     * upload itself succeeded.
     *
     * A .docx carries the text as text, in order. Same document, and it
     * survives the parse.
     */
    const safe = (fileName.replace(/[^\w.-]/g, '_') || 'resume').replace(/\.(pdf|docx?)$/i, '');
    const path = join(dir, `${safe}.docx`);
    await writeFile(path, resumeToDocx(body));
    return path;
  } catch {
    return null;
  }
}

/** Remove the temporary directory the PDF was written into. */
async function cleanupResumePdf(path: string | null): Promise<void> {
  if (!path) return;
  await rm(join(path, '..'), { recursive: true, force: true }).catch(() => {
    /* A leftover temp file is untidy, never a reason to fail a run. */
  });
}

async function applicationCounts(userId: string, company: string) {
  const db = await getDb();
  const since = Date.now() - 86_400_000;
  const res = await db.query<{ today: string; company: string; active: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE r.updated_at >= $2)                       AS today,
       COUNT(*) FILTER (WHERE j.company = $3)                           AS company,
       COUNT(*) FILTER (WHERE r.state NOT IN ('SKIPPED','REJECTED','OFFER','FAILED')) AS active
     FROM autopilot_runs r JOIN jobs j ON j.id = r.job_id
     WHERE r.user_id = $1`,
    [userId, since, company],
  );
  const r = res.rows[0];
  return { today: Number(r?.today ?? 0), company: Number(r?.company ?? 0), active: Number(r?.active ?? 0) };
}
