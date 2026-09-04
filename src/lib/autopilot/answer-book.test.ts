import { describe, expect, it } from 'vitest';
import { fromMarkdown, toMarkdown, nameFor, type BookEntry } from './answer-book';
import { learnedKey, resolveQuestions, type VaultAnswer } from './answer-vault';

/**
 * The learning loop.
 *
 * The property under test is simple to state and easy to break: a question the
 * candidate answered once must be answered automatically the next time, and a
 * question they did not answer must never be answered at all.
 */

const entry = (over: Partial<BookEntry> = {}): BookEntry => ({
  intent: 'LEARNED.notice-period',
  question: 'What is your notice period?',
  value: '4 weeks',
  provenance: 'USER_VERIFIED',
  sensitivity: 'NORMAL_FACT',
  auto: true,
  updatedAt: 1,
  source: 'learned',
  ...over,
});

const stored = (intent: string, value: string): [string, VaultAnswer] => [
  intent,
  {
    intent,
    value,
    provenance: 'USER_VERIFIED',
    verified: true,
    sensitivity: 'NORMAL_FACT',
    autopilotOk: true,
    updatedAt: 1,
  },
];

describe('learnedKey', () => {
  it('gives the same question the same key across forms', () => {
    /* The same question, punctuated three ways by three employers. */
    const a = learnedKey('What is your notice period?');
    const b = learnedKey('  What is your notice period  ');
    const c = learnedKey('What is your notice period? *');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('ignores the decoration a form puts around a label', () => {
    expect(learnedKey('Notice period (required)')).toBe(learnedKey('Notice period'));
  });

  it('keeps genuinely different questions apart', () => {
    /*
     * The temptation here is fuzzy matching — drop the stopwords, stem the
     * rest, accept anything close. That is also exactly how a stored answer
     * lands on the wrong question, and on a job application a confidently wrong
     * answer is worse than a blank one.
     */
    expect(learnedKey('Years of experience with Kubernetes')).not.toBe(
      learnedKey('Years of experience with Terraform'),
    );
    expect(learnedKey('Why do you want to work here?')).not.toBe(learnedKey('Why do you want to leave?'));
  });

  it('produces nothing for a label with no words in it', () => {
    expect(learnedKey('   ***   ')).toBe('');
  });
});

describe('resolveQuestions — learned answers', () => {
  it('answers a question the candidate has answered before', () => {
    const q = 'How many years of experience do you have with Kubernetes?';
    const vault = new Map([stored(learnedKey(q), '4')]);

    const [answer] = resolveQuestions([{ id: 'q1', label: q, required: true, kind: 'text' }], vault);
    expect(answer.value).toBe('4');
    expect(answer.blockedReason).toBeNull();
  });

  it('still refuses a question it has never been told the answer to', () => {
    const vault = new Map([stored(learnedKey('What is your notice period?'), '4 weeks')]);

    const [answer] = resolveQuestions(
      [{ id: 'q1', label: 'What is your expected bonus?', required: true, kind: 'text' }],
      vault,
    );
    expect(answer.value).toBeNull();
    expect(answer.blockedReason).toBeTruthy();
  });

  it('never fills an attestation, even once it has been stored', () => {
    /*
     * The single worst thing this system could do is assert, in someone's name,
     * that what they filed is true. The intent registry classifies the
     * attestations it recognises; this covers the ones it does not, which is
     * precisely the population that reaches the learned path.
     */
    const q = 'Do you consent to a background check being run?';
    const vault = new Map([stored(learnedKey(q), 'Yes')]);

    const [answer] = resolveQuestions([{ id: 'cert', label: q, required: true, kind: 'boolean' }], vault);
    expect(answer.blockedReason).toMatch(/only you/i);
    expect(answer.sensitivity).toBe('LEGAL_ATTESTATION');
  });

  it('does not read "design" as an electronic signature', () => {
    /* The attestation guard is a substring match over legal vocabulary, and an
       earlier revision of it matched "esign" inside "design" — which would have
       held back every application asking about design experience. */
    const q = 'How many years of design experience do you have?';
    const vault = new Map([stored(learnedKey(q), '6')]);

    const [answer] = resolveQuestions([{ id: 'q1', label: q, required: true, kind: 'text' }], vault);
    expect(answer.blockedReason).toBeNull();
    expect(answer.value).toBe('6');
  });
});

describe('the editable file', () => {
  it('survives a round trip through Markdown', () => {
    /* The candidate edits this in a text editor. An answer that comes back
       under a different key is a second, near-duplicate entry and a question
       that starts being asked again. */
    const entries = [
      entry(),
      entry({ intent: 'WORK_AUTH.SPONSORSHIP', question: 'Will you need visa sponsorship?', value: 'No', source: 'standard' }),
    ];

    const parsed = fromMarkdown(toMarkdown(entries));
    expect(parsed).toHaveLength(2);
    expect(parsed.find((p) => p.intent === 'LEARNED.notice-period')?.value).toBe('4 weeks');
    expect(parsed.find((p) => p.intent === 'WORK_AUTH.SPONSORSHIP')?.value).toBe('No');
  });

  it('carries an edited answer back to the same question', () => {
    const md = toMarkdown([entry()]).replace('4 weeks', '2 weeks');
    expect(fromMarkdown(md)[0]).toMatchObject({ intent: 'LEARNED.notice-period', value: '2 weeks' });
  });

  it('skips an entry whose key was deleted rather than guessing at it', () => {
    const md = toMarkdown([entry()])
      .split('\n')
      .filter((l) => !l.startsWith('key:'))
      .join('\n');
    expect(fromMarkdown(md)).toHaveLength(0);
  });

  it('does not mistake our own callout for the answer', () => {
    const md = toMarkdown([entry({ auto: false })]);
    expect(fromMarkdown(md)[0].value).toBe('4 weeks');
  });

  it('parses an empty file into nothing at all', () => {
    expect(fromMarkdown('')).toEqual([]);
    expect(fromMarkdown('# Just a heading\n\nsome prose')).toEqual([]);
  });
});

describe('nameFor', () => {
  it('prefers the wording the employer used', () => {
    expect(nameFor('LEARNED.x', 'How did you hear about us, specifically?')).toBe(
      'How did you hear about us, specifically?',
    );
  });

  it('never shows a routing key to a person when it has a name for it', () => {
    expect(nameFor('WORK_AUTH.SPONSORSHIP', '')).toBe('Will you need visa sponsorship?');
  });

  it('falls back to the key rather than inventing a label', () => {
    expect(nameFor('SOMETHING.NEW', '')).toBe('SOMETHING.NEW');
  });
});
