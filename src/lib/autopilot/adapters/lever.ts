import type { FormQuestion } from '../answer-vault';
import type { AdapterContext, AtsAdapter, InspectResult } from './types';
import { genericBrowserAdapter } from './generic';

/**
 * Lever.
 *
 * ## What an adapter knows that a DOM read does not
 *
 * Everything below came from reading a live Lever application rather than from
 * documentation, and every item is something the generic reader gets wrong:
 *
 * **`name` is one field, not two.** Lever asks for a full name. A generic
 * matcher that has learned "first_name / last_name" from every other ATS has
 * to be told.
 *
 * **`location` is a typeahead with a hidden partner.** Typing into `location`
 * and moving on leaves `selectedLocation` empty, and the form fails validation
 * with a message about a field the candidate can see is filled in. The value
 * has to be chosen from the dropdown.
 *
 * **`resume` uploads asynchronously into `resumeStorageId`.** Attaching the
 * file and pressing submit immediately submits without a résumé, because the
 * upload had not finished writing the hidden id.
 *
 * **`surveysResponses[...]` are EEO surveys, not screening questions.** They
 * look identical to custom questions in the DOM. Answering them from a
 * confident guess is answering demographic questions on someone's behalf.
 *
 * **A lot of the form is plumbing.** `accountId`, `origin`, `referer`,
 * `source`, `socialSource`, `timezone`, `baseTemplate`, `surveyId` — machinery
 * that must never be treated as a question.
 *
 * ## Why the posting comes from the API
 *
 * `api.lever.co/v0/postings/{token}` is public, returns the title, description
 * and the canonical apply URL, and says whether the posting still exists. That
 * last part matters: a posting discovered an hour ago is routinely gone by the
 * time an application starts, and Lever answers with a 404 page rather than an
 * error — so a browser-only adapter reads "no application form was found" and
 * reports a bug where there is a closed job.
 */

const HOST = /(^|\.)lever\.co$/i;

/** Fields that are machinery. Never questions, never filled. */
const PLUMBING = new Set([
  'accountId',
  'origin',
  'referer',
  'source',
  'socialSource',
  'socialReferralKey',
  'timezone',
  'linkedInData',
  'resumeStorageId',
  'selectedLocation',
  'h-captcha-response',
]);

/** Where a Lever field belongs. */
export type LeverFieldKind =
  | 'identity'
  | 'url'
  | 'resume'
  /** A screening question the employer wrote. Answered from the vault by label. */
  | 'custom'
  /** An EEO or diversity survey. Never answered from an inference. */
  | 'demographic'
  /** Consent and marketing opt-ins — a choice, not a fact. */
  | 'consent'
  | 'plumbing';

/**
 * Classify a Lever field by its name.
 *
 * Name rather than label, because the names are structural and stable while
 * the labels are whatever the employer typed.
 */
export function classifyField(name: string): LeverFieldKind {
  if (PLUMBING.has(name) || /\[(baseTemplate|surveyId|candidateSelectedLocation)\]$/.test(name)) return 'plumbing';
  if (name === 'resume') return 'resume';
  if (name.startsWith('urls[')) return 'url';
  if (name.startsWith('consent[')) return 'consent';
  /* Surveys are the EEO block. Cards are the employer's own questions. */
  if (name.startsWith('surveysResponses[')) return 'demographic';
  if (name.startsWith('cards[')) return 'custom';
  if (['name', 'email', 'phone', 'org', 'location', 'pronouns'].includes(name)) return 'identity';
  return 'custom';
}

/** The URL parts Lever addresses a posting by. */
export type LeverRef = { token: string; postingId: string };

/**
 * Pull the board token and posting id out of any Lever URL.
 *
 * Handles the posting page, the apply page, and a trailing slash or query,
 * because a feed hands over all three shapes.
 */
export function parseLeverUrl(raw: string): LeverRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!HOST.test(url.hostname)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  /* /{token}/{postingId}[/apply] — anything shorter is a board listing, which
     is a page of jobs rather than a job. */
  if (parts.length < 2) return null;

  const [token, postingId] = parts;
  /* Lever posting ids are UUIDs. Requiring the shape stops a board URL with a
     department segment being read as a posting. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postingId)) return null;

  return { token, postingId };
}

/** The page that actually accepts an application. */
export function applyUrlFor(ref: LeverRef): string {
  return `https://jobs.lever.co/${ref.token}/${ref.postingId}/apply`;
}

/* ── The public posting ──────────────────────────────────────────────────── */

export type LeverPosting = {
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string;
  /** False when Lever no longer serves it — a closed job, not a failure. */
  open: boolean;
};

type RawPosting = {
  text?: string;
  categories?: { location?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  hostedUrl?: string;
  applyUrl?: string;
};

/**
 * Read one posting from Lever's public API.
 *
 * Single-posting reads are not offered, so the board is fetched and filtered.
 * A board is one request and a few hundred kilobytes, which is cheaper than
 * rendering the page in a browser to learn the same four facts.
 */
export async function fetchPosting(ref: LeverRef): Promise<LeverPosting> {
  const res = await fetch(`https://api.lever.co/v0/postings/${ref.token}?mode=json`, {
    headers: { accept: 'application/json', 'user-agent': 'MeritFlow-JobIngest' },
    cache: 'no-store',
  });

  const fallback: LeverPosting = {
    title: '',
    company: ref.token,
    location: '',
    description: '',
    applyUrl: applyUrlFor(ref),
    open: false,
  };

  if (!res.ok) return fallback;

  const board = (await res.json()) as RawPosting[];
  const hit = (Array.isArray(board) ? board : []).find((p) => (p.hostedUrl ?? '').includes(ref.postingId));
  if (!hit) return fallback;

  return {
    title: hit.text ?? '',
    /* Lever does not return a display name, and the token is the only stable
       identifier. Title-cased so a receipt does not read "acmecorp". */
    company: ref.token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    location: hit.categories?.location ?? '',
    description: [hit.descriptionPlain ?? '', hit.additionalPlain ?? ''].join('\n\n').slice(0, 4000).trim(),
    applyUrl: hit.applyUrl ?? applyUrlFor(ref),
    open: true,
  };
}

/* ── The adapter ─────────────────────────────────────────────────────────── */

export class LeverAdapter implements AtsAdapter {
  readonly vendor = 'lever' as const;

  detect(url: string): boolean {
    return parseLeverUrl(url) !== null;
  }

  /**
   * Read the application.
   *
   * The posting comes from the API and the questions come from the rendered
   * apply page, because custom questions are per-posting and appear nowhere in
   * the public feed. Plumbing and demographic surveys are dropped here rather
   * than downstream: a field that is not a question should never reach the
   * verifier, where it would count as something the candidate failed to answer.
   */
  async inspect(url: string, ctx: AdapterContext = {}): Promise<InspectResult> {
    const ref = parseLeverUrl(url);
    if (!ref) throw new Error('That is not a Lever posting URL.');

    const posting = await fetchPosting(ref);
    if (!posting.open) {
      throw new Error('This posting is no longer listed on Lever. It has probably closed.');
    }

    const [{ openSession }, { navigate }, { PlaywrightDriver }] = await Promise.all([
      import('./browser'),
      import('../navigator/run'),
      import('../navigator/playwright-driver'),
    ]);

    const session = await openSession();
    try {
      await session.page.goto(posting.applyUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      /* The form is client-rendered; the raw HTML carries no fields at all. */
      await session.page.waitForTimeout(2500);

      const driver = new PlaywrightDriver(session.page, ctx.resolve ?? NO_ANSWERS, null);
      const result = await navigate(driver, {
        mode: 'survey',
        allowSubmit: false,
        hasResume: false,
        maxSteps: 3,
        budgetMs: 60_000,
      });

      const reason = 'reason' in result ? result.reason : '';
      const captcha = /CAPTCHA/i.test(reason);

      const questions: FormQuestion[] = result.questionsSeen
        .filter((f) => {
          const kind = classifyField(f.id);
          /* Demographic surveys are excluded from the question list entirely.
             They are voluntary, they are the candidate's to answer, and
             surfacing them as unanswered questions would block every Lever
             application on something nobody is obliged to fill in. */
          return kind !== 'plumbing' && kind !== 'demographic' && kind !== 'consent';
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
        ats: 'lever',
        url: posting.applyUrl,
        title: posting.title,
        company: posting.company,
        questions,
        requiresAccount: false,
        requiresHumanChallenge: captcha,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Map onto Lever's vocabulary.
   *
   * Delegated whole. Lever's single `name` field is already handled — the
   * generic matcher joins first and last for a "full name" label — and
   * `urls[LinkedIn]` and `urls[GitHub]` match on the substring the bracket
   * syntax happens to contain. Reimplementing the mapping to change nothing is
   * how two adapters drift into disagreeing about what a résumé field is.
   *
   * What this adapter contributes is upstream, in `inspect`: the question list
   * it hands over has already had plumbing, consent and EEO surveys removed,
   * so the mapping never sees a field that is not a question.
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

/** Survey mode never fills, so it never needs stored answers. */
const NO_ANSWERS = async () => ({ answers: [], blocked: [] });

export const leverAdapter = new LeverAdapter();
