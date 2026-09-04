import { describe, expect, it } from 'vitest';
import { canonicalize, resolveQuestions, seedFromResume, seedIdentity, type VaultAnswer } from './answer-vault';

/**
 * Question routing.
 *
 * The failure this guards against is quiet: a form field resolves to the wrong
 * intent, gets a confidently wrong answer, and the application goes out with a
 * GitHub URL in the LinkedIn box. Nothing errors and nobody finds out.
 */

describe('canonicalize — identity links', () => {
  it('sends each link question to its own intent', () => {
    expect(canonicalize('LinkedIn Profile')?.intent).toBe('PROFILE.LINKEDIN');
    expect(canonicalize('GitHub')?.intent).toBe('PROFILE.GITHUB');
    expect(canonicalize('Personal website')?.intent).toBe('PROFILE.WEBSITE');
  });

  it('gives every wording of "portfolio" the same answer', () => {
    /* These used to split: "Portfolio URL" resolved to the GitHub intent and
       bare "Portfolio" to the personal-website one, so two employers asking the
       same question got two different URLs. */
    expect(canonicalize('Portfolio')?.intent).toBe('PROFILE.PORTFOLIO');
    expect(canonicalize('Portfolio URL')?.intent).toBe('PROFILE.PORTFOLIO');
    expect(canonicalize('Link to your portfolio')?.intent).toBe('PROFILE.PORTFOLIO');
  });

  it('still refuses to guess at a question it does not know', () => {
    expect(canonicalize('How many years with Kubernetes?')).toBeNull();
  });
});

describe('seedIdentity', () => {
  const seed = (identity: Parameters<typeof seedIdentity>[1]) => seedIdentity(new Map(), identity);

  it('seeds each link from the career identity', () => {
    const vault = seed({
      name: 'Sai Vivek',
      linkedin: 'https://linkedin.com/in/saivivek',
      github: 'https://github.com/saivivek',
      portfolio: 'https://saivivek.github.io',
    });

    expect(vault.get('PROFILE.LINKEDIN')?.value).toBe('https://linkedin.com/in/saivivek');
    expect(vault.get('PROFILE.GITHUB')?.value).toBe('https://github.com/saivivek');
    expect(vault.get('PROFILE.PORTFOLIO')?.value).toBe('https://saivivek.github.io');
  });

  it('falls back to the personal site when no portfolio is published', () => {
    const vault = seed({ website: 'https://saivivek.dev' });
    expect(vault.get('PROFILE.PORTFOLIO')?.value).toBe('https://saivivek.dev');
  });

  it('leaves an intent absent rather than inventing a URL', () => {
    /* An absent answer becomes an interruption, which is the correct outcome —
       a made-up profile URL on an application is worse than a blank one. */
    const vault = seed({ name: 'Sai Vivek' });
    expect(vault.has('PROFILE.PORTFOLIO')).toBe(false);
    expect(vault.has('PROFILE.LINKEDIN')).toBe(false);
  });

  it('never overwrites something the candidate verified themselves', () => {
    const vault = new Map<string, VaultAnswer>([
      [
        'PROFILE.GITHUB',
        {
          intent: 'PROFILE.GITHUB',
          value: 'https://github.com/the-one-i-actually-use',
          provenance: 'USER_VERIFIED',
          verified: true,
          sensitivity: 'NORMAL_FACT',
          autopilotOk: true,
          updatedAt: 1,
        },
      ],
    ]);

    seedIdentity(vault, { github: 'https://github.com/stale' });
    expect(vault.get('PROFILE.GITHUB')?.value).toBe('https://github.com/the-one-i-actually-use');
  });
});

describe('resolveQuestions with the seeded links', () => {
  it('answers a portfolio field from the published portfolio', () => {
    const vault = seedIdentity(new Map(), { portfolio: 'https://saivivek.github.io', website: 'https://old.example' });
    const [answer] = resolveQuestions(
      [{ id: 'portfolio_url', label: 'Portfolio URL', required: false, kind: 'text' }],
      vault,
    );

    expect(answer.value).toBe('https://saivivek.github.io');
    expect(answer.blockedReason).toBeNull();
  });
});

describe('seedFromResume', () => {
  const RESUME = {
    contact: { name: 'Sai Vivek', email: 'sai@example.com', phone: '+1 555 0100', location: 'Austin, TX' },
    experience: [
      { company: 'Northwind Labs', title: 'Senior Platform Engineer' },
      { company: 'Older Corp', title: 'Engineer' },
    ],
    education: [{ school: 'IIT Madras', degree: 'B.Tech', field: 'Computer Science', end: '2019' }],
  };

  it('answers a "Current company" field from the resume the candidate is attaching', () => {
    /*
     * The gap this closes: Lever asks for `org` on nearly every posting, the
     * vault had no intent for it, and the run stopped for the candidate to type
     * in an employer name that was printed on line one of their own CV.
     */
    const vault = seedFromResume(new Map(), RESUME);
    const [answer] = resolveQuestions(
      [{ id: 'org', label: 'Current company', required: true, kind: 'text' }],
      vault,
    );

    expect(answer.value).toBe('Northwind Labs');
    expect(answer.blockedReason).toBeNull();
  });

  it('reads the most recent role, not the oldest', () => {
    const vault = seedFromResume(new Map(), RESUME);
    expect(vault.get('HISTORY.CURRENT_TITLE')?.value).toBe('Senior Platform Engineer');
    expect(vault.get('HISTORY.CURRENT_EMPLOYER')?.value).not.toBe('Older Corp');
  });

  it('joins degree and field so one answer fits one field', () => {
    const vault = seedFromResume(new Map(), RESUME);
    expect(vault.get('EDUCATION.DEGREE')?.value).toBe('B.Tech, Computer Science');
    expect(vault.get('EDUCATION.SCHOOL')?.value).toBe('IIT Madras');
  });

  it('copies facts but never computes one', () => {
    /*
     * The line this holds: a copy is evidence, a calculation is a guess. Years
     * of experience is derivable from the dates on any resume, and deriving it
     * would put a number on an application that the candidate never wrote and
     * cannot be held to. It stays unanswered, which becomes an interruption.
     */
    const vault = seedFromResume(new Map(), RESUME);
    const [answer] = resolveQuestions(
      [{ id: 'yoe', label: 'Years of professional experience', required: true, kind: 'text' }],
      vault,
    );

    expect(answer.value).toBeNull();
    expect(answer.blockedReason).toBeTruthy();
  });

  it('never overwrites what the candidate stated themselves', () => {
    const vault = new Map<string, VaultAnswer>([
      [
        'HISTORY.CURRENT_EMPLOYER',
        {
          intent: 'HISTORY.CURRENT_EMPLOYER',
          value: 'The job I actually hold now',
          provenance: 'USER_VERIFIED',
          verified: true,
          sensitivity: 'NORMAL_FACT',
          autopilotOk: true,
          updatedAt: 1,
        },
      ],
    ]);

    seedFromResume(vault, RESUME);
    expect(vault.get('HISTORY.CURRENT_EMPLOYER')?.value).toBe('The job I actually hold now');
  });

  it('is a no-op when no resume has been parsed', () => {
    /* An account with an unparsed or missing resume must behave exactly as it
       did before this existed, rather than seeding empty strings that read as
       answers. */
    const vault = seedFromResume(new Map(), null);
    expect(vault.size).toBe(0);

    const blank = seedFromResume(new Map(), { contact: { name: '   ' }, experience: [], education: [] });
    expect(blank.size).toBe(0);
  });

  it('marks every seeded value as coming from the resume', () => {
    /* So a receipt can say where each answer came from. An application filled
       from a document the candidate wrote is a different claim than one filled
       from an answer they confirmed, and the receipt has to be able to say
       which. */
    const vault = seedFromResume(new Map(), RESUME);
    for (const answer of vault.values()) {
      expect(answer.provenance).toBe('RESUME_EVIDENCE');
    }
  });
});
