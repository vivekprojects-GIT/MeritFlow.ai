import { generateObject } from 'ai';
import { z } from 'zod';
import { fastModel, hasAiKey } from '../../ai';
import { classifyControl } from './plan';
import type { PageControl } from './types';

/**
 * The one place a model is consulted, and the narrowest job it could be given.
 *
 * ## What it does
 *
 * Reads button text the rules did not recognise — "Weiter", "Continuar",
 * "Save & proceed to references", "Suivant" — and says whether it moves the
 * application forward. That is a genuine language problem: an employer in
 * Munich writes their careers page in German, and a regex list of English verbs
 * will never cover it. It is also the actual reason multi-page applications
 * fail today, far more often than anything structural.
 *
 * ## What it cannot do
 *
 * The output type has three members: continue, back, other. There is no
 * `submit`. A control becomes `submit` only through the deterministic list in
 * `plan.ts`, so the worst a wrong answer here can produce is a click on a
 * button that does not advance — which the no-progress check catches on the
 * next step and turns into a clean stop.
 *
 * That asymmetry is the point. "Never let a model's confidence alone authorize
 * submission" is not a policy this module follows; it is a shape it cannot
 * express.
 */

export const labelSchema = z.object({
  labels: z.array(
    z.object({
      text: z.string(),
      /* Deliberately missing: 'submit'. See the note above. */
      kind: z.enum(['continue', 'back', 'other']),
    }),
  ),
});

/**
 * Per-process cache.
 *
 * Careers sites reuse the same handful of button labels across every posting,
 * and a wizard shows the same "Weiter" on all five of its steps. Without this
 * the same question is paid for once per page per application.
 */
const cache = new Map<string, PageControl['kind']>();

/**
 * Label whatever the rules could not.
 *
 * Never throws and never blocks a run: on any failure the controls keep the
 * `other` the rules gave them, and the navigator stops cleanly rather than
 * clicking something it does not understand.
 */
export async function labelControls(controls: PageControl[]): Promise<PageControl[]> {
  const unknown = controls.filter((c) => c.kind === 'other' && c.text.trim().length > 0);
  if (unknown.length === 0) return controls;

  const apply = (list: PageControl[]) =>
    list.map((c) => {
      const hit = cache.get(c.text.trim().toLowerCase());
      return hit && c.kind === 'other' ? { ...c, kind: hit } : c;
    });

  const uncached = unknown.filter((c) => !cache.has(c.text.trim().toLowerCase()));
  if (uncached.length === 0) return apply(controls);
  if (!hasAiKey()) return controls;

  try {
    const { object } = await generateObject({
      model: fastModel(),
      schema: labelSchema,
      temperature: 0,
      maxOutputTokens: 800,
      system: [
        'You label buttons on a job application form by what they do.',
        'In any language: "continue" means it moves to the next step of the application.',
        '"back" means it goes to a previous step or cancels. "other" is everything else —',
        'help links, language switchers, saving a draft, adding another entry to a list.',
        'If you are not sure, answer "other". Label only the texts given, and return one entry per input text.',
      ].join(' '),
      prompt: uncached.map((c) => c.text.trim()).join('\n'),
    });

    for (const l of object.labels) {
      const key = l.text.trim().toLowerCase();
      if (!key) continue;
      /* Re-checked against the rules: if the deterministic classifier has an
         opinion about this text, it wins. The model is filling a gap, not
         overruling anything. */
      const byRule = classifyControl(l.text);
      cache.set(key, byRule === 'other' ? l.kind : byRule);
    }
  } catch {
    /* A labelling failure costs a stop, never a wrong click. */
    return controls;
  }

  return apply(controls);
}

/** Test seam — the cache is process-wide and would leak between cases. */
export function resetLabelCache(): void {
  cache.clear();
}
