import { describe, expect, it } from 'vitest';
import { detectTech, gradeReadme, scoreRepo, titleFor, analyseRepo } from './analyze';
import type { GitHubRepo } from './types';

/**
 * What the portfolio is allowed to say someone knows.
 *
 * Every case here is about the same failure: a technology appearing on a public
 * page because a word appeared in a README. Run against a real account, the
 * first version of this file put "Next.js" and "AWS" on `type-fest` — a
 * types-only package that uses neither — because its README contains the words
 * "next" and "aws" in ordinary sentences. Those lines would have been printed
 * under a candidate's name for them to defend in an interview.
 */

const flat = (signal: string, prose = '', langs: string[] = []) =>
  detectTech(signal, prose, langs).flatMap((g) => g.items);

describe('detectTech — what the repository declares', () => {
  it('takes the name, description and topics at face value', () => {
    expect(flat('rag-pipeline built with LangGraph and FastAPI')).toEqual(
      expect.arrayContaining(['LangGraph', 'RAG', 'FastAPI']),
    );
  });

  it('includes the languages GitHub measured', () => {
    expect(flat('thing', '', ['Python', 'TypeScript'])).toEqual(expect.arrayContaining(['Python', 'TypeScript']));
  });
});

describe('detectTech — what a README is worth', () => {
  it('ignores ordinary English that happens to be a product name', () => {
    /* The exact regression: "next" and "aws" as words, in a package that uses
       neither. */
    const prose = 'In the next release we will improve this. See the aws branch for details.';
    const tech = flat('type-fest', prose, ['TypeScript']);
    expect(tech).not.toContain('Next.js');
    expect(tech).not.toContain('AWS');
  });

  it('accepts the product spelling', () => {
    expect(flat('portfolio', 'Built with Next.js and deployed on Vercel.')).toEqual(
      expect.arrayContaining(['Next.js', 'Vercel']),
    );
  });

  it('wants a cloud vendor named as more than a passing mention', () => {
    /* READMEs name-drop vendors in badges, sponsor blurbs and links. */
    expect(flat('thing', 'Thanks to aws for the credits.')).not.toContain('AWS');
    expect(flat('thing', 'Uploads go through AWS S3 and AWS Lambda.')).toEqual(
      expect.arrayContaining(['AWS', 'S3', 'Lambda']),
    );
  });

  it('does not read a Python lambda as AWS Lambda', () => {
    expect(flat('utils', 'Pass a lambda to the mapper.')).not.toContain('Lambda');
  });

  it('does not read the verb "express" as the framework', () => {
    expect(flat('lib', 'These options express the same thing.')).not.toContain('Express');
    expect(flat('api', 'Mounted as express middleware.')).toContain('Express');
  });

  it('does not read a spark of an idea as Apache Spark', () => {
    expect(flat('lib', 'This sparked a rewrite. A spark of inspiration.')).not.toContain('Spark');
    expect(flat('etl', 'Jobs run on Apache Spark.')).toContain('Spark');
  });

  it('still trusts a distinctive name anywhere it appears', () => {
    expect(flat('lib', 'Orchestrated with Kubernetes and Terraform.')).toEqual(
      expect.arrayContaining(['Kubernetes', 'Terraform']),
    );
  });
});

describe('gradeReadme', () => {
  it('scores an absent README at zero and says so first', () => {
    const grade = gradeReadme('');
    expect(grade.present).toBe(false);
    expect(grade.score).toBe(0);
    expect(grade.suggestions[0]).toContain('Add a README');
  });

  it('rewards the things a hiring manager actually looks for', () => {
    const good = gradeReadme(
      ['# Project', '![diagram](a.png)', '## Setup', '```bash\nnpm i\n```', '## Usage', 'word '.repeat(200)].join('\n'),
    );
    expect(good.score).toBe(100);
    expect(good.suggestions).toEqual([]);
  });

  it('puts the highest-impact fix first', () => {
    /* A screenshot moves the impression more than a usage heading does, so it
       is what the candidate is told to do next. */
    const grade = gradeReadme(['# Project', '## Setup', '## Usage', '```sh\nx\n```', 'word '.repeat(200)].join('\n'));
    expect(grade.suggestions[0]).toContain('screenshot');
  });
});

describe('titleFor', () => {
  it.each([
    ['ai-invoice-parser', 'AI Invoice Parser'],
    ['rag_evaluation', 'RAG Evaluation'],
    ['my-cli-tool', 'My CLI Tool'],
    ['etl-pipeline', 'ETL Pipeline'],
  ])('%s becomes %s', (name, expected) => {
    expect(titleFor(name)).toBe(expected);
  });
});

describe('scoreRepo', () => {
  const base = (over: Partial<Parameters<typeof scoreRepo>[0]> = {}) =>
    ({
      id: 1,
      name: 'x',
      title: 'X',
      url: '',
      demoUrl: '',
      description: '',
      tech: [],
      signals: [],
      languages: [],
      stars: 0,
      updatedAt: Date.parse('2026-08-01T00:00:00Z'),
      readme: gradeReadme(''),
      score: 0,
      publish: { allowed: true, kind: 'own-public' as const, reason: '' },
      ...over,
    }) as Parameters<typeof scoreRepo>[0];

  const now = Date.parse('2026-08-17T00:00:00Z');

  it('ranks a recent, documented project above a stale one', () => {
    const fresh = scoreRepo(base({ readme: gradeReadme('# X\n' + 'word '.repeat(200)) }), now);
    const stale = scoreRepo(base({ updatedAt: Date.parse('2021-01-01T00:00:00Z') }), now);
    expect(fresh).toBeGreaterThan(stale);
  });

  it('stays within bounds', () => {
    const maxed = scoreRepo(
      base({ stars: 9999, demoUrl: 'https://x.dev', signals: ['ai-ml', 'api', 'deployed', 'tested'] }),
      now,
    );
    expect(maxed).toBeLessThanOrEqual(100);
    expect(maxed).toBeGreaterThanOrEqual(0);
  });
});

describe('analyseRepo', () => {
  const repo: GitHubRepo = {
    id: 1,
    name: 'invoice-ai',
    full_name: 'saivivek/invoice-ai',
    owner: { login: 'saivivek', type: 'User' },
    private: false,
    fork: false,
    archived: false,
    description: 'Invoice parsing with LangGraph',
    html_url: 'https://github.com/saivivek/invoice-ai',
    homepage: 'https://invoice.example.com',
    language: 'Python',
    topics: ['ocr'],
    stargazers_count: 3,
    forks_count: 0,
    size: 200,
    pushed_at: '2026-08-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    license: { spdx_id: 'MIT' },
    has_pages: false,
  };

  it('produces a portfolio-ready project', () => {
    const out = analyseRepo({ repo, languages: { Python: 9000 } }, 'saivivek');
    expect(out.title).toBe('Invoice AI');
    expect(out.demoUrl).toBe('https://invoice.example.com');
    expect(out.tech.flatMap((g) => g.items)).toEqual(expect.arrayContaining(['LangGraph', 'Python']));
    expect(out.signals).toEqual(expect.arrayContaining(['deployed', 'licensed']));
    expect(out.publish.allowed).toBe(true);
  });

  it('analyses what it will not publish, so the candidate is told why', () => {
    const out = analyseRepo({ repo: { ...repo, fork: true } }, 'saivivek');
    expect(out.publish.allowed).toBe(false);
    expect(out.title).toBe('Invoice AI');
  });
});
