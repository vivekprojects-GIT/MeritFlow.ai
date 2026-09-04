'use client';

import { useEffect, useState } from 'react';
import { JobPilot } from '@/components/job-pilot';
import { AUTOPILOT, CALENDAR, INBOX, JOBS, PROFILE, SETTINGS } from './fixtures';

/**
 * Fixtures, and a fetch that answers with them.
 *
 * The interception is deliberately narrow — only the two endpoints these
 * widgets call — so anything else (fonts, HMR, the router) behaves normally and
 * a mistake here shows up as a broken page rather than a silently faked one.
 */

const CAREER = {
  identity: {
    name: 'Sai Vivek Katkuri',
    headline: 'AI Engineer · Data Platforms',
    email: 'katkurisaivivekk@gmail.com',
    phone: '+1 (469) 454-8320',
    location: 'Plano, TX',
    links: {
      github: 'https://github.com/saivivek',
      linkedin: 'https://linkedin.com/in/sai-vivek-katkuri',
      portfolio: '',
      website: '',
    },
    summary:
      'Data engineer building agentic AI systems, with seven years modernising enterprise data platforms in banking, retail and telecom.',
    targetRoles: ['AI Engineer', 'Data Engineer'],
    skills: ['Python', 'SQL', 'LangGraph'],
    hasResume: true,
  },
  gaps: [
    { field: 'portfolio', impact: 'Your portfolio is built but not published, so applications cannot link to it.', severity: 'nice-to-have' },
  ],
  github: {
    username: 'saivivek',
    fetchedAt: Date.now() - 3_600_000,
    error: '',
    total: 9,
    published: [
      {
        name: 'agentic-ai-platform',
        title: 'Agentic AI Platform',
        url: 'https://github.com/saivivek/agentic-ai-platform',
        demoUrl: 'https://agentic.example.com',
        description: 'Multi-agent orchestration built on LangGraph, with RAG retrieval over Pinecone',
        tech: [
          { group: 'AI', items: ['LangGraph', 'RAG', 'Vector databases'] },
          { group: 'Backend', items: ['FastAPI', 'Python'] },
        ],
        signals: ['ai-ml', 'api', 'deployed', 'documented', 'diagrammed', 'licensed'],
        stars: 24,
        score: 96,
        readme: { score: 100, suggestions: [] },
      },
      {
        name: 'rag-evaluation-harness',
        title: 'RAG Evaluation Harness',
        url: 'https://github.com/saivivek/rag-evaluation-harness',
        demoUrl: '',
        description: 'Offline evaluation for retrieval-augmented systems, with pytest fixtures',
        tech: [{ group: 'AI', items: ['RAG'] }, { group: 'Backend', items: ['Python'] }],
        signals: ['ai-ml', 'tested', 'documented'],
        stars: 5,
        score: 78,
        readme: { score: 80, suggestions: ['Add setup steps, so someone can run it.'] },
      },
      {
        name: 'oracle-etl-migration',
        title: 'Oracle ETL Migration',
        url: 'https://github.com/saivivek/oracle-etl-migration',
        demoUrl: '',
        description: 'PL/SQL to Databricks migration with Airflow orchestration and reconciliation checks',
        tech: [{ group: 'Data', items: ['Airflow', 'Databricks', 'ETL', 'Oracle PL/SQL'] }],
        signals: ['documented'],
        stars: 0,
        score: 61,
        readme: {
          score: 40,
          suggestions: [
            'Add a screenshot or an architecture diagram. It is the single biggest change.',
            'Add setup steps, so someone can run it.',
          ],
        },
      },
      {
        name: 'k8s-platform-terraform',
        title: 'K8s Platform Terraform',
        url: 'https://github.com/saivivek/k8s-platform-terraform',
        demoUrl: '',
        description: 'Kubernetes platform on AWS with Terraform modules and CI/CD',
        tech: [{ group: 'Cloud', items: ['AWS'] }, { group: 'Infrastructure', items: ['CI/CD', 'Kubernetes', 'Terraform'] }],
        signals: ['containerised', 'infrastructure-as-code'],
        stars: 2,
        score: 54,
        readme: { score: 30, suggestions: ['Say what the project does and why, in a paragraph or two.'] },
      },
    ],
    withheld: [
      { name: 'client-reporting-internal', kind: 'private', reason: 'This repository is private. Being able to read it is not permission to publish it.' },
      { name: 'fifth-third-datahub', kind: 'contribution', reason: 'Owned by fifth-third-bank, not by you. It can be credited as a contribution, but it is not yours to feature.' },
      { name: 'langgraph', kind: 'fork', reason: 'This is a fork of someone else’s project. Listing it as your own work would misstate authorship.' },
    ],
  },
  portfolios: [
    { slug: '', title: 'Sai Vivek Katkuri', projects: 4, updatedAt: Date.now() },
    { slug: 'ai', title: 'Sai Vivek Katkuri — AI / ML', projects: 4, updatedAt: Date.now() },
    { slug: 'data', title: 'Sai Vivek Katkuri — Data', projects: 4, updatedAt: Date.now() },
    { slug: 'cloud', title: 'Sai Vivek Katkuri — Cloud / Platform', projects: 4, updatedAt: Date.now() },
  ],
  publish: {
    repo: 'saivivek.github.io',
    url: 'https://saivivek.github.io',
    files: ['.nojekyll', 'index.html', 'ai/index.html', 'data/index.html', 'cloud/index.html'],
    steps: [
      'Create a public repository called exactly saivivek.github.io on your GitHub account.',
      'Download the files below and commit them to the default branch.',
      'In Settings → Pages, set the source to "Deploy from a branch" and pick that branch.',
      'Wait a minute, then open https://saivivek.github.io to check it.',
      'Paste that URL back into MeritFlow so applications start linking to it.',
    ],
    workflow: '.github/workflows/pages.yml',
  },
};

const RESUME = {
  contact: {
    name: 'Sai Vivek Katkuri',
    headline: 'AI Engineer · Data Platforms',
    location: 'Plano, TX',
    email: 'katkurisaivivekk@gmail.com',
    phone: '+1 (469) 454-8320',
    website: '',
    linkedin: 'linkedin.com/in/sai-vivek-katkuri',
    github: 'github.com/saivivek',
  },
  summary:
    'Data engineer building agentic AI systems, with seven years modernising enterprise data platforms in banking, retail and telecom.',
  education: [
    {
      school: 'Sacred Heart University',
      degree: 'Master of Science',
      field: 'Computer Science',
      location: 'Fairfield, CT',
      start: '',
      end: '05/2025',
      gpa: '',
    },
  ],
  skills: [
    { label: 'Programming', items: 'Python, SQL, TypeScript, R' },
    { label: 'AI', items: 'LangGraph, RAG, LLMs, MCP' },
    { label: 'Data', items: 'Databricks, Airflow, Oracle PL/SQL, Spark' },
  ],
  experience: [
    {
      company: 'Webflow',
      title: 'AI Engineer',
      location: 'Remote',
      start: 'Jan 2025',
      end: 'Present',
      bullets: [
        'Designed and launched AI-driven features across 5+ Webflow modules.',
        'Architected retrieval augmented generation pipelines using Pinecone.',
      ],
    },
    {
      company: 'Accenture',
      title: 'Machine Learning Engineer',
      location: 'Hyderabad, India',
      start: 'Jan 2021',
      end: 'Jul 2023',
      bullets: ['Applied LoRA techniques to optimize parameter efficiency during fine-tuning.'],
    },
  ],
  projects: [],
  extras: [
    {
      heading: 'CERTIFICATIONS',
      lines: ['AWS Certified Solutions Architect — Associate (2024)', 'Oracle Database SQL Certified Associate'],
    },
    { heading: 'LANGUAGES', lines: ['English (native), Telugu (native), Hindi (professional)'] },
  ],
  order: ['summary', 'skills', 'experience', 'education', 'projects'],
  hidden: [],
  align: 'left',
  fitToOnePage: false,
};

const DOCUMENTS = {
  documents: [
    {
      id: 'doc-1',
      kind: 'resume',
      name: 'AI Engineer résumé',
      body: '',
      fileName: 'resume.pdf',
      template: 'standard',
      font: 'sans',
      fontSize: 10.5,
      isActive: true,
      structured: RESUME,
      sourceText: '',
      parserVersion: 3,
      updatedAt: Date.now(),
    },
    {
      id: 'doc-2',
      kind: 'resume',
      name: 'Data Engineer résumé',
      body: '',
      fileName: '',
      template: 'jake',
      font: 'serif',
      fontSize: 10.5,
      isActive: false,
      structured: RESUME,
      sourceText: '',
      parserVersion: 3,
      updatedAt: Date.now() - 86_400_000,
    },
  ],
};

function install() {
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

    /* Longest prefix first: /api/jobs/settings must not be answered by the
       /api/jobs handler. */
    if (url.startsWith('/api/jobs/autopilot')) return json(AUTOPILOT);
    if (url.startsWith('/api/jobs/inbox')) return json(INBOX);
    if (url.startsWith('/api/jobs/calendar')) return json(CALENDAR);
    if (url.startsWith('/api/jobs/settings')) return json(SETTINGS);
    if (url.startsWith('/api/jobs/documents')) return json(DOCUMENTS);
    if (url.startsWith('/api/jobs/profile')) return json({ ok: true });
    if (url.startsWith('/api/jobs/applications')) return json({ ok: true });
    /* Longest prefix first, and this one nearly went missing: without it the
       broader /api/jobs rule answered an apply-by-URL call with the jobs feed,
       and the tab crashed reading a field that response does not have. */
    if (url.startsWith('/api/jobs/apply-url'))
      return json({
        state: 'DRY_RUN_COMPLETE',
        reason: 'This is /dev/ui. Nothing was sent — every request here is answered from fixtures. Use the signed-in app to apply for real.',
        /* Named so it cannot be mistaken for a real submission. A fixture that
           reads like a genuine result is worse than no fixture: it was, and
           someone reasonably believed an application had gone out. */
        company: 'FIXTURE — not a real application',
        role: 'Example Role',
        confirmation: null,
        filled: ['first_name', 'last_name', 'email', 'phone', 'resume'],
        unresolved: [{ question: 'Years of experience with Kubernetes', reason: 'No verified answer for this question yet.' }],
      });
    if (url.startsWith('/api/jobs')) return json(JOBS);
    if (url.startsWith('/api/career')) return json(CAREER);
    if (url.startsWith('/api/profile')) return json({ profile: PROFILE });
    return real(input as RequestInfo, init);
  }) as typeof window.fetch;
}

/**
 * The whole JobPilot shell, against fixtures.
 *
 * Mounting the shell rather than each widget on its own is the point: the tabs
 * share a nav, a width and a rhythm, and the mismatches between them only show
 * up side by side.
 */
export function UiHarness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* `install` patches fetch for the fixture. Deferred a tick so the state
       flip is not synchronous with the effect body, which React flags as a
       cascading render. */
    install();
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{ready && <JobPilot />}</div>
    </main>
  );
}
