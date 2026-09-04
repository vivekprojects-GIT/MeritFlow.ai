import { describe, expect, it } from 'vitest';
import { classifyControl, plan, readConfirmation } from './plan';
import type { PageControl, PageObservation, PlanContext } from './types';
import type { DiscoveredField } from '../adapters/browser';

/**
 * The planner decides whether someone's job application gets sent, so these
 * read as a specification rather than as coverage: each case is a thing that
 * must not happen on a real application, written as the smallest page that
 * would cause it.
 */

function field(id: string, over: Partial<DiscoveredField> = {}): DiscoveredField {
  return { id, label: id, required: false, kind: 'text', options: [], ...over };
}

function control(text: string, over: Partial<PageControl> = {}): PageControl {
  return { ref: `ref-${text}`, text, kind: classifyControl(text), enabled: true, ...over };
}

function page(over: Partial<PageObservation> = {}): PageObservation {
  return {
    url: 'https://jobs.example.com/apply',
    title: 'Apply',
    fingerprint: 'fp1',
    step: '',
    fields: [],
    filled: [],
    controls: [],
    challenge: 'none',
    confirmation: '',
    validationError: '',
    ...over,
  };
}

function ctx(over: Partial<PlanContext> = {}): PlanContext {
  return {
    mode: 'apply',
    answerable: new Set(),
    blocked: new Map(),
    allowSubmit: false,
    hasResume: false,
    seen: new Set(),
    submitted: false,
    stepsTaken: 0,
    maxSteps: 14,
    ...over,
  };
}

describe('classifyControl', () => {
  it('recognises the buttons that send an application', () => {
    expect(classifyControl('Submit application')).toBe('submit');
    expect(classifyControl('Submit')).toBe('submit');
    expect(classifyControl('Finish and submit')).toBe('submit');
  });

  it('treats "Apply" as a way in, not a way out', () => {
    /* It is the button on a job description far more often than it is the send
       control. Classifying it as submit spends the run's one submission on a
       hyperlink and then refuses the real button pages later. */
    expect(classifyControl('Apply')).toBe('continue');
    expect(classifyControl('Apply now')).toBe('continue');
    expect(classifyControl('Apply for this job')).toBe('continue');
  });

  it('recognises backwards controls so they are never pressed', () => {
    expect(classifyControl('Back')).toBe('back');
    expect(classifyControl('Cancel')).toBe('back');
    expect(classifyControl('Previous')).toBe('back');
  });

  it('leaves anything it does not know alone', () => {
    expect(classifyControl('Weiter')).toBe('other');
    expect(classifyControl('Add another employer')).toBe('other');
  });
});

describe('readConfirmation', () => {
  it('reads a reference out of a confirmation page', () => {
    expect(readConfirmation('Thank you for applying. Confirmation number: AB-99213')).toBe('AB-99213');
  });

  it('confirms without a reference when none is printed', () => {
    expect(readConfirmation('Your application has been received.')).toBe('confirmed');
  });

  it('does not treat an ordinary page as a confirmation', () => {
    /* Reporting an application that was never sent is the expensive mistake:
       the candidate stops chasing a role nobody received. */
    expect(readConfirmation('Thank you for your interest in working with us.')).toBe('');
    expect(readConfirmation('Submit your application below.')).toBe('');
  });
});

describe('plan — human gates', () => {
  it('stops at a CAPTCHA instead of touching it', () => {
    const action = plan(page({ challenge: 'captcha', controls: [control('Next')] }), ctx());
    expect(action.type).toBe('STOP');
    expect(action).toMatchObject({ needsUser: true });
  });

  it('stops at an account wall', () => {
    const action = plan(page({ challenge: 'account' }), ctx());
    expect(action).toMatchObject({ type: 'STOP', needsUser: true });
  });

  it('keeps a confirmation that appears alongside a CAPTCHA widget', () => {
    /* Several ATSs render a bot-check script on the confirmation page too.
       Stopping there would discard a submission that already happened. */
    const action = plan(page({ challenge: 'captcha', confirmation: 'REF-1' }), ctx());
    expect(action).toEqual({ type: 'DONE', reference: 'REF-1' });
  });
});

describe('plan — survey mode', () => {
  it('follows an apply link on a page with no questions', () => {
    const action = plan(page({ controls: [control('Apply for this job')] }), ctx({ mode: 'survey' }));
    expect(action.type).toBe('CONTINUE');
  });

  it('stops at the first page that asks something, without typing', () => {
    /* A run that may not submit may not advance through a filled form either:
       on plenty of sites the last "Next" is the send button and nothing in the
       markup says which one you are looking at. */
    const action = plan(
      page({ fields: [field('email')], controls: [control('Next')] }),
      ctx({ mode: 'survey', answerable: new Set(['email']) }),
    );
    expect(action).toMatchObject({ type: 'STOP', needsUser: false });
    expect(action).toHaveProperty('reason', expect.stringContaining('multi-step'));
  });

  it('never fills in survey mode even when every answer is available', () => {
    const action = plan(
      page({ fields: [field('email'), field('phone')] }),
      ctx({ mode: 'survey', answerable: new Set(['email', 'phone']) }),
    );
    expect(action.type).not.toBe('FILL');
  });
});

describe('plan — answering', () => {
  it('fills the fields the vault cleared', () => {
    const action = plan(
      page({ fields: [field('email'), field('phone')] }),
      ctx({ answerable: new Set(['email', 'phone']) }),
    );
    expect(action).toEqual({ type: 'FILL', fields: ['email', 'phone'] });
  });

  it('leaves an optional question it cannot answer and moves on', () => {
    const action = plan(
      page({
        fields: [field('why_us', { kind: 'textarea' })],
        controls: [control('Next')],
      }),
      ctx({ blocked: new Map([['why_us', 'Free text needs your read.']]) }),
    );
    expect(action.type).toBe('CONTINUE');
  });

  it('stops on a required question it cannot answer, quoting the question', () => {
    const action = plan(
      page({
        fields: [field('k8s', { required: true, label: 'Years of experience with Kubernetes' })],
        controls: [control('Next')],
      }),
      ctx({ blocked: new Map([['k8s', 'No verified answer for this question yet.']]) }),
    );
    expect(action).toMatchObject({ type: 'STOP', needsUser: true });
    expect(action).toHaveProperty('reason', expect.stringContaining('Kubernetes'));
  });

  it('never fills a field the vault did not clear', () => {
    const action = plan(page({ fields: [field('salary')] }), ctx());
    expect(action.type).not.toBe('FILL');
  });

  it('attaches the résumé after the text fields are done', () => {
    const action = plan(
      page({ fields: [field('cv', { kind: 'file', required: true })] }),
      ctx({ hasResume: true }),
    );
    expect(action).toEqual({ type: 'UPLOAD', ref: 'cv' });
  });

  it('stops rather than submitting a form that requires a CV it cannot attach', () => {
    const action = plan(
      page({ fields: [field('cv', { kind: 'file', required: true })], controls: [control('Submit')] }),
      ctx({ hasResume: false, allowSubmit: true }),
    );
    expect(action).toMatchObject({ type: 'STOP', needsUser: true });
  });
});

describe('plan — submission', () => {
  const ready = page({
    fields: [field('email')],
    filled: ['email'],
    controls: [control('Submit application')],
  });

  it('refuses to submit where the execution policy has not approved it', () => {
    const action = plan(ready, ctx({ allowSubmit: false }));
    expect(action).toMatchObject({ type: 'STOP', needsUser: false });
    expect(action).toHaveProperty('reason', expect.stringContaining('not enabled'));
  });

  it('submits when the policy permits and the page is complete', () => {
    const action = plan(ready, ctx({ allowSubmit: true }));
    expect(action).toMatchObject({ type: 'SUBMIT' });
  });

  it('never submits twice in one run', () => {
    const action = plan(ready, ctx({ allowSubmit: true, submitted: true }));
    expect(action.type).toBe('STOP');
  });

  it('treats a submit-worded control on a page with no questions as a link', () => {
    /* "Submit your application" is a heading with a button under it on plenty
       of job descriptions. Pressing it as a submission spends the run's one
       allowed send on a hyperlink. */
    const action = plan(
      page({ fields: [], controls: [control('Submit application')] }),
      ctx({ allowSubmit: true }),
    );
    expect(action.type).not.toBe('SUBMIT');
  });

  it('prefers submit over continue when a page carries both', () => {
    const action = plan(
      page({ fields: [field('email')], filled: ['email'], controls: [control('Next'), control('Submit')] }),
      ctx({ allowSubmit: true }),
    );
    expect(action).toMatchObject({ type: 'SUBMIT' });
  });

  it('never presses a back control', () => {
    const action = plan(
      page({ fields: [field('email')], filled: ['email'], controls: [control('Back')] }),
      ctx({ allowSubmit: true }),
    );
    expect(action.type).toBe('STOP');
  });

  it('ignores a disabled forward control', () => {
    const action = plan(
      page({ fields: [field('email')], filled: ['email'], controls: [control('Next', { enabled: false })] }),
      ctx(),
    );
    expect(action.type).toBe('STOP');
  });
});

describe('plan — budgets', () => {
  it('stops when the same page comes back', () => {
    const action = plan(page({ fingerprint: 'fp1' }), ctx({ seen: new Set(['fp1']) }));
    expect(action).toMatchObject({ type: 'STOP', needsUser: true });
  });

  it('stops when the step budget is spent', () => {
    const action = plan(page(), ctx({ stepsTaken: 14, maxSteps: 14 }));
    expect(action).toMatchObject({ type: 'STOP', needsUser: true });
  });
});
