import type { DiscoveredField } from '../adapters/browser';
import { plan } from './plan';
import type { NavigatorDriver, NavigatorMode, NavigatorResult, PlanContext } from './types';

/**
 * The loop.
 *
 * Observe, decide, act, repeat — bounded on every axis that could otherwise run
 * away: steps taken, wall-clock time, pages revisited, and submissions pressed.
 * A run that cannot finish stops and says which question it stopped on; it
 * never abandons a half-filled application without a reason the candidate can
 * act on.
 *
 * ## Why the budgets are not configuration
 *
 * They are constants because they are safety properties, not preferences.
 * "How many pages of someone's job application may software fill in without
 * checking back" is not a number an end user should be raising from a settings
 * screen at 2am, and an operator who genuinely needs a longer wizard should be
 * changing it here, in a diff, with a reason.
 */

/** A long ATS wizard is five or six pages. Fourteen steps covers filling each. */
const MAX_STEPS = 14;

/** Three minutes. Past that, something is wrong that another click will not fix. */
const BUDGET_MS = 180_000;

export type NavigateOptions = {
  /**
   * How far this run may go. `survey` reads and stops at the first real
   * question; `apply` completes the whole application.
   */
  mode: NavigatorMode;
  /** Whether the execution policy permits pressing submit on this path. */
  allowSubmit: boolean;
  /** Whether a real résumé file is available to attach. */
  hasResume: boolean;
  maxSteps?: number;
  budgetMs?: number;
  /** Test seam. */
  now?: () => number;
};

export async function navigate(driver: NavigatorDriver, options: NavigateOptions): Promise<NavigatorResult> {
  const now = options.now ?? Date.now;
  const maxSteps = options.maxSteps ?? MAX_STEPS;
  const budgetMs = options.budgetMs ?? BUDGET_MS;
  const startedAt = now();

  const answerable = new Set<string>();
  const blocked = new Map<string, string>();
  /** Every question across every page, keyed by id so a re-render is not a new one. */
  const questions = new Map<string, DiscoveredField>();
  /** Fields we have tried to fill, so a silent failure cannot loop. */
  const attempted = new Set<string>();
  const seen = new Set<string>();
  const trail: NavigatorResult['trail'] = [];
  const filled: string[] = [];
  const skipped: string[] = [];

  let submitted = false;
  let submitPresses = 0;
  let steps = 0;

  const result = (
    outcome: NavigatorResult['outcome'],
    payload: { reference?: string; reason?: string },
  ): NavigatorResult => ({
    ...(outcome === 'submitted'
      ? { outcome, reference: payload.reference ?? 'confirmed' }
      : { outcome, reason: payload.reason ?? '' }),
    trail,
    questionsSeen: [...questions.values()],
    unresolved: [...blocked.entries()]
      .filter(([id]) => questions.get(id)?.required)
      .map(([id, reason]) => ({ field: id, label: questions.get(id)?.label ?? id, reason })),
    filled,
    skipped,
    pagesVisited: seen.size,
    /* Whether an employer may already have this, regardless of how the run
       ended. See NavigatorPress. */
    pressedSubmit: submitted,
  }) as NavigatorResult;

  try {
    for (;;) {
      if (now() - startedAt > budgetMs) {
        return result('needsUser', { reason: 'This application took longer than Autopilot will spend on one form.' });
      }

      const obs = await driver.observe();

      /* New questions are resolved as they appear. A wizard does not reveal
         page four until page three is done, so this cannot be hoisted out of
         the loop — which is precisely why the single-page adapter could not do
         these applications at all. */
      const fresh = obs.fields.filter((f) => !questions.has(f.id));
      for (const f of fresh) questions.set(f.id, f);
      if (fresh.length > 0) {
        const resolved = await driver.resolve(fresh);
        for (const id of resolved.answerable) answerable.add(id);
        for (const b of resolved.blocked) blocked.set(b.field, b.reason);
      }

      /* A field we already tried and that still holds no value cannot be
         filled: a masked input, a custom widget, a control that rejects
         programmatic input. Recorded as blocked so the planner stops retrying
         — and so a *required* one stops the run rather than being quietly left
         empty on a submitted application. */
      for (const f of obs.fields) {
        if (attempted.has(f.id) && !obs.filled.includes(f.id) && !blocked.has(f.id)) {
          blocked.set(f.id, 'Autopilot could not type into this field.');
          if (!skipped.includes(f.id)) skipped.push(f.id);
        }
      }

      const ctx: PlanContext = {
        mode: options.mode,
        answerable,
        blocked,
        allowSubmit: options.allowSubmit,
        hasResume: options.hasResume,
        seen,
        submitted,
        stepsTaken: steps,
        maxSteps,
      };

      const action = plan(obs, ctx);
      trail.push({
        url: obs.url,
        step: obs.step,
        action: action.type,
        note: 'reason' in action ? action.reason : 'fields' in action ? action.fields.join(', ') : '',
      });

      switch (action.type) {
        case 'DONE':
          return result('submitted', { reference: action.reference });

        case 'STOP':
          return result(action.needsUser ? 'needsUser' : 'prepared', { reason: action.reason });

        case 'FILL': {
          for (const id of action.fields) attempted.add(id);
          const out = await driver.fill(action.fields);
          for (const id of out.filled) if (!filled.includes(id)) filled.push(id);
          for (const id of out.skipped) {
            if (!blocked.has(id)) blocked.set(id, 'Autopilot could not type into this field.');
            if (!skipped.includes(id)) skipped.push(id);
          }
          break;
        }

        case 'UPLOAD': {
          attempted.add(action.ref);
          const ok = await driver.upload(action.ref);
          if (ok) {
            filled.push(action.ref);
            /*
             * An upload can remount the form and wipe every answer typed
             * before it -- Ashby's resume autofill does exactly this. The
             * values still live in the driver, so wiped fields deserve one
             * fresh attempt; without this reset the no-progress check branded
             * them "could not type into this field" on the observation right
             * after the wipe, and runs died over fields that had already been
             * filled correctly once.
             */
            for (const id of [...attempted]) {
              if (id !== action.ref) attempted.delete(id);
            }
          } else {
            blocked.set(action.ref, 'The résumé could not be attached to this form.');
            skipped.push(action.ref);
          }
          break;
        }

        case 'CONTINUE':
          /* Only navigation marks a page as seen. Filling does not, or the
             no-progress check would fire the moment we typed into a form and
             came back to the same page to type into the next field. */
          seen.add(obs.fingerprint);
          await driver.click(action.ref);
          break;

        case 'SUBMIT': {
          seen.add(obs.fingerprint);
          /* Set before the click, not after. If the click throws mid-flight we
             do not know whether the form went out, and a retry that sends a
             second application is worse than a run that reports uncertainty. */
          submitted = true;
          await driver.click(action.ref);

          /*
           * The click starts a POST; the confirmation follows it.
           *
           * The loop used to observe once, immediately, and a screenshot from
           * that instant showed the submit button greyed out mid-spin -- the
           * form was in flight and the run had already concluded nothing
           * confirmed it. Poll for up to fifteen seconds: the moment a
           * confirmation appears the run ends confirmed, and a page that never
           * settles falls through to the existing uncertainty path.
           */
          submitPresses += 1;
          for (let waitStep = 0; waitStep < 10; waitStep += 1) {
            await driver.pause(1_500);
            const after = await driver.observe();
            if (after.confirmation) {
              trail.push({ url: after.url, step: after.step, action: 'CONFIRMED', note: after.confirmation });
              return result('submitted', { reference: after.confirmation });
            }

            /*
             * The board rejected the press and said so.
             *
             * "Your form needs corrections" is proof no application was
             * created, which is the one situation where a second press cannot
             * double-apply. The wipe-and-refill dance around a resume upload
             * can leave one field re-cleared at the instant of the first
             * press; the board names it, the loop fills it, and one more
             * press finishes what a person would finish the same way. Two
             * presses total, ever -- past that, something structural is wrong
             * and uncertainty is the honest report.
             */
            if (after.validationError && submitPresses < 2) {
              trail.push({ url: after.url, step: after.step, action: 'REJECTED', note: after.validationError.slice(0, 140) });
              submitted = false;
              /* The named field was attempted; give it one fresh chance. */
              attempted.clear();
              break;
            }
          }
          break;
        }
      }

      steps += 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : 'The application run failed.';
    /* A failure after the submit button was pressed is reported as uncertain
       rather than failed: the application may well have gone out, and telling
       the candidate it did not is the more expensive mistake. */
    if (submitted) {
      return result('needsUser', {
        reason: `The form was sent but Autopilot lost track of the result (${message}). Check before treating this as applied.`,
      });
    }
    return result('failed', { reason: message });
  }
}
