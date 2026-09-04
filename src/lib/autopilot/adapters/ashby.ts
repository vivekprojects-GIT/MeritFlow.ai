import type { FormQuestion } from '../answer-vault';
import type { AdapterContext, AtsAdapter, InspectResult } from './types';
import { genericBrowserAdapter } from './generic';

/**
 * Ashby.
 *
 * ## The one thing that makes this adapter necessary
 *
 * **Ashby identifies its fields by UUID.** A live form returns:
 *
 *     4b71793a-c95c-4cc9-9d06-02e6ef7c5777   → "Phone"
 *     dc915b3a-c535-49df-abd6-dc8f3ddf6728   → "LinkedIn Profile"
 *     0086e069-bc0c-467b-8d38-c3f023146e79   → "Please elaborate on your
 *                                               experience building software in AWS"
 *
 * That is the exact inverse of Lever, where the names are structural
 * (`urls[LinkedIn]`, `org`) and the labels are whatever the employer typed.
 * Here the name carries no meaning whatsoever and the **label is the only
 * signal there is** — so anything matching on field names, which is how the
 * generic reader identifies a phone number, matches nothing at all.
 *
 * Two adapters, opposite rules, and neither can be inferred from the other.
 * This is what "the moat is ATS coverage" means in practice.
 *
 * ## The rest of what a live form showed
 *
 * **`_systemfield_*` are Ashby's built-ins** — `_systemfield_name` is one legal
 * name, not first and last, and `_systemfield_resume` is the CV.
 *
 * **File inputs carry an id but no `name` attribute at all.** A reader keyed on
 * `name` misses the résumé field entirely, then reports the application as
 * complete without one.
 *
 * **`g-recaptcha-response` is a text input.** It looks exactly like a question,
 * and a generic reader offers it to the candidate as one.
 */

const HOST = /(^|\.)ashbyhq\.com$/i;

/** Ashby's own fields, by their stable prefix. */
const SYSTEM = /^_systemfield_/;

/**
 * Machinery that is not a question.
 *
 * Consent fields are deliberately absent: they are excluded from the question
 * list too, but they are a choice the candidate makes rather than plumbing,
 * and a taxonomy that conflates the two is one that future code branches on
 * incorrectly.
 */
const PLUMBING = new Set(['g-recaptcha-response', 'h-captcha-response']);

export type AshbyFieldKind = 'identity' | 'resume' | 'custom' | 'consent' | 'plumbing';

/**
 * Classify an Ashby field.
 *
 * `name` is usually a UUID and tells us nothing, so the label does the work —
 * which is safe here precisely because Ashby's labels are the human-readable
 * question and its names are not.
 */
export function classifyField(name: string, label: string): AshbyFieldKind {
  if (PLUMBING.has(name)) return 'plumbing';
  if (/recaptcha|captcha/i.test(name)) return 'plumbing';
  if (/consent/i.test(name)) return 'consent';

  if (SYSTEM.test(name)) {
    if (/resume|cv/i.test(name)) return 'resume';
    return 'identity';
  }

  /* Ashby's own file fields carry an id and no name, so the label is all there
     is to go on. Getting this wrong means an application reported complete
     with no CV attached. */
  const text = label.toLowerCase();
  if (/^\s*(resume|cv)\b/.test(text)) return 'resume';

  return 'custom';
}

/** The URL parts Ashby addresses a posting by. */
export type AshbyRef = { token: string; postingId: string };

export function parseAshbyUrl(raw: string): AshbyRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!HOST.test(url.hostname)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [token, postingId] = parts;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postingId)) return null;
  return { token, postingId };
}

/** The page that actually accepts an application. */
export function applyUrlFor(ref: AshbyRef): string {
  return `https://jobs.ashbyhq.com/${ref.token}/${ref.postingId}/application`;
}

/* ── The public posting ──────────────────────────────────────────────────── */

export type AshbyPosting = {
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string;
  /** False when Ashby no longer lists it — a closed job, not a failure. */
  open: boolean;
};

type RawPosting = {
  title?: string;
  location?: string;
  descriptionPlain?: string;
  jobUrl?: string;
  applyUrl?: string;
  isListed?: boolean;
};

export async function fetchPosting(ref: AshbyRef): Promise<AshbyPosting> {
  const fallback: AshbyPosting = {
    title: '',
    company: ref.token,
    location: '',
    description: '',
    applyUrl: applyUrlFor(ref),
    open: false,
  };

  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${ref.token}`, {
    headers: { accept: 'application/json', 'user-agent': 'MeritFlow-JobIngest' },
    cache: 'no-store',
  });
  if (!res.ok) return fallback;

  const board = (await res.json()) as { jobs?: RawPosting[] };
  const hit = (board.jobs ?? []).find((p) => (p.jobUrl ?? '').includes(ref.postingId));
  if (!hit) return fallback;

  return {
    title: (hit.title ?? '').trim(),
    company: ref.token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    location: hit.location ?? '',
    description: (hit.descriptionPlain ?? '').slice(0, 4000),
    applyUrl: hit.applyUrl ?? applyUrlFor(ref),
    /* `isListed` false means the posting is still reachable but withdrawn from
       the board. Treated as closed: applying to something an employer has
       unlisted is not what the candidate asked for. */
    open: hit.isListed !== false,
  };
}

/* ── The adapter ─────────────────────────────────────────────────────────── */

export class AshbyAdapter implements AtsAdapter {
  readonly vendor = 'ashby' as const;

  detect(url: string): boolean {
    return parseAshbyUrl(url) !== null;
  }

  async inspect(url: string, ctx: AdapterContext = {}): Promise<InspectResult> {
    const ref = parseAshbyUrl(url);
    if (!ref) throw new Error('That is not an Ashby posting URL.');

    const posting = await fetchPosting(ref);
    if (!posting.open) {
      throw new Error('This posting is no longer listed on Ashby. It has probably closed.');
    }

    const [{ openSession }, { navigate }, { PlaywrightDriver }] = await Promise.all([
      import('./browser'),
      import('../navigator/run'),
      import('../navigator/playwright-driver'),
    ]);

    const session = await openSession();
    try {
      await session.page.goto(posting.applyUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      /* Entirely client-rendered, and slower to mount than Lever. */
      await session.page.waitForTimeout(3500);

      const driver = new PlaywrightDriver(session.page, ctx.resolve ?? NO_ANSWERS, null);
      const result = await navigate(driver, {
        mode: 'survey',
        allowSubmit: false,
        hasResume: false,
        maxSteps: 3,
        budgetMs: 60_000,
      });

      const reason = 'reason' in result ? result.reason : '';

      const questions: FormQuestion[] = result.questionsSeen
        .filter((f) => {
          const kind = classifyField(f.id, f.label);
          return kind !== 'plumbing' && kind !== 'consent';
        })
        .map((f) => ({ id: f.id, label: f.label, required: f.required, kind: f.kind }));

      /*
       * An inspect that found nothing is a failure, not an empty application.
       *
       * A board API can still list a posting whose page has since 404'd —
       * observed live on a Lever tenant. Returning zero questions let that
       * sail through as a readable application with nothing to fill in, which
       * downstream reads as "no required fields" and validates happily.
       */
      if (questions.length === 0) {
        throw new Error(
          reason || 'The application form on this posting could not be read. It may have closed.',
        );
      }

      return {
        ats: 'ashby',
        url: posting.applyUrl,
        title: posting.title,
        company: posting.company,
        questions,
        requiresAccount: false,
        /* Observed live on a real Ashby application. */
        requiresHumanChallenge: /CAPTCHA/i.test(reason),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Delegated whole.
   *
   * The vault canonicalises questions by **label**, which is exactly the signal
   * Ashby provides — so "Phone" and "LinkedIn Profile" resolve correctly even
   * though their field names are UUIDs. Nothing about the mapping needs to
   * change; what this adapter contributes is dropping the reCAPTCHA input and
   * the consent radios from the question list before they reach it.
   */
  fill(input: Parameters<AtsAdapter['fill']>[0]) {
    return genericBrowserAdapter.fill(input);
  }

  validate(input: Parameters<AtsAdapter['validate']>[0]) {
    return genericBrowserAdapter.validate(input);
  }

  /**
   * Send it.
   *
   * Delegated to the generic adapter, which drives the navigator. That loop is
   * ATS-agnostic by design — observe, fill from the vault, advance, submit —
   * and this adapter's contribution is upstream, in the question list it hands
   * over. Writing a second submit here would be a second place for the
   * one-submission-per-run guard and the CAPTCHA check to live.
   */
  submit(input: Parameters<NonNullable<AtsAdapter['submit']>>[0]) {
    return genericBrowserAdapter.submit!(input);
  }
}

const NO_ANSWERS = async () => ({ answers: [], blocked: [] });

export const ashbyAdapter = new AshbyAdapter();
