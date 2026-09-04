import type { NavigatorAction, PageControl, PageObservation, PlanContext } from './types';

/**
 * The planner: one page in, one action out.
 *
 * Pure, synchronous, and deterministic. No model call happens here and none can
 * be added without changing the signature, which is deliberate — this function
 * decides whether an application gets sent, so its behaviour has to be readable
 * in one sitting and reproducible in a test.
 *
 * The rules are ordered by how bad it would be to get them wrong. A CAPTCHA
 * check precedes everything because interacting with one is off the table
 * regardless of what else is true. Blocked required fields precede filling,
 * because a run that cannot finish honestly should stop before it types
 * anything. Submission is last and narrowest.
 */

/* ── Control recognition ─────────────────────────────────────────────────── */

/**
 * Text that means "this button sends the application".
 *
 * This list is the *only* way a control becomes `submit`. `labelControls` in
 * `labels.ts` may ask a model to recognise forward motion in wording the rules
 * do not know, and its output is clamped to continue/back/other — so a model
 * can never promote a button to submit by being confidently wrong about
 * "Absenden". The cost is that an unrecognised submit button reads as a dead
 * end and the run stops; that is the correct direction to fail in.
 */
const SUBMIT_TEXT = [
  /^submit\b/i,
  /submit\s+application/i,
  /^send\s+application/i,
  /^submit\s+my\s+application/i,
  /^finish\s+(and\s+)?submit/i,
];

const CONTINUE_TEXT = [
  /^next\b/i,
  /^continue\b/i,
  /^save\s+(and|&)\s+continue/i,
  /^save\s+(and|&)\s+next/i,
  /^proceed\b/i,
  /^start\s+(your\s+)?application/i,
  /^begin\b/i,
  /^get\s+started/i,
  /^review\b/i,
  /* "Apply" is a gateway link far more often than it is a send button — it is
     what a job description carries above the fold. Classifying it as submit
     would spend the run's one submission on a hyperlink and then refuse the
     real button four pages later. Where it genuinely is the send control, it
     sits on a page with fields, and `plan` handles that case by position. */
  /^apply\b/i,
];

const BACK_TEXT = [/^back\b/i, /^previous\b/i, /^return\b/i, /^cancel\b/i];

const LOGIN_TEXT = [/sign\s*in/i, /log\s*in/i, /create\s+(an\s+)?account/i, /register/i];

const UPLOAD_TEXT = [/upload/i, /attach/i, /choose\s+file/i, /browse/i];

/**
 * Classify a control from its text alone.
 *
 * Returns `other` when nothing matches rather than guessing — `labels.ts` gets
 * a chance at those, and anything still unrecognised is simply never clicked.
 */
export function classifyControl(text: string): PageControl['kind'] {
  const t = text.trim();
  if (!t) return 'other';
  /* Submit is tested first and against exact-ish phrasing: "Submit application"
     must not fall through to the looser "apply" continue pattern, or pressing
     continue would send the form. */
  if (SUBMIT_TEXT.some((r) => r.test(t))) return 'submit';
  if (BACK_TEXT.some((r) => r.test(t))) return 'back';
  if (LOGIN_TEXT.some((r) => r.test(t))) return 'login';
  if (UPLOAD_TEXT.some((r) => r.test(t))) return 'upload';
  if (CONTINUE_TEXT.some((r) => r.test(t))) return 'continue';
  return 'other';
}

/** The forward control to press, preferring the one furthest through the flow. */
function pick(controls: PageControl[], kind: PageControl['kind']): PageControl | null {
  const usable = controls.filter((c) => c.kind === kind && c.enabled);
  if (usable.length === 0) return null;
  /* Later in the DOM wins on a tie: wizards put "Back  Next" in that order, and
     a page with two forward controls almost always means a sticky footer
     duplicating the real one lower down. */
  return usable[usable.length - 1];
}

/* ── Confirmation ────────────────────────────────────────────────────────── */

/*
 * Wordings that genuinely confirm an application.
 *
 * The first version required the phrase "thank you for", and Ashby writes
 * "Thanks for applying" — so a completed application on a CAPTCHA-free board,
 * with every field filled and the résumé attached, came back as unconfirmed
 * over one contracted word. The additions below are all unambiguous
 * confirmations; nothing here matches a page that merely *offers* to take an
 * application, which is the failure this stays strict against.
 */
const CONFIRMED =
  /thank(?:s| you)(?: very much)? for (?:applying|your application|submitting)|\bapplication\s+(?:has\s+been\s+|was\s+)?(?:received|submitted|sent)\b|successfully (?:submitted|applied)|we(?:'ve| have) received your application/i;

/**
 * Did this page confirm an application, and under what reference?
 *
 * Kept strict. Treating an ambiguous page as confirmed is how a tracker fills
 * with applications nobody sent, and the candidate finds out weeks later.
 */
export function readConfirmation(text: string): string {
  if (!CONFIRMED.test(text)) return '';
  const ref = text.match(
    /(?:reference|confirmation|application)\s*(?:number|id|code|#)?\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9-]{3,})/i,
  )?.[1];
  return ref ?? 'confirmed';
}

/* ── The planner ─────────────────────────────────────────────────────────── */

export function plan(obs: PageObservation, ctx: PlanContext): NavigatorAction {
  /* 1. Budget. Checked first so a loop that has gone wrong cannot spend another
        step deciding it has not. */
  if (ctx.stepsTaken >= ctx.maxSteps) {
    return { type: 'STOP', reason: 'This application has more steps than Autopilot will walk unattended.', needsUser: true };
  }

  /* 2. A finished application. Before the challenge check: some ATSs show a
        CAPTCHA widget on the confirmation page, and stopping there would
        discard a submission that already happened. */
  if (obs.confirmation) return { type: 'DONE', reference: obs.confirmation };

  /* 3. Human gates. Never interacted with, in either direction. */
  if (obs.challenge === 'captcha') {
    return { type: 'STOP', reason: 'This application shows a CAPTCHA, which only you can complete.', needsUser: true };
  }
  if (obs.challenge === 'account') {
    return { type: 'STOP', reason: 'This application requires an account before it can be sent.', needsUser: true };
  }

  /* 4. No progress. Two identical pages in a row means the last action did
        nothing — usually a validation message we cannot read. Continuing would
        burn the budget pressing the same dead button. */
  if (ctx.seen.has(obs.fingerprint)) {
    return {
      type: 'STOP',
      reason: 'The application stopped responding to Autopilot on this step — it may be showing an error only you can see.',
      needsUser: true,
    };
  }

  const unfilled = obs.fields.filter((f) => !obs.filled.includes(f.id));
  const forward = pick(obs.controls, 'continue');

  /* 5. Survey mode ends at the first page that asks something.
   *
   * Reading a job description and following its Apply link is free of
   * consequence. Typing into the form it leads to is not, and neither is
   * pressing whatever comes after — on a good number of sites the last "Next"
   * is the send button, and nothing in the markup distinguishes it from the
   * three "Next"s before it. So a run that is not authorised to submit is not
   * authorised to advance past the first real question either.
   */
  if (ctx.mode === 'survey') {
    if (obs.fields.length > 0) {
      return {
        type: 'STOP',
        reason: forward
          ? 'This is a multi-step application. Autopilot has read the first step; the rest opens once submission is enabled for this employer.'
          : 'Application form read.',
        needsUser: false,
      };
    }
    if (forward) return { type: 'CONTINUE', ref: forward.ref, reason: `Following "${forward.text}".` };
    if (pick(obs.controls, 'login')) {
      return { type: 'STOP', reason: 'This application requires an account before it can be started.', needsUser: true };
    }
    return { type: 'STOP', reason: 'No application form was found on this page.', needsUser: true };
  }

  /* 6. Required questions the vault will not answer.
   *
   * This is the honest stop, and it is placed before filling on purpose: an
   * application half-completed and then abandoned is worse for the candidate
   * than one not started. Reported with the question's own wording so they
   * answer it once and every future employer asking it is covered.
   */
  const blocking = unfilled.filter((f) => f.required && ctx.blocked.has(f.id));
  if (blocking.length > 0) {
    const first = blocking[0];
    const more = blocking.length > 1 ? ` (and ${blocking.length - 1} more)` : '';
    return {
      type: 'STOP',
      reason: `"${first.label}"${more} — ${ctx.blocked.get(first.id)}`,
      needsUser: true,
    };
  }

  /* 7. Fill what we can — except what has already refused to take a value.
        A blocked *required* field stops the run elsewhere; a blocked optional
        one must simply be left alone. Without this exclusion, one optional
        checkbox that rejected programmatic input was refilled thirteen times
        until the step budget ran out, and the run died a step short of a form
        that was otherwise complete. */
  const fillable = unfilled.filter((f) => f.kind !== 'file' && ctx.answerable.has(f.id) && !ctx.blocked.has(f.id));
  if (fillable.length > 0) return { type: 'FILL', fields: fillable.map((f) => f.id) };

  /* 8. Attach the résumé. After text fields, because some forms parse the CV
        and overwrite whatever is already typed. */
  const fileField = unfilled.find((f) => f.kind === 'file');
  if (fileField && ctx.hasResume) {
    return { type: 'UPLOAD', ref: fileField.id };
  }
  if (fileField?.required && !ctx.hasResume) {
    return { type: 'STOP', reason: 'This application requires a résumé file and none could be attached.', needsUser: true };
  }

  /* 9. Everything answerable on this page is done. Move on, or send.
   *
   * A submit-worded control on a page with no fields is a link into the
   * application, not the end of one — "Submit your application" is a heading
   * with a button under it on plenty of job descriptions. Treating it as a real
   * submission would spend the run's single allowed send on a hyperlink and
   * then refuse the actual button several pages later.
   */
  const submit = obs.fields.length > 0 ? pick(obs.controls, 'submit') : null;

  if (submit) {
    if (ctx.submitted) {
      /* Already pressed once. A second press is how a candidate ends up with
         two applications to the same role. */
      return { type: 'STOP', reason: 'The application was already submitted once in this run.', needsUser: false };
    }
    if (!ctx.allowSubmit) {
      return {
        type: 'STOP',
        reason: 'Everything is filled in and ready. Automatic submission is not enabled for this employer, so the last step is yours.',
        needsUser: false,
      };
    }
    return { type: 'SUBMIT', ref: submit.ref, reason: `Pressing "${submit.text}".` };
  }

  if (forward) return { type: 'CONTINUE', ref: forward.ref, reason: `Pressing "${forward.text}".` };

  /* 10. Nowhere left to go. A login control here means the flow needs an
         account after all, which is a handoff rather than a failure. */
  if (pick(obs.controls, 'login')) {
    return { type: 'STOP', reason: 'This application requires an account before it can be sent.', needsUser: true };
  }

  if (obs.fields.length === 0) {
    return { type: 'STOP', reason: 'No application form was found on this page.', needsUser: true };
  }

  return {
    type: 'STOP',
    reason: 'The form is filled in but Autopilot could not find how to continue from this step.',
    needsUser: true,
  };
}
