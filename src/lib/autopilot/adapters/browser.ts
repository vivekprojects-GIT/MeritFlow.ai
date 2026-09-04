import type { Browser, Locator, Page } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AtsVendor } from '../execution-policy';
import type { FillResult, InspectResult, SubmitResult } from './types';
import { chooseOption, type SelectOption } from './select-option';
import { headedOptions } from '../artifacts';

/**
 * Headless browser execution.
 *
 * "Headless" here means it runs on the server without a visible window, not
 * that it runs without the candidate's knowledge: every field, answer and
 * outcome is written to a receipt they can read, and the application shows up
 * in their tracker either way. An application sent on someone's behalf that
 * they cannot later inspect is not automation, it is a liability.
 *
 * ## What this will not do
 *
 * If a CAPTCHA, a bot check or a login wall appears, the run stops and hands
 * back to the person. There is no solver here and there will not be one. That
 * is a real ceiling on how much can be automated, and pretending otherwise
 * would mean silently failing applications the candidate believes were sent.
 */

/** One browser per process, reused. Launching costs about a second. */
let shared: Browser | null = null;

async function browser(): Promise<Browser> {
  if (shared?.isConnected()) return shared;
  const { chromium } = await import('playwright');
  /* Headed and slowed down when AUTOPILOT_HEADED is set: watching the cursor
     land in the wrong box explains an adapter bug faster than any log line.
     Headless everywhere else, because a server with no display cannot open a
     window. */
  shared = await chromium.launch({
    ...headedOptions(),
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return shared;
}

export async function closeBrowser(): Promise<void> {
  await shared?.close().catch(() => {});
  shared = null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

/**
 * A page that outlives a single read.
 *
 * `browserInspect` and `browserSubmit` each open a context, do one thing and
 * close it, which is right for a single-page form and impossible for a wizard:
 * step four only exists inside the session that completed step three. The
 * navigator holds one of these across the whole application.
 */
export async function openSession(): Promise<{ page: Page; close: () => Promise<void> }> {
  const b = await browser();
  const context = await b.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  return { page, close: () => context.close().catch(() => {}) };
}

/* ── Detection ───────────────────────────────────────────────────────────── */

const CHALLENGE_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[title*="challenge" i]',
  '[class*="cf-turnstile"]',
  '#px-captcha',
  '[data-testid*="captcha" i]',
];

const LOGIN_HINTS = ['input[type="password"]', 'a[href*="signin" i]', 'a[href*="login" i]', 'button:has-text("Sign in")'];

/**
 * Is there something on this page that requires the person?
 *
 * Checked before filling and again before submitting, because challenges are
 * routinely injected only once a form looks complete.
 */
async function humanRequired(page: Page): Promise<string | null> {
  for (const sel of CHALLENGE_SELECTORS) {
    /* Present is not the same as shown. Nearly every application form loads an
       invisible hCaptcha or reCAPTCHA that scores the session silently, and
       counting those as challenges stopped eleven of thirteen live tenants for
       no reason. `isVisible` is Playwright's own on-screen test. */
    const widget = page.locator(sel).first();
    if ((await widget.count()) > 0 && (await widget.isVisible().catch(() => false))) {
      return 'This application shows a CAPTCHA, which only you can complete.';
    }
  }
  /* A password field on an application page means an account wall. A sign-in
     link alone does not: most careers pages carry one in the header. */
  if ((await page.locator(LOGIN_HINTS[0]).count()) > 0) return 'This application requires an account before it can be sent.';
  return null;
}

/* ── Inspection ──────────────────────────────────────────────────────────── */

export type DiscoveredField = {
  id: string;
  label: string;
  required: boolean;
  kind: 'text' | 'textarea' | 'select' | 'boolean' | 'file';
  options: string[];
};

/* ── Field matching ──────────────────────────────────────────────────────── */

/**
 * Find the control for a logical field.
 *
 * Tries the ATS's own attributes first and visible label text last, because
 * label matching is the guess and attribute matching is the fact. Returns null
 * rather than picking a "close enough" control: writing a phone number into a
 * salary box is worse than leaving both empty and reporting it.
 */
export async function locate(page: Page, field: string) {
  const escaped = field.replace(/"/g, '\\"');
  /* Attribute selectors throughout, deliberately. An earlier version built an
     id selector with `CSS.escape`, which is a DOM API that does not exist in
     Node — it threw on the first field and the outer catch reported the whole
     run as failed, so nothing was ever filled. `[id="…"]` needs no escaping
     and works for ids that start with a digit, which `#id` does not. */
  const candidates = [
    `[name="${escaped}"]`,
    `[id="${escaped}"]`,
    `[data-field="${escaped}"]`,
    /* Synthetic ids the navigator stamps on nameless controls. */
    `[data-mf-field="${escaped}"]`,
    `[aria-label="${escaped}" i]`,
  ];

  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) return loc;
    } catch {
      /* An invalid selector for an odd field name is not fatal. */
    }
  }

  /* Label text, as a last resort and only on an exact-ish match. */
  try {
    const byLabel = page.getByLabel(new RegExp(`^\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')).first();
    if ((await byLabel.count()) > 0 && (await byLabel.isVisible())) return byLabel;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Write a value, then read it back.
 *
 * ## Why a write is not a fill
 *
 * `fill()` resolves whether or not the value survives. On a React-controlled
 * input a programmatic write can be reverted by the next render, and on a
 * component that wraps its real input in a div the locator can resolve to
 * something that accepts a value nobody reads. Both look like success.
 *
 * That is not hypothetical here. Every run reported its fields filled, clicked
 * submit, and got back "First Name is required. Last Name is required." — the
 * form was empty, the receipt said otherwise, and the disagreement was invisible
 * because nothing ever checked. Zero applications went out and every run
 * reported a clean fill.
 *
 * So the value is read back and compared. A write that did not stick is
 * reported as a failure to fill, which the submit gate then treats as a missing
 * required field — the application stops instead of being sent empty.
 *
 * ## Why a retry, and only one
 *
 * Some components accept keystrokes but ignore a bulk `fill`. Typing is the
 * one meaningfully different approach, so it is worth exactly one attempt; a
 * loop of the same failing strategy would only be slower.
 */
async function writeAndVerify(loc: Locator, value: string): Promise<boolean> {
  const matches = async (): Promise<boolean> => {
    const got = (await loc.inputValue().catch(() => null)) ?? null;
    if (got === null) return false;
    /* Forms reformat as you type -- phone numbers gain brackets, dates gain
       slashes. Comparing on alphanumerics accepts the reformatting and still
       catches an empty field or the wrong value. */
    const norm = (t: string) => t.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return norm(got) === norm(value) || (got.trim().length > 0 && norm(got).includes(norm(value).slice(0, 12)));
  };

  await loc.fill(value).catch(() => {});

  /*
   * A combobox is not satisfied by its own text.
   *
   * Greenhouse renders "Location (City)" as `role="combobox"` with
   * `aria-autocomplete="list"`: typing filters a dropdown, and the value only
   * counts once an option is chosen. Filling it left the text visible and the
   * field unset, so the form returned "Please enter your location" about a box
   * with the location in it.
   *
   * Typing, waiting for the list, and taking the first option is what a person
   * does. If no list appears the typed text stands, which is the old behaviour
   * and no worse.
   */
  const role = await loc.getAttribute('role').catch(() => null);
  const autocomplete = await loc.getAttribute('aria-autocomplete').catch(() => null);
  if (role === 'combobox' || autocomplete === 'list') {
    /*
     * Two attempts, because the suggestion service is a network call.
     *
     * The first Ashby run typed the city, waited six seconds, saw no options
     * -- a cold session against a slow places lookup -- pressed Enter, and
     * counted the raw text as success. The form's own validation then refused
     * the "filled" field with "Missing entry for required field: Location",
     * after the submit was already pressed. Typed text that never became a
     * selection is a failure and must be reported as one.
     */
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await loc.click({ timeout: 5_000 }).catch(() => {});
      await loc.fill('').catch(() => {});
      await loc.pressSequentially(value, { delay: 50, timeout: 15_000 }).catch(() => {});

      const option = loc.page().locator('[role="option"]:visible').first();
      const appeared = await option
        .waitFor({ state: 'visible', timeout: attempt === 0 ? 8_000 : 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!appeared) continue;

      const chosen = ((await option.innerText().catch(() => '')) || '').trim();
      await option.click({ timeout: 5_000 }).catch(() => {});
      if (chosen) return true;
      if (await matches()) return true;
    }
    /*
     * No option ever offered. On Lever the committed value lives in a paired
     * hidden input its geocoder was supposed to fill -- writing it there is
     * what choosing a suggestion would have done, with the exact value the
     * candidate gave. Anywhere else, typed-but-never-selected text is a
     * failure, and saying so lets the run stop honestly instead of submitting
     * a form its own validation will refuse.
     */
    const paired = loc.page().locator('input[type="hidden"][name*="selected" i], input[type="hidden"][id*="selected" i]').first();
    if ((await paired.count().catch(() => 0)) > 0) {
      await paired
        .evaluate((el, v) => {
          (el as HTMLInputElement).value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, value)
        .catch(() => {});
      return true;
    }
    return false;
  }

  if (await matches()) return true;

  /* Second and last attempt: keystrokes, for components that listen for them
     and ignore a bulk write. */
  await loc.click({ timeout: 5_000 }).catch(() => {});
  await loc.fill('').catch(() => {});
  await loc.pressSequentially(value, { delay: 12, timeout: 15_000 }).catch(() => {});
  return matches();
}

export async function setValue(page: Page, field: string, value: string): Promise<boolean> {
  const loc = await locate(page, field);
  if (!loc) return false;

  const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  const type = (await loc.getAttribute('type').catch(() => '')) ?? '';

  try {
    if (tag === 'select') {
      /*
       * Matched against the options the form actually offers, rather than
       * handed to Playwright to match exactly.
       *
       * The vault stores "Yes (United States)" and the dropdown offers "Yes",
       * so exact matching failed on every eligibility question on every form.
       * `chooseOption` returns null when the answer is ambiguous, and a null
       * here becomes an unanswered question rather than a guessed one.
       */
      const options = (await loc.evaluate((el) =>
        Array.from((el as HTMLSelectElement).options).map((o) => ({ label: o.textContent ?? '', value: o.value })),
      )) as SelectOption[];

      const picked = chooseOption(value, options);
      if (!picked) return false;
      await loc.selectOption(picked.value);
      /* Read back, for the same reason as a text field. */
      const chosen = await loc.inputValue().catch(() => '');
      return chosen === picked.value;
    }
    if (type === 'radio') {
      /*
       * A radio in a group is answered by choosing the peer whose label
       * matches the value -- not by ticking whichever radio the locator found
       * first. The old boolean branch also returned success for a non-yes
       * value without touching the page at all, which reported "filled" on a
       * question nothing had answered.
       *
       * The *label* is clicked rather than the input: custom-styled groups
       * hide the input off-screen, and the label is the thing a person can
       * press.
       */
      const name = (await loc.getAttribute('name').catch(() => null)) ?? field;
      const peers = page.locator(`input[type="radio"][name="${cssEscape(name)}"]`);
      const total = await peers.count().catch(() => 0);
      const want = value.trim().toLowerCase();

      for (let i = 0; i < total; i += 1) {
        const peer = peers.nth(i);
        const pid = (await peer.getAttribute('id').catch(() => null)) ?? '';
        if (!pid) continue;
        const plabel = page.locator(`label[for="${cssEscape(pid)}"]`).first();
        const text = ((await plabel.innerText().catch(() => '')) || '').trim().toLowerCase();
        if (!text) continue;
        const matches = text === want || want.startsWith(text) || (text.length >= 3 && want.includes(text)) || (want.length >= 3 && text.includes(want));
        if (!matches) continue;
        await plabel.click({ timeout: 8_000 }).catch(() => {});
        return peer.isChecked().catch(() => false);
      }
      return false;
    }
    if (type === 'checkbox') {
      /*
       * A Yes/No pair rendered as two checkboxes is a radio group in checkbox
       * clothing -- Ashby does this -- and ticking "the" checkbox for a "No"
       * answer means ticking the *No* box, not skipping the question. When the
       * control has labelled peers, answer it exactly like a radio group.
       */
      const name = (await loc.getAttribute('name').catch(() => null)) ?? '';
      const peerCount = name ? await page.locator(`input[type="checkbox"][name="${cssEscape(name)}"]`).count().catch(() => 0) : 0;
      if (name && peerCount > 1) {
        const peers = page.locator(`input[type="checkbox"][name="${cssEscape(name)}"]`);
        const want = value.trim().toLowerCase();
        for (let i = 0; i < peerCount; i += 1) {
          const peer = peers.nth(i);
          const pid = (await peer.getAttribute('id').catch(() => null)) ?? '';
          if (!pid) continue;
          const plabel = page.locator(`label[for="${cssEscape(pid)}"]`).first();
          const text = ((await plabel.innerText().catch(() => '')) || '').trim().toLowerCase();
          if (!text) continue;
          if (text === want || want.startsWith(text) || (text.length >= 3 && want.includes(text))) {
            await plabel.click({ timeout: 8_000 }).catch(() => {});
            return peer.isChecked().catch(() => false);
          }
        }
        return false;
      }

      const truthy = /^(yes|true|1|on)$/i.test(value);
      if (!truthy) return true;
      await loc.check().catch(() => {});
      /* A box that did not tick is not a ticked box, however the click went. */
      return loc.isChecked().catch(() => false);
    }
    if (type === 'file') return false; // handled separately
    return writeAndVerify(loc, value);
  } catch {
    return false;
  }
}

/* ── Submission ──────────────────────────────────────────────────────────── */

/**
 * Finding the control that sends the application.
 *
 * ## Why the old list was dangerous
 *
 * It was a selector list ending in `button[type="submit"]`, taken with
 * `.first()`. On Instacart's careers site every navigation button is built as
 * `type="submit"`, and the first visible one is **"Skip to main content"** —
 * so the run reported "could not find the submit control" only because that
 * page had no form at all. On a page that did, it would have clicked the skip
 * link and reported the application sent.
 *
 * A submit finder that can match a navigation element is not a submit finder.
 *
 * ## What replaces it
 *
 * Two conditions, both required. The control has to sit inside the form we just
 * filled — scoped by a field we actually wrote to — and its text has to read
 * like sending an application. Type alone is not evidence of anything, and
 * neither is position.
 */
/**
 * Ranked submit labels, best first.
 *
 * Three outcomes are possible when looking for the control that sends an
 * application, and they need different handling:
 *
 *   nothing on the page is a form   -> the employer redirects elsewhere
 *   exactly one candidate           -> click it
 *   several equally good candidates -> stop, do not pick
 *
 * The third is the one that used to be resolved by taking the first match.
 * Adding another selector to the list is how that keeps happening; ranking and
 * refusing to break a tie is how it stops.
 */
const SUBMIT_RANKS: [number, RegExp][] = [
  [100, /^submit\s+application$/i],
  [95, /^(complete|finish)\s+application$/i],
  [90, /^send\s+application$/i],
  [80, /^submit\s+my\s+application$/i],
  [70, /^apply\s+for\s+this\s+job$/i],
  [60, /^submit$/i],
  [55, /^apply\s+now$/i],
  [50, /^apply$/i],
  [45, /^send$/i],
  [45, /^(finish|complete)\s+and\s+submit$/i],
  [40, /^(finish|complete)$/i],
];

/** Things that look like a submit and would do something else entirely. */
const NOT_SUBMIT =
  /skip\s+to|main\s+content|open\s+menu|close|\bback\b|search|sign\s+(in|up)|log\s+in|cookie|accept\s+all|get\s+started|learn\s+more|save\s+(job|for\s+later)|share|subscribe|newsletter|refer\s+a|submit\s+(referral|search|feedback)|continue\s+shopping/i;

/**
 * How strongly this label reads as sending the application. Zero means not at
 * all.
 *
 * Exported so the judgement can be tested without a browser: driving Playwright
 * to assert this would be testing Playwright.
 */
export function submitRank(label: string): number {
  const text = label.replace(/\s+/g, ' ').trim();
  if (!text || NOT_SUBMIT.test(text)) return 0;
  for (const [rank, pattern] of SUBMIT_RANKS) {
    if (pattern.test(text)) return rank;
  }
  return 0;
}

/** True for a control that must never be treated as a submission. */
export function isNotSubmit(label: string): boolean {
  return NOT_SUBMIT.test(label.trim());
}

/** Kept for callers that only need the boolean. */
export function isSubmitLabel(label: string): boolean {
  return submitRank(label) > 0;
}

export type SubmitSearch =
  | { found: true; control: Locator; label: string }
  | { found: false; why: 'NO_FORM' | 'NO_CONTROL' | 'AMBIGUOUS'; detail: string };

/**
 * The control that sends this application.
 *
 * Scoped to the form the fields we filled actually live in: a page carries a
 * newsletter signup, a search box and a cookie banner, each with its own submit,
 * and Instacart's careers site builds every navigation button as
 * `type="submit"` — where the first visible one is "Skip to main content".
 */
async function findSubmit(page: Page, filledFieldIds: string[]): Promise<SubmitSearch> {
  let form: Locator | null = null;

  for (const id of filledFieldIds.slice(0, 6)) {
    for (const sel of [`[name="${cssEscape(id)}"]`, `#${cssEscape(id)}`]) {
      const field = page.locator(sel).first();
      if ((await field.count().catch(() => 0)) === 0) continue;
      const owner = field.locator('xpath=ancestor::form[1]');
      if ((await owner.count().catch(() => 0)) > 0) {
        form = owner.first();
        break;
      }
    }
    if (form) break;
  }

  /*
   * Rank every plausible control inside a scope.
   *
   * Pulled out because the search runs twice: once narrowed to the form, and
   * again over the page when narrowing found nothing.
   */
  const rankWithin = async (scope: Locator): Promise<{ rank: number; control: Locator; label: string }[]> => {
    const candidates = scope.locator('button, input[type="submit"], [role="button"]');
    const total = await candidates.count().catch(() => 0);
    const out: { rank: number; control: Locator; label: string }[] = [];

    for (let i = 0; i < Math.min(total, 80); i += 1) {
      const control = candidates.nth(i);
      if (!(await control.isVisible().catch(() => false))) continue;
      if (await control.isDisabled().catch(() => false)) continue;

      const label = (
        (await control.innerText().catch(() => '')) ||
        (await control.getAttribute('value').catch(() => '')) ||
        (await control.getAttribute('aria-label').catch(() => '')) ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();

      const rank = submitRank(label);
      if (rank > 0) out.push({ rank, control, label });
    }
    return out;
  };

  const body = page.locator('body');
  let scored = await rankWithin(form ?? body);

  /*
   * Narrowing to the form is a precaution, not a requirement.
   *
   * It exists to stop a newsletter signup or a cookie banner being mistaken for
   * the application, and for that it should be tried first. But some boards put
   * the send button outside the `form` element it belongs to — associated by
   * the `form` attribute, or simply rendered into a sticky footer — and there
   * the narrowed search comes back empty on a page that plainly has a "Submit
   * application" button on it. Giving up there reports a layout change on a
   * page whose layout is fine.
   *
   * So: narrow first, widen only when narrowing found nothing at all. The tie
   * rule below still applies to the wider search, which is what keeps the
   * original precaution intact — a page with two equally plausible controls is
   * still refused rather than guessed at.
   */
  if (scored.length === 0 && form) scored = await rankWithin(body);

  if (scored.length === 0) {
    return filledFieldIds.length > 0
      ? { found: false, why: 'NO_CONTROL', detail: 'The form filled but nothing on it reads as a submit control.' }
      : { found: false, why: 'NO_FORM', detail: 'No application form on this page.' };
  }

  scored.sort((a, b) => b.rank - a.rank);

  /*
   * A tie is not resolved by position.
   *
   * Two controls that read equally well as "send this application" is a page we
   * do not understand, and clicking the first one is how an application goes to
   * the wrong place or a draft is submitted twice. Better to stop and keep the
   * page for someone to look at.
   */
  if (scored.length > 1 && scored[1].rank === scored[0].rank) {
    return {
      found: false,
      why: 'AMBIGUOUS',
      detail: `More than one control reads as submitting: "${scored[0].label}" and "${scored[1].label}".`,
    };
  }

  return { found: true, control: scored[0].control, label: scored[0].label };
}

/** Minimal CSS identifier escaping for ids and names taken from a form. */
function cssEscape(value: string): string {
  return value.replace(/["\\\\#.:>+~*^$|()[\]]/g, (m) => `\\${m}`);
}

/**
 * Was this request the one that carried the application?
 *
 * ## The failure this exists to stop
 *
 * The first version of the confirmation check counted *any* 2xx POST during the
 * click as evidence the employer had accepted the application. Every job board
 * fires analytics, telemetry and session pings on the same click, all of them
 * returning 200, so the check passed on essentially every page — and one run
 * was recorded as SUBMITTED with no other supporting signal at all. A candidate
 * was told an application had gone out that probably had not.
 *
 * The lesson is narrow and worth stating: a signal that is almost always
 * present is not evidence. Widening a check until it passes is not the same as
 * making it correct.
 *
 * ## What counts now
 *
 * The request has to go to the form's own origin — an application is posted to
 * the ATS that served the page, not to a third party — and its path has to look
 * like an application endpoint rather than a metrics one. Both conditions,
 * because either alone still admits a same-origin analytics beacon.
 */
export function isApplicationPost(pageUrl: string, requestUrl: string): boolean {
  let page: URL;
  let req: URL;
  try {
    page = new URL(pageUrl);
    req = new URL(requestUrl);
  } catch {
    return false;
  }

  /* Third-party hosts never receive the application itself. */
  if (req.host !== page.host) return false;

  const path = req.pathname.toLowerCase();

  /* Telemetry that happens to be same-origin. Checked first: some of these
     paths also contain the words below. */
  if (/\b(analytics|telemetry|metrics|beacon|track|collect|event|log|ping|heartbeat|session|csp-report)\b/.test(path)) {
    return false;
  }

  return /(apply|application|applications|submit|candidate)/.test(path);
}

/**
 * Photograph the page at the moment a submission resolves.
 *
 * ## Why a screenshot and not a log line
 *
 * Everything else this system records about a submission is its own account of
 * its own behaviour. That account has been wrong: a run once reported an
 * application as sent on the strength of an analytics beacon. A picture of the
 * employer's page is the one artefact not generated by the thing being trusted,
 * and it is what lets a candidate settle the question without taking anyone's
 * word for it.
 *
 * Taken on an unconfirmed result as well as a confirmed one, because that is
 * the case where the evidence matters most — the page is the only thing that
 * can say whether an application went through.
 *
 * Failure to capture is never allowed to affect the outcome: an application
 * that was sent was sent, whether or not the picture saved.
 */
async function captureProof(page: Page, label: string): Promise<string | null> {
  try {
    const dir = await mkdtemp(join(tmpdir(), 'meritflow-proof-'));
    const file = join(dir, `${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 60).toLowerCase()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch {
    return null;
  }
}

/**
 * Hosts whose embedded application form is itself a page we can open.
 *
 * Every major ATS offers an embed URL that renders the same form standalone.
 * That is the useful property here: rather than reaching into a frame and
 * driving it at a distance, the frame's own address is loaded as a top-level
 * page and everything downstream — locating, filling, verifying, submitting —
 * works unchanged.
 */
const EMBED_HOSTS = /greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com/i;

/**
 * Follow an embedded application form to its own URL.
 *
 * ## The page this exists for
 *
 * Large employers host careers pages themselves and drop the vendor's board in
 * an iframe. `instacart.careers/job/?gh_jid=…` resolves to a Greenhouse board
 * URL that redirects straight back to instacart.careers — a page with zero
 * inputs in its own document and the entire form inside
 * `boards.greenhouse.io/embed/job_app?for=instacart&token=…`.
 *
 * The engine looked for fields, found none, and reported that the form had not
 * appeared. It had; it was one document down.
 *
 * ## Why navigate rather than drive the frame
 *
 * A frame handle would work and would mean every function below this point
 * needing to know whether it is operating on a page or a frame. The embed URL
 * is a real page that renders the same form, so loading it directly keeps one
 * code path — and the form that submits is the vendor's own either way.
 *
 * Returns true when it moved. The caller re-checks for the form afterwards; a
 * frame that turns out not to hold a form leaves the run reporting exactly what
 * it did before.
 */
async function followEmbeddedForm(page: Page): Promise<boolean> {
  const srcs = await page
    .locator('iframe')
    .evaluateAll((frames) => frames.map((f) => (f as HTMLIFrameElement).src).filter(Boolean))
    .catch(() => [] as string[]);

  for (const src of srcs) {
    if (!EMBED_HOSTS.test(src)) continue;
    try {
      await page.goto(src, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return true;
    } catch {
      /* An embed that will not load is no worse than the page we were on. */
    }
  }
  return false;
}

/**
 * Wait until the form the mappings refer to actually exists.
 *
 * ## The failure this fixes
 *
 * `domcontentloaded` fires when the HTML is parsed, and a React-rendered
 * application form is not in the HTML — it arrives a moment later. Filling
 * immediately meant `locate` found nothing, every field was recorded as
 * skipped, the résumé still attached (its input is server-rendered), and the
 * submit click came back "First Name is required". Every run looked like a
 * confirmation-detection problem. It was an empty form.
 *
 * Waits for a field we intend to fill rather than for the network to go quiet:
 * a board with a long-polling analytics socket never reaches `networkidle`, and
 * the thing we actually need is one input we can address.
 */
async function waitForForm(page: Page, fields: string[]): Promise<boolean> {
  const wanted = fields.slice(0, 8).filter(Boolean);
  if (wanted.length === 0) return true;

  const selector = wanted
    .map((f) => {
      const escaped = f.replace(/"/g, '\\"');
      return `[name="${escaped}"], [id="${escaped}"]`;
    })
    .join(', ');

  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 20_000 });
    return true;
  } catch {
    /* Not fatal on its own: the fill loop below reports each field it could
       not find, and the submit gate refuses an incomplete form. Returning the
       fact lets the caller say which of the two happened. */
    return false;
  }
}

/**
 * Fill the real form and send it.
 *
 * Called only when the execution policy permits this vendor, the verifier has
 * cleared the run, and the structural validation passed. This function assumes
 * none of that and re-checks the human gates itself, because a check that only
 * runs upstream is a check that stops running the first time somebody adds a
 * new caller.
 */
export async function browserSubmit(input: {
  url: string;
  vendor: AtsVendor;
  inspect: InspectResult;
  fill: FillResult;
  resumePath: string | null;
  requestOtp: () => Promise<string | null>;
  /** Set false to fill and screenshot without pressing submit. */
  reallySubmit: boolean;
}): Promise<SubmitResult & { filled: string[]; skipped: string[] }> {
  const b = await browser();
  const context = await b.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const filled: string[] = [];
  const skipped: string[] = [];

  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    const blocked = await humanRequired(page);
    if (blocked) return { outcome: 'needsUser', reason: blocked, filled, skipped };

    /* The form has to be on the page before anything can be typed into it. */
    const fieldNames = input.fill.mappings.map((m) => m.field);
    let formReady = await waitForForm(page, fieldNames);

    /* Not on this page: it may be one document down, in the vendor's embed. */
    if (!formReady && (await followEmbeddedForm(page))) {
      formReady = await waitForForm(page, fieldNames);
    }

    if (!formReady) {
      return {
        outcome: 'failed',
        reason: 'The application form did not appear on this page, and no embedded form was found either.',
        filled,
        skipped,
      };
    }

    for (const m of input.fill.mappings) {
      const ok = await setValue(page, m.field, m.value);
      (ok ? filled : skipped).push(m.field);
    }

    /*
     * Nothing typed is not a form to submit.
     *
     * Clicking submit on an empty form achieves nothing, and it was doing it on
     * every run. Reported as a failure with the count, which is the sentence
     * that would have found this immediately.
     */
    if (filled.length === 0 && input.fill.mappings.length > 0) {
      return {
        outcome: 'failed',
        reason: `None of the ${input.fill.mappings.length} prepared fields could be written to this form.`,
        filled,
        skipped,
      };
    }

    if (input.resumePath) {
      const file = page.locator('input[type="file"]').first();
      if ((await file.count()) > 0) {
        await file.setInputFiles(input.resumePath).catch(() => skipped.push('resume'));

        /*
         * Wait for the board to acknowledge the file.
         *
         * An ATS uploads the attachment over its own request and marks the
         * field satisfied when that returns. Clicking submit before then gets
         * "Resume/CV is required" for a file that was handed over a second
         * earlier — which is exactly what one run reported, with the input
         * present, visible and accepting the document.
         *
         * The acknowledgement is the file's name appearing next to the input.
         * Waiting on that rather than a fixed pause means a fast board is not
         * slowed and a slow one is not raced.
         */
        const name = input.resumePath.split(/[\\/]/).pop() ?? '';
        if (name) {
          await page
            .locator(`text=${name.slice(0, 40)}`)
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 })
            .catch(() => {
              /* Not every board echoes the name. The submit-time validation
                 check below still catches a genuinely missing attachment. */
            });
        }
      } else {
        skipped.push('resume');
      }
    }

    /*
     * Fill again, because attaching a file can empty the form.
     *
     * A React form re-renders when a file input changes, and a component that
     * re-mounts comes back with its initial state — which is blank. Every text
     * field written before the upload was silently cleared, the submit click
     * came back "First Name is required", and the fill loop above had already
     * verified each value landed. Both were true: the values landed, and then
     * they were thrown away.
     *
     * So the values are checked once more after the attachment and rewritten
     * where they no longer hold. Cheap — a read per field, and a write only for
     * the ones that were lost.
     *
     * Ordering the upload first instead would not fix it: some boards re-render
     * on the *first* text entry too, and a second pass covers both without
     * having to know which kind of form this is.
     */
    if (input.resumePath && filled.length > 0) {
      await page.waitForTimeout(700);

      const relost: string[] = [];
      for (const m of input.fill.mappings) {
        if (!filled.includes(m.field)) continue;
        const loc = await locate(page, m.field);
        if (!loc) continue;

        const current = await loc.inputValue().catch(() => null);
        /* Only text-ish controls report a value this way; a select or checkbox
           returning null here is not evidence of anything. */
        if (current === null) continue;

        const norm = (t: string) => t.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (norm(current) === norm(m.value)) continue;

        const ok = await setValue(page, m.field, m.value);
        if (ok) relost.push(m.field);
      }

      /* Not an error, and worth surfacing that this board does it: the refill
         is the only reason the form is not empty at submit time. */
      if (relost.length > 0) skipped.push(`refilled-after-upload:${relost.length}`);
    }

    /* Some flows email a code before they will accept the form. */
    const otpField = await locate(page, 'verification_code');
    if (otpField) {
      const code = await input.requestOtp();
      if (!code) {
        return { outcome: 'needsUser', reason: 'This application wants a verification code that has not arrived yet.', filled, skipped };
      }
      await otpField.fill(code);
      filled.push('verification_code');
    }

    /* Re-checked here: challenges commonly appear only once a form is complete. */
    const lateBlock = await humanRequired(page);
    if (lateBlock) return { outcome: 'needsUser', reason: lateBlock, filled, skipped };

    if (!input.reallySubmit) {
      return { outcome: 'needsUser', reason: 'Filled and ready. Submission is not enabled for this route.', filled, skipped };
    }

    const search = await findSubmit(page, filled);
    if (!search.found) {
      /*
       * Three distinct failures, three distinct messages. Collapsing them sends
       * someone hunting for a selector bug when the page had no application on
       * it, or the reverse.
       */
      if (search.why === 'NO_FORM') {
        return { outcome: 'needsUser', reason: `${search.detail} The employer redirects to their own site.`, filled, skipped };
      }
      if (search.why === 'AMBIGUOUS') {
        return { outcome: 'needsUser', reason: `${search.detail} Send this one yourself rather than let it guess.`, filled, skipped };
      }
      return { outcome: 'failed', reason: `${search.detail} The page layout may have changed.`, filled, skipped };
    }
    const button = search.control;

    /*
     * Watch the network across the click.
     *
     * A page's text is one witness and not always the best one: several boards
     * post the application over XHR and render the confirmation into a frame,
     * or redirect somewhere whose body says nothing recognisable. A 2xx on the
     * request that carried the application is stronger evidence than any
     * wording, and a 4xx is the clearest possible sign it did not go — which is
     * exactly what a text-only check reads as "no confirmation appeared".
     */
    const posts: { url: string; status: number }[] = [];
    const onResponse = (res: { request: () => { method: () => string }; url: () => string; status: () => number }) => {
      try {
        if (res.request().method() === 'POST') posts.push({ url: res.url(), status: res.status() });
      } catch {
        /* A response that vanished mid-navigation tells us nothing. */
      }
    };
    page.on('response', onResponse as never);

    const urlBefore = page.url();
    await button.click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    page.off('response', onResponse as never);

    /*
     * Evidence, gathered separately and then judged.
     *
     * Kept as a list rather than collapsed into a boolean so an unconfirmed
     * submission can say what it *did* see. "Clicked, POST returned 422" and
     * "clicked, saw nothing at all" are different problems.
     */
    const body = (await page.textContent('body').catch(() => '')) ?? '';
    const evidence: string[] = [];

    if (/thank you|application (has been )?(received|submitted)|successfully submitted|we have received|your application is in/i.test(body)) {
      evidence.push('the page says the application was received');
    }

    const reference = body.match(
      /(?:reference|confirmation|application)\s*(?:number|id|#)\s*[:#]?\s*([A-Za-z0-9-]{4,})/i,
    )?.[1];
    if (reference) evidence.push(`an application reference (${reference})`);

    const urlAfter = page.url();
    if (urlAfter !== urlBefore && /thank|confirm|success|submitted|complete/i.test(urlAfter)) {
      evidence.push('the page moved to a confirmation URL');
    }

    /* Only the request that plausibly carried the application counts. See
       `isApplicationPost` for why a bare 2xx does not. */
    const appPosts = posts.filter((r) => isApplicationPost(urlBefore, r.url));
    const accepted = appPosts.filter((r) => r.status >= 200 && r.status < 300);
    const rejected = appPosts.filter((r) => r.status >= 400);

    if (accepted.length > 0 && rejected.length === 0) {
      evidence.push(`the application POST was accepted (${accepted[accepted.length - 1].status})`);
    }

    /* A rejected POST is not weak evidence of success, it is evidence of
       failure, and it outranks any reassuring text on the page. */
    if (rejected.length > 0) {
      return {
        outcome: 'failed',
        reason: `The employer's server rejected the application (HTTP ${rejected[0].status}).`,
        filled,
        skipped,
      };
    }

    if (evidence.length === 0) {
      /*
       * Say what the page did instead.
       *
       * "Nothing confirmed it" is true and useless: it reads identically
       * whether the form refused with a validation error, whether the click
       * did nothing at all, or whether the application went through and the
       * confirmation was simply unrecognisable. Those need different fixes,
       * and the difference is visible on the page for the moment after the
       * click — so it is read then rather than guessed at later.
       */
      const errors = await page
        .locator('[aria-invalid="true"], [role="alert"], .error, .field-error, [class*="error" i]')
        .allTextContents()
        .catch(() => [] as string[]);

      const shown = errors
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 2 && t.length < 160)
        .filter((t, i, all) => all.indexOf(t) === i)
        .slice(0, 4);

      const stillOnForm = page.url() === urlBefore;
      const observed = [
        `${posts.length} POST${posts.length === 1 ? '' : 's'} during the click, ${appPosts.length} of them to an application endpoint`,
        stillOnForm ? 'the page did not navigate' : `the page moved to ${page.url().slice(0, 80)}`,
        shown.length > 0 ? `the form reported: ${shown.join(' · ')}` : 'the form reported no validation errors',
      ];

      const proof = await captureProof(page, `unconfirmed-${input.vendor}`);
      if (proof) observed.push(`a screenshot of the page was saved to ${proof}`);

      return {
        outcome: 'unconfirmed',
        reason:
          shown.length > 0
            ? `The form refused to send: ${shown[0]}`
            : 'The submit control was clicked and nothing confirmed the employer received it.',
        evidence: observed,
        filled,
        skipped,
      };
    }

    /*
     * The evidence travels with the result.
     *
     * Not persisting it was how "was this really submitted?" became
     * unanswerable after the fact: the run said SUBMITTED, the reference was a
     * generated placeholder, and nothing recorded which signal had convinced
     * it. Now the receipt carries the reason.
     */
    const ref = reference ?? `${input.vendor}-${Date.now().toString(36)}`;
    const proof = await captureProof(page, `submitted-${input.vendor}`);
    if (proof) evidence.push(`a screenshot of the page was saved to ${proof}`);
    return { outcome: 'submitted', reference: ref, evidence, filled, skipped };
  } catch (err) {
    return {
      outcome: 'failed',
      reason: err instanceof Error ? err.message.split('\n')[0] : 'The browser run failed.',
      filled,
      skipped,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
