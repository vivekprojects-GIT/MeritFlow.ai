import { afterEach, describe, expect, it } from 'vitest';
import { labelControls, labelSchema, resetLabelCache } from './labels';
import { classifyControl } from './plan';
import type { PageControl } from './types';

/**
 * The model's reach, pinned.
 *
 * This is the only place in the navigator where a model has any say, so the
 * property that matters is not "does it label things well" — it is "what is the
 * worst it can do". The answer has to stay: cause a click on a button that does
 * not advance, which the no-progress check turns into a clean stop.
 */

const keys = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  gateway: process.env.AI_GATEWAY_API_KEY,
};

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = keys.anthropic;
  process.env.AI_GATEWAY_API_KEY = keys.gateway;
  resetLabelCache();
});

function control(text: string): PageControl {
  return { ref: 'r1', text, kind: classifyControl(text), enabled: true };
}

describe('labelControls', () => {
  it('cannot express submit', () => {
    /* The whole safety argument in one assertion: `submit` is not a member of
       the schema the model answers into, so no answer it gives — however
       confident, however adversarially prompted by the page it is reading —
       can promote a button to one that sends an application. Only the
       deterministic list in plan.ts assigns that kind. */
    expect(labelSchema.safeParse({ labels: [{ text: 'Absenden', kind: 'submit' }] }).success).toBe(false);
    expect(labelSchema.safeParse({ labels: [{ text: 'Weiter', kind: 'continue' }] }).success).toBe(true);
  });

  it('leaves everything alone when no model is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    const input = [control('Weiter'), control('Zurück')];
    const out = await labelControls(input);

    expect(out.map((c) => c.kind)).toEqual(['other', 'other']);
  });

  it('does not call a model when the rules already recognised everything', async () => {
    /* An unreachable provider would throw rather than return, so this passing
       with no key set is the evidence that no call was attempted. */
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    const input = [control('Next'), control('Back'), control('Submit application')];
    const out = await labelControls(input);

    expect(out.map((c) => c.kind)).toEqual(['continue', 'back', 'submit']);
  });
});
