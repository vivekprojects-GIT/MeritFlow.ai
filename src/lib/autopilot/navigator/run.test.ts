import { describe, expect, it } from 'vitest';
import { navigate } from './run';
import { classifyControl } from './plan';
import type { Challenge, NavigatorDriver, PageObservation } from './types';
import type { DiscoveredField } from '../adapters/browser';

/**
 * The loop, against a scripted application rather than a live employer site.
 *
 * Everything here is a safety property — how many pages it will walk, whether
 * it can press submit twice, what it does when a question has no answer — and
 * those should not be checkable only by pointing the thing at somebody's real
 * careers page and watching. Hence the driver interface.
 */

type ScriptPage = {
  fields?: DiscoveredField[];
  controls?: string[];
  challenge?: Challenge;
  confirmation?: string;
  /** Fields that silently refuse a value, like a masked or custom widget. */
  rejects?: string[];
};

function field(id: string, over: Partial<DiscoveredField> = {}): DiscoveredField {
  return { id, label: id, required: false, kind: 'text', options: [], ...over };
}

class ScriptedDriver implements NavigatorDriver {
  index = 0;
  clicks: string[] = [];
  observations = 0;
  /** Throw from `observe` once this many observations have been made. */
  throwAfter = Number.POSITIVE_INFINITY;
  /** When true, clicking does not advance — a dead button. */
  stuck = false;

  private readonly filled = new Map<number, Set<string>>();

  constructor(
    private readonly pages: ScriptPage[],
    private readonly answers: Record<string, string> = {},
  ) {}

  private get current(): ScriptPage {
    return this.pages[Math.min(this.index, this.pages.length - 1)];
  }

  private get filledHere(): Set<string> {
    let set = this.filled.get(this.index);
    if (!set) {
      set = new Set();
      this.filled.set(this.index, set);
    }
    return set;
  }

  /* Tests need no real waiting -- the scripted pages are already final. */
  async pause(): Promise<void> {}

  async observe(): Promise<PageObservation> {
    this.observations += 1;
    if (this.observations > this.throwAfter) throw new Error('page closed unexpectedly');
    const p = this.current;
    return {
      url: `https://jobs.example.com/step-${this.index}`,
      title: `Step ${this.index}`,
      fingerprint: `page-${this.index}`,
      step: `Step ${this.index + 1} of ${this.pages.length}`,
      fields: p.fields ?? [],
      filled: [...this.filledHere],
      controls: (p.controls ?? []).map((text, i) => ({
        ref: `r${this.index}-${i}`,
        text,
        kind: classifyControl(text),
        enabled: true,
      })),
      challenge: p.challenge ?? 'none',
      confirmation: p.confirmation ?? '',
      validationError: '',
    };
  }

  async resolve(fields: DiscoveredField[]) {
    return {
      answerable: fields.filter((f) => this.answers[f.id] !== undefined).map((f) => f.id),
      blocked: fields
        .filter((f) => this.answers[f.id] === undefined && f.kind !== 'file')
        .map((f) => ({ field: f.id, reason: 'No verified answer for this question yet.' })),
    };
  }

  async fill(fields: string[]) {
    const filled: string[] = [];
    const skipped: string[] = [];
    for (const id of fields) {
      if (this.current.rejects?.includes(id)) skipped.push(id);
      else {
        this.filledHere.add(id);
        filled.push(id);
      }
    }
    return { filled, skipped };
  }

  async upload(ref: string) {
    this.filledHere.add(ref);
    return true;
  }

  async click(ref: string) {
    this.clicks.push(ref);
    if (!this.stuck) this.index += 1;
  }
}

const apply = { mode: 'apply', allowSubmit: true, hasResume: true } as const;

describe('navigate — a multi-page application', () => {
  it('walks the wizard, answers each page, and submits at the end', async () => {
    const driver = new ScriptedDriver(
      [
        { fields: [field('email', { required: true })], controls: ['Next'] },
        { fields: [field('cv', { kind: 'file', required: true })], controls: ['Next'] },
        { fields: [field('start_date', { required: true })], controls: ['Submit application'] },
        { confirmation: 'REF-4471' },
      ],
      { email: 'a@b.com', start_date: 'Immediately' },
    );

    const result = await navigate(driver, apply);

    expect(result.outcome).toBe('submitted');
    expect(result).toMatchObject({ reference: 'REF-4471' });
    expect(result.pagesVisited).toBe(3);
    expect(result.filled).toEqual(['email', 'cv', 'start_date']);
  });

  it('collects questions from pages a single read could never have seen', async () => {
    /* The whole reason this module exists: step three does not exist until step
       two is complete, so its questions cannot be looked up in advance. */
    const driver = new ScriptedDriver(
      [
        { fields: [field('email')], controls: ['Next'] },
        { fields: [field('visa_status')], controls: ['Next'] },
        { fields: [field('notice_period')], controls: ['Submit'] },
        { confirmation: 'ok' },
      ],
      { email: 'a@b.com', visa_status: 'Citizen', notice_period: '2 weeks' },
    );

    const result = await navigate(driver, apply);
    expect(result.questionsSeen.map((q) => q.id)).toEqual(['email', 'visa_status', 'notice_period']);
  });
});

describe('navigate — refusing to guess', () => {
  it('parks on a required question the vault cannot answer', async () => {
    const driver = new ScriptedDriver(
      [
        { fields: [field('email', { required: true })], controls: ['Next'] },
        {
          fields: [field('k8s_years', { required: true, label: 'Years of experience with Kubernetes' })],
          controls: ['Submit'],
        },
      ],
      { email: 'a@b.com' },
    );

    const result = await navigate(driver, apply);

    expect(result.outcome).toBe('needsUser');
    expect(result).toHaveProperty('reason', expect.stringContaining('Kubernetes'));
    expect(result.unresolved).toEqual([
      { field: 'k8s_years', label: 'Years of experience with Kubernetes', reason: expect.any(String) },
    ]);
    /* One click — onto step two — and nothing after it. */
    expect(driver.clicks).toHaveLength(1);
  });

  it('does not submit when the execution policy has not approved the path', async () => {
    const driver = new ScriptedDriver(
      [{ fields: [field('email', { required: true })], controls: ['Submit application'] }],
      { email: 'a@b.com' },
    );

    const result = await navigate(driver, { mode: 'apply', allowSubmit: false, hasResume: true });

    expect(result.outcome).toBe('prepared');
    expect(driver.clicks).toEqual([]);
  });
});

describe('navigate — termination', () => {
  it('gives up on a field that will not take a value instead of retrying it', async () => {
    const driver = new ScriptedDriver(
      [
        {
          fields: [field('email'), field('masked_ssn', { required: true })],
          rejects: ['masked_ssn'],
          controls: ['Submit'],
        },
      ],
      { email: 'a@b.com', masked_ssn: '123' },
    );

    const result = await navigate(driver, apply);

    expect(result.outcome).toBe('needsUser');
    expect(result.skipped).toContain('masked_ssn');
    /* Bounded: two observations at most for one page, not fourteen. */
    expect(driver.observations).toBeLessThanOrEqual(3);
  });

  it('stops when a button does nothing rather than pressing it forever', async () => {
    const driver = new ScriptedDriver(
      [{ fields: [field('email')], controls: ['Next'] }],
      { email: 'a@b.com' },
    );
    driver.stuck = true;

    const result = await navigate(driver, apply);

    expect(result.outcome).toBe('needsUser');
    expect(driver.clicks).toHaveLength(1);
  });

  it('honours the step budget on an endless wizard', async () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      fields: [field(`q${i}`)],
      controls: ['Next'],
    }));
    const answers = Object.fromEntries(pages.map((_, i) => [`q${i}`, 'yes']));
    const driver = new ScriptedDriver(pages, answers);

    const result = await navigate(driver, { ...apply, maxSteps: 6 });

    expect(result.outcome).toBe('needsUser');
    expect(driver.clicks.length).toBeLessThanOrEqual(6);
  });

  it('honours the time budget', async () => {
    let clock = 0;
    const driver = new ScriptedDriver([{ fields: [field('email')], controls: ['Next'] }], { email: 'a@b.com' });
    driver.stuck = true;

    const result = await navigate(driver, {
      ...apply,
      budgetMs: 1000,
      /* Every reading of the clock jumps past the budget. */
      now: () => (clock += 5000),
    });

    expect(result.outcome).toBe('needsUser');
    expect(driver.clicks).toEqual([]);
  });
});

describe('navigate — handing back', () => {
  it('stops at a CAPTCHA that appears partway through', async () => {
    const driver = new ScriptedDriver(
      [
        { fields: [field('email')], controls: ['Next'] },
        { challenge: 'captcha', fields: [field('name')], controls: ['Submit'] },
      ],
      { email: 'a@b.com', name: 'Sai' },
    );

    const result = await navigate(driver, apply);

    expect(result.outcome).toBe('needsUser');
    expect(result).toHaveProperty('reason', expect.stringContaining('CAPTCHA'));
    expect(driver.clicks).toHaveLength(1);
  });

  it('reports uncertainty rather than failure when it loses the page after submitting', async () => {
    /* The application may well have gone out. Telling the candidate it did not
       is the more expensive of the two mistakes. */
    const driver = new ScriptedDriver(
      [{ fields: [field('email')], controls: ['Submit application'] }],
      { email: 'a@b.com' },
    );
    driver.throwAfter = 2;

    const result = await navigate(driver, apply);

    expect(result.outcome).toBe('needsUser');
    expect(result).toHaveProperty('reason', expect.stringContaining('lost track'));
  });

  it('reports a failure that happens before anything was sent', async () => {
    const driver = new ScriptedDriver([{ fields: [field('email')], controls: ['Next'] }], { email: 'a@b.com' });
    driver.throwAfter = 0;

    const result = await navigate(driver, apply);
    expect(result.outcome).toBe('failed');
  });
});

describe('navigate — survey mode', () => {
  it('follows apply links and stops at the first real question without typing', async () => {
    const driver = new ScriptedDriver(
      [
        { controls: ['Apply for this job'] },
        { controls: ['Start your application'] },
        { fields: [field('email', { required: true })], controls: ['Next'] },
      ],
      { email: 'a@b.com' },
    );

    const result = await navigate(driver, { mode: 'survey', allowSubmit: false, hasResume: false });

    expect(result.outcome).toBe('prepared');
    expect(result.questionsSeen.map((q) => q.id)).toEqual(['email']);
    expect(driver.clicks).toHaveLength(2);
    expect(result.filled).toEqual([]);
  });
});
