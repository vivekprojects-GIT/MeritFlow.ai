import type {
  AdapterContext,
  AtsAdapter,
  FieldMapping,
  FillResult,
  InspectResult,
  SubmitResult,
  ValidationResult,
} from './types';
import type { FormQuestion, ResolvedAnswer } from '../answer-vault';
import type { FieldResolver } from '../navigator/types';
import { detectAts } from '../execution-policy';

/**
 * The generic adapter: any application form, driven by the navigator.
 *
 * ## Why this exists
 *
 * The engine previously registered exactly one adapter, Greenhouse. The job
 * feed comes from Google Jobs, which links to employer career sites, LinkedIn
 * and aggregators — measured against the live database, **zero of 63 open jobs
 * matched it**, so every run ended at "No adapter for unknown" and Auto Apply
 * did nothing at all.
 *
 * ## Why it is a loop and not a single read
 *
 * The first version of this adapter read one page: find a form, fill it, press
 * submit. That covers a Greenhouse-style single-page application and nothing
 * else. Workday, iCIMS, Taleo and most enterprise careers sites are five- and
 * six-page wizards where step four does not exist until step three is complete,
 * and a one-shot read cannot even see the questions it would need to answer.
 *
 * So this drives `navigator/`, which walks the flow a page at a time. What that
 * loop may do is bounded by mode: reading stops at the first page that asks a
 * question, and completing a whole application happens only where the execution
 * policy has approved that specific path.
 *
 * ## Where it sits
 *
 * Last. A vendor adapter is always preferred where one exists, because a
 * structured API states which fields are required and what the options are,
 * whereas a DOM read has to infer both. This is the fallback that makes the
 * rest of the list actionable rather than the preferred path.
 *
 * It reports the real ATS when the URL reveals one, so the execution policy
 * still resolves per vendor. A Workday posting read through this adapter is
 * still governed by the Workday row in the policy table.
 */
export class GenericBrowserAdapter implements AtsAdapter {
  readonly vendor = 'unknown' as const;

  /**
   * Handles anything with an http(s) URL.
   *
   * Registered last in the adapter list, so "handles anything" means "handles
   * whatever nothing else claimed" rather than "wins every time".
   */
  detect(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  /**
   * Read the application without touching it.
   *
   * Survey mode: follow "Apply" links through description and splash pages,
   * stop at the first page with questions on it, report them. Nothing is typed
   * and nothing past that page is pressed — see `navigator/types.ts` for why a
   * run that may not submit may also not advance through a filled form.
   */
  async inspect(url: string, ctx: AdapterContext = {}): Promise<InspectResult> {
    const [{ openSession }, { navigate }, { PlaywrightDriver }] = await Promise.all([
      import('./browser'),
      import('../navigator/run'),
      import('../navigator/playwright-driver'),
    ]);

    const session = await openSession();
    try {
      await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      /*
       * Wait for the form, not for a stopwatch.
       *
       * A fixed pause read a slow-rendering Ashby page before its 42 inputs
       * existed and reported "no application form was found" -- on a URL a
       * slightly longer probe read perfectly. Waiting for the first control to
       * attach is faster on quick pages and correct on slow ones; the timeout
       * only expires on a page that genuinely has no form.
       */
      await session.page
        .locator('input:not([type=hidden]), textarea, select, button[aria-pressed]')
        .first()
        .waitFor({ state: 'attached', timeout: 20_000 })
        .catch(() => {});
      await session.page.waitForTimeout(1200);

      const driver = new PlaywrightDriver(session.page, ctx.resolve ?? NO_ANSWERS, null);
      const result = await navigate(driver, {
        mode: 'survey',
        allowSubmit: false,
        hasResume: false,
        /* Gateway hops only. More than a handful means we are wandering through
           a marketing site rather than approaching an application. */
        maxSteps: 5,
        budgetMs: 90_000,
      });

      const ats = detectAts(url).ats;
      /*
       * Where this form actually lives, for the submit pass to reopen.
       *
       * Normally the browser's final URL (redirects matter). But Ashby is an
       * SPA that rewrites its address after load, dropping the /application
       * suffix we navigated to -- so recording the rewritten URL sent the
       * submit pass to the overview page, which has no form on it, after an
       * inspect that had just read 12 questions off the real one. If the page
       * we asked for is a prefix-rewrite of where we landed, the asked-for URL
       * is the one that renders the form.
       */
      const landed = session.page.url() || url;
      const finalUrl = url.startsWith(landed.replace(/\/+$/, '')) ? url : landed;
      const title = await session.page.title().catch(() => '');
      const company =
        (await session.page.locator('meta[property="og:site_name"]').getAttribute('content').catch(() => null)) ??
        hostOf(finalUrl);

      if (result.questionsSeen.length === 0) {
        /* A challenge or a login wall is a handoff, not a failure, so it is
           reported through the flags the workflow already checks rather than
           thrown. Anything else genuinely failed. */
        const reason = 'reason' in result ? result.reason : '';
        if (/CAPTCHA/i.test(reason) || /account/i.test(reason)) {
          return {
            ats,
            url: finalUrl,
            title: title.slice(0, 200),
            company: String(company).slice(0, 120),
            questions: [],
            requiresAccount: /account/i.test(reason),
            requiresHumanChallenge: /CAPTCHA/i.test(reason),
          };
        }
        throw new Error(reason || 'No application form was found on this page.');
      }

      return {
        /* The real vendor when the URL reveals one, so execution policy still
           resolves per ATS rather than collapsing everything to 'unknown'. */
        ats,
        url: finalUrl,
        title: title.slice(0, 200),
        company: String(company).slice(0, 120),
        questions: result.questionsSeen.map(toQuestion),
        requiresAccount: false,
        requiresHumanChallenge: false,
        multiStep: /multi-step/i.test('reason' in result ? result.reason : ''),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Map what we know onto the fields we found.
   *
   * Identity is matched by inspecting the field name, because a generic form
   * has no agreed vocabulary: `first_name`, `firstName`, `fname` and
   * `applicant[given_name]` all mean the same thing and none of them is
   * canonical.
   */
  fill(input: {
    inspect: InspectResult;
    answers: ResolvedAnswer[];
    profile: Record<string, string>;
    resumeFileName: string | null;
  }): FillResult {
    const { inspect, answers, profile, resumeFileName } = input;
    const mappings: FieldMapping[] = [];
    const unfilled: { field: string; reason: string }[] = [];
    const byId = new Map(answers.map((a) => [a.question.id, a]));

    for (const q of inspect.questions) {
      const key = `${q.id} ${q.label}`.toLowerCase();

    /*
     * Identity first, but an empty profile slot is not an answer.
     *
     * The profile and the vault hold the same facts by different routes: the
     * profile is what onboarding captured, the vault is everything the
     * candidate has since confirmed. A LinkedIn URL sitting in the vault while
     * the profile column is blank used to end the application — the form was
     * told "missing from your profile" about a value we were holding.
     *
     * So a blank identity slot falls through to the vault rather than
     * terminating the lookup. Only when neither has it is the field genuinely
     * unanswered.
     */
      const identity = matchIdentity(key, profile);
      if (identity) {
        mappings.push({ field: q.id, source: 'profile', value: identity });
        continue;
      }

      if (q.kind === 'file') {
        if (resumeFileName) mappings.push({ field: q.id, source: 'file', value: resumeFileName });
        else if (q.required) unfilled.push({ field: q.label, reason: 'No résumé prepared.' });
        continue;
      }

      const resolved = byId.get(q.id);
      if (resolved?.value && !resolved.blockedReason) {
        mappings.push({ field: q.id, source: 'vault', value: resolved.value });
      } else if (q.required) {
        /* Named rather than guessed. An unfamiliar required question on a
           generic form is exactly the case where inventing an answer does real
           damage, so it is handed back. */
        unfilled.push({ field: q.label, reason: resolved?.blockedReason ?? 'No verified answer for this question.' });
      }
    }

    return { mappings, answers, resumeFileName, unfilled };
  }

  validate(input: { inspect: InspectResult; fill: FillResult }): ValidationResult {
    const { inspect, fill } = input;
    const filled = new Set(fill.mappings.map((m) => m.field));
    const missing = inspect.questions.filter((q) => q.required && !filled.has(q.id)).map((q) => q.label);

    const errors: string[] = [];
    const email = fill.mappings.find((m) => /mail/i.test(m.field))?.value;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Email address is not valid.');

    return { valid: missing.length === 0 && errors.length === 0, missing, errors };
  }

  /**
   * Complete and send the application.
   *
   * Reached only when the execution policy permits submission on this path, the
   * verifier cleared the run and the form validated — the workflow checks all
   * four independently. Here the navigator runs in `apply` mode, which is the
   * only mode that walks a wizard to its end.
   *
   * A fresh session rather than one held open since `inspect`: verification and
   * tailoring happen in between, a held session would have to survive that, and
   * a form filled minutes ago against a page that has since re-rendered is a
   * worse starting point than a clean one.
   */
  async submit(input: {
    inspect: InspectResult;
    fill: FillResult;
    resumeFileName: string | null;
    resumePath: string | null;
    requestOtp: () => Promise<string | null>;
    resolve?: FieldResolver;
  }): Promise<SubmitResult> {
    const [{ openSession }, { navigate }, { PlaywrightDriver }] = await Promise.all([
      import('./browser'),
      import('../navigator/run'),
      import('../navigator/playwright-driver'),
    ]);

    const { openArtifacts } = await import('../artifacts');
    /* Named for the employer and the moment, so a failure can be found later
       without cross-referencing a run id. */
    const artifacts = openArtifacts(String(Date.now()), input.inspect.company || input.inspect.ats);

    const session = await openSession();
    try {
      await session.page.goto(input.inspect.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await session.page
        .locator('input:not([type=hidden]), textarea, select, button[aria-pressed]')
        .first()
        .waitFor({ state: 'attached', timeout: 20_000 })
        .catch(() => {});
      await session.page.waitForTimeout(1200);

      const driver = new PlaywrightDriver(
        session.page,
        withOtp(input.resolve ?? fromMappings(input.fill), input.requestOtp),
        input.resumePath,
        artifacts,
      );

      const result = await navigate(driver, {
        mode: 'apply',
        allowSubmit: true,
        hasResume: Boolean(input.resumePath),
      });

      /* The last page, whatever happened, plus the decisions that led there.
         A screenshot of the step that stopped is worth more than the sentence
         describing it. */
      await artifacts.step('final', session.page);
      await artifacts.finish({
        url: input.inspect.url,
        ats: input.inspect.ats,
        company: input.inspect.company,
        outcome: result.outcome,
        reason: 'reason' in result ? result.reason : '',
        trail: result.trail,
        filled: result.filled,
        skipped: result.skipped,
        unresolved: result.unresolved,
        pagesVisited: result.pagesVisited,
      });

      if (result.outcome === 'submitted') {
        /* The navigator confirms by reading the page it landed on, so that is
           the evidence it can offer. Named rather than left empty: an empty
           list would read as "submitted on no evidence", which is the exact
           claim this field exists to prevent. */
        return { outcome: 'submitted', reference: result.reference, evidence: ['the multi-step navigator saw a confirmation page'] };
      }
      if (result.outcome === 'failed') return { outcome: 'failed', reason: result.reason };

      /*
       * Pressed, and could not confirm.
       *
       * This ended as `needsUser` and, on an account set never to ask, as a
       * skip — for a run that had already clicked submit on the employer's
       * form. "Skipped" states that nothing was sent, which is precisely what
       * nobody knows here.
       */
      if ((result as { pressedSubmit?: boolean }).pressedSubmit) {
        return {
          outcome: 'unconfirmed',
          reason: `The form was submitted but the result could not be confirmed. ${result.reason}`,
          evidence: [`the navigator pressed submit across ${result.pagesVisited} page(s) and saw no confirmation`],
        };
      }
      /* `prepared` reaching here would mean the navigator declined to submit on
         a path the workflow had already cleared — a disagreement between two
         gates, which is a handoff rather than a failure. */
      return { outcome: 'needsUser', reason: result.reason };
    } finally {
      await session.close();
    }
  }
}

/** No stored answers. Survey mode never fills, so it never needs any. */
const NO_ANSWERS: FieldResolver = async () => ({ answers: [], blocked: [] });

/**
 * Fall back to the mappings the workflow already computed.
 *
 * Only reached if a caller submits without passing a resolver. It covers the
 * first page correctly and refuses everything it has not seen, so a wizard
 * parks on step two rather than being filled from nothing.
 */
function fromMappings(fill: FillResult): FieldResolver {
  const known = new Map(fill.mappings.map((m) => [m.field, m.value]));
  return async (fields) => ({
    answers: fields.filter((f) => known.has(f.id)).map((f) => ({ field: f.id, value: known.get(f.id)! })),
    blocked: fields
      .filter((f) => !known.has(f.id) && f.kind !== 'file')
      .map((f) => ({ field: f.id, reason: 'This question appears later in the application and has no stored answer.' })),
  });
}

/**
 * Answer a verification-code field from the candidate's own application inbox.
 *
 * Some flows email a code before they will accept the form. The code is fetched
 * rather than stored, because it is valid for minutes and belongs to this
 * attempt only. A code that has not arrived is a refusal, not a blank.
 */
const OTP_FIELD = /verification|one[-\s]?time|otp|confirmation\s*code|security\s*code/i;

function withOtp(inner: FieldResolver, requestOtp: () => Promise<string | null>): FieldResolver {
  return async (fields) => {
    const otpFields = fields.filter((f) => OTP_FIELD.test(`${f.id} ${f.label}`));
    const rest = fields.filter((f) => !otpFields.includes(f));
    const base = await inner(rest);
    if (otpFields.length === 0) return base;

    const code = await requestOtp().catch(() => null);
    for (const f of otpFields) {
      if (code) base.answers.push({ field: f.id, value: code });
      else base.blocked.push({ field: f.id, reason: 'This application wants a verification code that has not arrived yet.' });
    }
    return base;
  };
}

function toQuestion(f: { id: string; label: string; required: boolean; kind: FormQuestion['kind'] }): FormQuestion {
  return { id: f.id, label: f.label, required: f.required, kind: f.kind };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Identity fields, by what the form calls them.
 *
 * Returns the value when this is an identity field we can answer, an empty
 * string when it is one we cannot, and `null` when the field is not an
 * identity field at all — three outcomes the caller has to tell apart.
 */
export function matchIdentity(key: string, profile: Record<string, string>): string | null {
  const has = (...needles: string[]) => needles.some((n) => key.includes(n));

  /* Order matters: "first name" contains "name", so the specific tests run
     before the general one. */
  if (has('first name', 'first_name', 'firstname', 'given name', 'fname')) return profile.firstName ?? '';
  if (has('last name', 'last_name', 'lastname', 'surname', 'family name', 'lname')) return profile.lastName ?? '';
  if (has('full name', 'your name', 'candidate name') || key.trim() === 'name') {
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  }
  if (has('email', 'e-mail')) return profile.email ?? '';
  if (has('phone', 'mobile', 'telephone', 'contact number')) return profile.phone ?? '';
  if (has('linkedin')) return profile.linkedin ?? '';
  if (has('github')) return profile.github ?? '';
  /* Portfolio before website: "Portfolio URL" contains neither "website" nor
     "personal site", and answering it with a generic personal-site field was
     how one candidate's applications pointed at three different URLs. */
  if (has('portfolio')) return profile.portfolio || profile.website || '';
  if (has('website', 'personal site')) return profile.website ?? '';
  return null;
}

export const genericBrowserAdapter = new GenericBrowserAdapter();
