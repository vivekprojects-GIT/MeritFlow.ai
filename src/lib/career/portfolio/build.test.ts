import { describe, expect, it } from 'vitest';
import { analyseAll } from '../github/analyze';
import { buildAll, buildPortfolio, DEFAULT_VARIANTS, orderFor, stackFor } from './build';
import type { PortfolioInput } from './build';
import type { RepoInput } from '../github/analyze';
import type { GitHubRepo } from '../github/types';

/**
 * The portfolio, end to end from raw GitHub payloads.
 *
 * The properties worth pinning are the ones that make this safe to point at a
 * real employer: nothing published that the gate excluded, nothing claimed that
 * a repository does not evidence, and variants that reorder rather than
 * rewrite. Prettiness is not tested; honesty is.
 */

function repo(over: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    id: Math.floor(Math.random() * 1e9),
    name: 'thing',
    full_name: 'saivivek/thing',
    owner: { login: 'saivivek', type: 'User' },
    private: false,
    fork: false,
    archived: false,
    description: '',
    html_url: 'https://github.com/saivivek/thing',
    homepage: null,
    language: null,
    topics: [],
    stargazers_count: 0,
    forks_count: 0,
    size: 10,
    pushed_at: '2026-07-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    license: null,
    has_pages: false,
    ...over,
  };
}

const RAW: RepoInput[] = [
  {
    repo: repo({
      id: 1,
      name: 'agentic-ai-platform',
      description: 'A LangGraph agent platform with RAG retrieval over Pinecone',
      topics: ['langgraph', 'rag'],
      language: 'Python',
      homepage: 'https://agentic.example.com',
      pushed_at: '2026-08-01T00:00:00Z',
    }),
    languages: { Python: 40000, TypeScript: 5000 },
    readme: '# Agentic AI Platform\n\n![architecture](docs/arch.png)\n\n## Setup\nRun it.\n\n## Usage\nCall it.\n\n' + 'word '.repeat(200),
  },
  {
    repo: repo({
      id: 2,
      name: 'oracle-etl-migration',
      description: 'Oracle PL/SQL to Databricks ETL migration with Airflow orchestration',
      language: 'SQL',
      pushed_at: '2026-05-01T00:00:00Z',
    }),
    languages: { SQL: 20000 },
    readme: '# Oracle ETL Migration\n\n' + 'word '.repeat(150),
  },
  {
    repo: repo({ id: 3, name: 'employer-internal', private: true, description: 'internal tooling' }),
  },
  {
    repo: repo({ id: 4, name: 'someone-elses-lib', fork: true, description: 'a fork' }),
  },
  {
    repo: repo({
      id: 5,
      name: 'bank-platform',
      owner: { login: 'fifth-third-bank', type: 'Organization' },
      description: 'work repo',
    }),
  },
];

const analysed = analyseAll(RAW, 'saivivek', Date.parse('2026-08-17T00:00:00Z'));

const input: PortfolioInput = {
  identity: {
    name: 'Sai Vivek Katkuri',
    headline: 'AI / Data Engineer',
    location: 'Plano, TX',
    email: 'sai@example.com',
    linkedin: 'https://linkedin.com/in/saivivek',
    github: 'https://github.com/saivivek',
    website: '',
  },
  summary: 'Data engineer building agentic AI systems.',
  experience: [
    { company: 'Webflow', title: 'AI Engineer', start: 'Jan 2025', end: 'Present', bullets: ['Shipped RAG pipelines.'] },
  ],
  repos: analysed,
};

describe('the privacy gate reaches the page', () => {
  const page = buildPortfolio(input, DEFAULT_VARIANTS[0]).html;

  it('publishes the candidate’s own public work', () => {
    expect(page).toContain('Agentic AI Platform');
    expect(page).toContain('Oracle ETL Migration');
  });

  it('publishes nothing the gate excluded', () => {
    /* The whole safety argument, checked against the rendered bytes rather
       than against an intermediate list — this string is what gets hosted. */
    expect(page).not.toContain('employer-internal');
    expect(page).not.toContain('Employer Internal');
    expect(page).not.toContain('someone-elses-lib');
    expect(page).not.toContain('bank-platform');
    expect(page).not.toContain('fifth-third-bank');
  });
});

describe('claims are backed by repositories', () => {
  it('lists only technologies a repository evidences', () => {
    const stack = stackFor(analysed.filter((r) => r.publish.allowed)).flatMap((g) => g.items);
    expect(stack).toContain('LangGraph');
    expect(stack).toContain('RAG');
    expect(stack).toContain('Oracle PL/SQL');
    /* Nobody mentioned these anywhere. */
    expect(stack).not.toContain('Kubernetes');
    expect(stack).not.toContain('Flutter');
  });

  it('does not invent prose about the candidate', () => {
    /* The summary on the page is the one from the résumé, character for
       character. A portfolio sentence nobody wrote is one the candidate has to
       defend having not written. */
    expect(buildPortfolio(input, DEFAULT_VARIANTS[0]).html).toContain('Data engineer building agentic AI systems.');
  });
});

describe('variants reorder, they do not rewrite', () => {
  const ai = DEFAULT_VARIANTS.find((v) => v.slug === 'ai')!;
  const data = DEFAULT_VARIANTS.find((v) => v.slug === 'data')!;
  const published = analysed.filter((r) => r.publish.allowed);

  it('leads with the project that matches the role', () => {
    expect(orderFor(published, ai)[0].name).toBe('agentic-ai-platform');
    expect(orderFor(published, data)[0].name).toBe('oracle-etl-migration');
  });

  it('keeps every project on every variant', () => {
    const names = (v: typeof ai) => orderFor(published, v).map((r) => r.name).sort();
    expect(names(ai)).toEqual(names(data));
  });

  it('describes each project identically whichever page it is on', () => {
    /* An employer who opens two variants sees one consistent candidate. That
       is the reason this reorders instead of generating a page per job. */
    const aiPage = buildPortfolio(input, ai).html;
    const dataPage = buildPortfolio(input, data).html;
    const claim = 'A LangGraph agent platform with RAG retrieval over Pinecone';
    expect(aiPage).toContain(claim);
    expect(dataPage).toContain(claim);
  });

  it('skips a variant with nothing behind it', () => {
    /* Following /cloud and finding the same generic list teaches an employer
       that the pages are decoration. */
    const built = buildAll(input);
    expect(built.map((b) => b.slug).sort()).toEqual(['', 'ai', 'data']);
  });
});

describe('the page is safe to host', () => {
  it('escapes text that came from a repository', () => {
    const hostile = analyseAll(
      [{ repo: repo({ id: 9, name: 'xss', description: '<script>alert(1)</script>' }) }],
      'saivivek',
    );
    const page = buildPortfolio({ ...input, repos: hostile }, DEFAULT_VARIANTS[0]).html;
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&lt;script&gt;');
  });

  it('drops a homepage URL that is not http', () => {
    /* Repository metadata is attacker-controllable in the general case, and
       this page is published under the candidate's own domain. */
    const hostile = analyseAll(
      [{ repo: repo({ id: 10, name: 'demo', homepage: 'javascript:alert(1)' }) }],
      'saivivek',
    );
    const page = buildPortfolio({ ...input, repos: hostile }, DEFAULT_VARIANTS[0]).html;
    expect(page).not.toContain('javascript:');
  });

  it('makes no external requests', () => {
    /* It has to work on GitHub Pages with no build step, and a portfolio that
       depends on a CDN breaks silently the day the CDN does. */
    const page = buildPortfolio(input, DEFAULT_VARIANTS[0]).html;
    expect(page).not.toMatch(/<script\s+src=/i);
    expect(page).not.toMatch(/<link[^>]+stylesheet/i);
  });
});
