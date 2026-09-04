import type { DiscoveredField } from '../adapters/browser';

/**
 * The navigator's vocabulary.
 *
 * ## The one idea this whole module is built around
 *
 * An agent drives the *movement*; deterministic code owns the *content*.
 *
 * A general "LLM decides the next browser action" loop is the obvious way to
 * apply to any job, and it is the wrong one here — because the model would then
 * be choosing what to type into someone's application. It would answer "3
 * years" to a Kubernetes question the candidate never answered, and tick "I
 * certify the above is true" because that is plainly what the page wants next.
 *
 * So the split is enforced by the types, not by discipline:
 *
 *  - `NavigatorAction` has **no value slot anywhere**. A FILL action names the
 *    fields to fill. The values come from the answer vault, which the planner
 *    cannot reach and the model never sees.
 *  - The model may label a control as `continue`, `back` or `other`. It is
 *    structurally incapable of labelling one `submit` — that kind is assigned
 *    only by the deterministic list in `plan.ts`. A model cannot cause a
 *    submission by being confidently wrong about a button.
 *  - Everything that leaves the page — the observation — is extracted by code.
 *
 * What is genuinely left to a model is the fuzzy part that rules are bad at:
 * reading "Weiter", "Continuar" or "Save & proceed" and recognising it as
 * forward motion. That decision cannot fabricate a fact about the candidate and
 * cannot send anything.
 */

/* ── What the page is showing ────────────────────────────────────────────── */

export type ControlKind =
  /** Advances to the next step of a wizard. */
  | 'continue'
  /** Goes backwards. Recognised so it is never clicked by accident. */
  | 'back'
  /** Sends the application. Assigned by rules only, never by a model. */
  | 'submit'
  /** Opens a file picker. */
  | 'upload'
  /** Leads to a sign-in or account-creation flow. */
  | 'login'
  /** Anything else — never clicked. */
  | 'other';

export type PageControl = {
  /** Opaque handle the driver uses to act. Meaningless to the planner. */
  ref: string;
  text: string;
  kind: ControlKind;
  enabled: boolean;
};

export type Challenge = 'none' | 'captcha' | 'account';

export type PageObservation = {
  url: string;
  title: string;
  /**
   * What the page is showing right now, hashed.
   *
   * Two identical fingerprints in a row mean the last action changed nothing —
   * a validation error we cannot see, a dead button, a redirect back to the
   * same step. That is the loop's only reliable stop signal on an unfamiliar
   * site, so it is computed from content rather than from the URL, which stays
   * constant across every step of a single-page wizard.
   */
  fingerprint: string;
  /** "Step 2 of 5", when the page says so. Display only. */
  step: string;
  fields: DiscoveredField[];
  /** Ids of fields that already hold a value. */
  filled: string[];
  controls: PageControl[];
  challenge: Challenge;
  /** Non-empty when the page is confirming a completed application. */
  confirmation: string;
  /**
   * The form's own validation complaint, when one is on screen.
   *
   * "Your form needs corrections -- Missing entry for required field: X" is
   * the board saying, in its own words, that the submit press did NOT produce
   * an application. That statement is what licenses a corrected second press:
   * without it, one press per run is the rule, because a second press after an
   * ambiguous first could double-apply.
   */
  validationError: string;
};

/* ── What the navigator may do about it ──────────────────────────────────── */

/**
 * The closed action set.
 *
 * Note what is absent: there is no `EVALUATE`, no `TYPE(text)`, no
 * `CLICK(selector)`. The navigator cannot express "type this string here", so
 * no amount of prompt injection on an employer's careers page can make it.
 */
export type NavigatorAction =
  /** Fill these fields. Values are looked up by the driver, not carried here. */
  | { type: 'FILL'; fields: string[] }
  /** Attach the résumé to this file control. */
  | { type: 'UPLOAD'; ref: string }
  /** Move to the next step. */
  | { type: 'CONTINUE'; ref: string; reason: string }
  /** Send it. Only ever produced when the caller passed `allowSubmit`. */
  | { type: 'SUBMIT'; ref: string; reason: string }
  /** An employer confirmation was seen on the page. */
  | { type: 'DONE'; reference: string }
  /** Stop here. `needsUser` separates a handoff from a failure. */
  | { type: 'STOP'; reason: string; needsUser: boolean };

/* ── What the loop needs to know to decide ───────────────────────────────── */

/**
 * How far this run is allowed to go.
 *
 * `survey` reads: it walks gateway pages — a job description with an "Apply"
 * button, a language splash, a "start your application" screen — and stops the
 * moment it reaches a page that actually asks something. It never types and
 * never clicks a control on a page with fields on it.
 *
 * That restriction is not caution for its own sake. You cannot walk a
 * multi-page application to the end without eventually pressing the button that
 * sends it: on plenty of sites the last "Next" *is* the submit, and no amount
 * of button-text analysis reliably tells you which one you are looking at. So a
 * mode that is forbidden to submit is also forbidden to advance past the first
 * real question, and the full traversal happens only in `apply` — which the
 * execution policy has to authorise for that specific path first.
 */
export type NavigatorMode = 'survey' | 'apply';

export type PlanContext = {
  mode: NavigatorMode;
  /** Field ids the vault cleared for unattended use. */
  answerable: Set<string>;
  /**
   * Field ids we may not fill, and why.
   *
   * Populated from the vault's refusals: an unrecognised question, a legal
   * attestation, an answer that was never verified. A *required* field in here
   * stops the run — which is the entire point. Guessing would be easy and is
   * exactly the failure mode this system exists to avoid.
   */
  blocked: Map<string, string>;
  /** Whether the execution policy permits pressing submit on this path. */
  allowSubmit: boolean;
  /** Whether a real résumé file exists on disk to attach. */
  hasResume: boolean;
  /** Fingerprints already seen this run, for no-progress detection. */
  seen: Set<string>;
  /** True once a submit has been pressed. Guarantees at most one. */
  submitted: boolean;
  /** Steps taken so far, against the budget. */
  stepsTaken: number;
  /** Hard ceiling on steps. */
  maxSteps: number;
};

/* ── The driver ──────────────────────────────────────────────────────────── */

/**
 * Everything the loop needs from a browser, and nothing else.
 *
 * An interface rather than a direct Playwright dependency so the loop's
 * invariants — budgets, cycle detection, submit-at-most-once, never touching a
 * CAPTCHA — are testable against a scripted page sequence instead of a live
 * employer site. Those invariants are the safety story; they should not be
 * checkable only by pointing the thing at a real careers page.
 */
/**
 * How the navigator gets values without ever choosing one.
 *
 * Supplied by the workflow, which holds the candidate's vault and profile. The
 * navigator calls it with the questions a page is asking and receives either a
 * cleared value or a refusal with a reason — the same two outcomes the
 * single-page path already produces, just asked per page instead of once.
 */
export type FieldResolver = (fields: DiscoveredField[]) => Promise<{
  /** Values cleared for unattended use, by field id. */
  answers: { field: string; value: string }[];
  /** Questions the vault refused, with the candidate-facing reason. */
  blocked: { field: string; reason: string }[];
}>;

export interface NavigatorDriver {
  observe(): Promise<PageObservation>;
  /** Fill the named fields from the vault. Returns what actually took a value. */
  fill(fields: string[]): Promise<{ filled: string[]; skipped: string[] }>;
  upload(ref: string): Promise<boolean>;
  click(ref: string): Promise<void>;
  /** Wait without acting — used to let a submission's POST resolve. */
  pause(ms: number): Promise<void>;
  /**
   * Resolve newly-seen questions against the vault.
   *
   * Called per page, because a wizard does not reveal page 4's questions until
   * page 3 is done. Anything it refuses becomes a blocker the candidate answers
   * once — and the vault is keyed by intent, so answering it once covers every
   * employer that ever asks it again.
   */
  resolve(fields: DiscoveredField[]): Promise<{
    answerable: string[];
    blocked: { field: string; reason: string }[];
  }>;
}

export type NavigatorOutcome =
  | { outcome: 'submitted'; reference: string }
  | { outcome: 'prepared'; reason: string }
  | { outcome: 'needsUser'; reason: string }
  | { outcome: 'failed'; reason: string };

/**
 * Whether the run ever pressed a submit control.
 *
 * Separate from the outcome, because the two answer different questions. The
 * outcome says how the run ended; this says whether an employer may already
 * have the application. A run that pressed submit, failed to recognise the
 * confirmation, then found a second submit-looking control and stopped, ends
 * `prepared` — and reporting that as "nothing was sent" is a guess about
 * someone else's server.
 */
export type NavigatorPress = { pressedSubmit: boolean };

export type NavigatorResult = NavigatorOutcome & NavigatorPress & {
  /** One entry per page the run touched, for the receipt and for debugging. */
  trail: { url: string; step: string; action: string; note: string }[];
  /** Every question seen across every page, including ones never reached before. */
  questionsSeen: DiscoveredField[];
  /** Required questions the vault would not answer, in the candidate's words. */
  unresolved: { field: string; label: string; reason: string }[];
  filled: string[];
  skipped: string[];
  pagesVisited: number;
};
