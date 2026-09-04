import type { AnalysedRepo } from '../github/types';

/**
 * Build a portfolio page from verified material.
 *
 * ## What this is allowed to use
 *
 * Repositories the privacy gate cleared, and facts already on the candidate's
 * own résumé. Nothing else. There is no model call in this file and no
 * generated prose about the candidate: a portfolio is a page an employer reads
 * before an interview, and a sentence nobody wrote is a sentence the candidate
 * has to defend having not written.
 *
 * The one piece of judgement it makes is **ordering**, which is presentation
 * rather than assertion. That is also what makes role-specific variants safe:
 * the AI page and the data page contain the same projects with the same
 * descriptions — a different three lead.
 */

export type PortfolioIdentity = {
  name: string;
  headline: string;
  location: string;
  email: string;
  linkedin: string;
  github: string;
  /** The candidate's own site, if they have one that is not this page. */
  website: string;
};

export type PortfolioExperience = {
  company: string;
  title: string;
  start: string;
  end: string;
  bullets: string[];
};

export type PortfolioInput = {
  identity: PortfolioIdentity;
  /** From the structured résumé. Copied, never rewritten. */
  summary: string;
  experience: PortfolioExperience[];
  /** Already analysed and gated. Anything not publishable is filtered here. */
  repos: AnalysedRepo[];
  /** How many projects to feature. The rest are listed compactly. */
  featured?: number;
};

/**
 * A role-specific slant.
 *
 * `emphasis` are the technologies that pull a project up the page for this
 * variant. They come from the job description or from the candidate's target
 * roles — the same input the résumé tailoring uses.
 */
export type Variant = {
  /** URL segment: '' for the canonical page, 'ai' for /ai. */
  slug: string;
  label: string;
  emphasis: string[];
};

/** The variants offered out of the box. A candidate can add their own. */
export const DEFAULT_VARIANTS: Variant[] = [
  { slug: '', label: 'Overview', emphasis: [] },
  {
    slug: 'ai',
    label: 'AI / ML',
    emphasis: ['LangGraph', 'RAG', 'LLMs', 'MCP', 'PyTorch', 'TensorFlow', 'Hugging Face', 'OpenAI', 'Anthropic', 'Bedrock', 'Vector databases', 'scikit-learn'],
  },
  {
    slug: 'data',
    label: 'Data',
    emphasis: ['PostgreSQL', 'Snowflake', 'Databricks', 'Spark', 'Airflow', 'dbt', 'Kafka', 'Oracle PL/SQL', 'ETL'],
  },
  {
    slug: 'cloud',
    label: 'Cloud / Platform',
    emphasis: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Lambda', 'S3'],
  },
];

/* ── Ordering ────────────────────────────────────────────────────────────── */

/** Every technology a repository evidences, flattened. */
function techOf(repo: AnalysedRepo): string[] {
  return repo.tech.flatMap((g) => g.items);
}

/**
 * Order projects for a variant.
 *
 * A project matching the emphasis rises; one that does not keeps its place in
 * the general ranking. Nothing is hidden and nothing is reworded — an employer
 * reading two variants side by side sees a consistent candidate, which is the
 * whole point of doing it this way rather than generating a fresh page per job.
 */
export function orderFor(repos: AnalysedRepo[], variant: Variant): AnalysedRepo[] {
  const wanted = new Set(variant.emphasis.map((e) => e.toLowerCase()));
  if (wanted.size === 0) return [...repos].sort((a, b) => b.score - a.score);

  const relevance = (repo: AnalysedRepo) => techOf(repo).filter((t) => wanted.has(t.toLowerCase())).length;

  return [...repos].sort((a, b) => {
    const byRelevance = relevance(b) - relevance(a);
    return byRelevance !== 0 ? byRelevance : b.score - a.score;
  });
}

/**
 * The technology summary for the page.
 *
 * Counted across published repositories, so a stack line is a claim with a
 * project behind every item. Ordered by how often it appears, which puts what
 * the candidate actually works in at the front.
 */
export function stackFor(repos: AnalysedRepo[]): { group: string; items: string[] }[] {
  const counts = new Map<string, Map<string, number>>();
  for (const repo of repos) {
    for (const { group, items } of repo.tech) {
      if (!counts.has(group)) counts.set(group, new Map());
      const bucket = counts.get(group)!;
      for (const item of items) bucket.set(item, (bucket.get(item) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([group, bucket]) => ({
    group,
    items: [...bucket.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name),
  }));
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

/** HTML-escape. Everything interpolated below goes through this. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A URL safe to put in an href.
 *
 * Only http(s) survives. A `javascript:` URL in a repository homepage field
 * would otherwise become a script on a page hosted under the candidate's own
 * domain — the repository metadata is attacker-controllable in the general
 * case, and this page is published.
 */
function safeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function link(href: string, text: string): string {
  const safe = safeUrl(href);
  return safe ? `<a href="${esc(safe)}" rel="noopener">${esc(text)}</a>` : '';
}

const STYLE = `
:root{--ink:#16161a;--muted:#5c5f6b;--line:#e3e4e8;--bg:#fbfbfc;--accent:#1f4fd8;--chip:#eef1f9}
@media (prefers-color-scheme:dark){:root{--ink:#e9e9ec;--muted:#9a9daa;--line:#2a2c34;--bg:#111217;--accent:#8fabff;--chip:#1c1f2a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:56px 24px 96px}
h1{font-size:2.2rem;line-height:1.15;margin:0 0 4px;letter-spacing:-.02em;text-wrap:balance}
h2{font-size:.78rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:56px 0 16px;font-weight:600}
h3{font-size:1.05rem;margin:0 0 4px;letter-spacing:-.01em}
p{margin:0 0 12px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
.tagline{color:var(--muted);font-size:1.05rem;margin:0 0 14px}
.links{display:flex;flex-wrap:wrap;gap:14px;font-size:.92rem}
nav.variants{display:flex;flex-wrap:wrap;gap:10px;margin:28px 0 0;font-size:.88rem}
nav.variants a{padding:5px 12px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}
nav.variants a[aria-current="page"]{color:var(--ink);border-color:var(--ink)}
.group{margin-bottom:14px}
.group .name{font-size:.8rem;color:var(--muted);margin-bottom:5px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{background:var(--chip);border-radius:5px;padding:3px 9px;font-size:.83rem}
article{padding:20px 0;border-top:1px solid var(--line)}
article:first-of-type{border-top:0}
.meta{display:flex;flex-wrap:wrap;gap:12px;font-size:.85rem;color:var(--muted);margin-top:8px}
ul{margin:8px 0 0;padding-left:18px}
li{margin-bottom:4px}
.role{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:baseline}
.dates{color:var(--muted);font-size:.86rem;white-space:nowrap;font-variant-numeric:tabular-nums}
.more{font-size:.92rem;color:var(--muted)}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);font-size:.82rem;color:var(--muted)}
`.trim();

function renderProjects(repos: AnalysedRepo[], featured: number): string {
  const lead = repos.slice(0, featured);
  const rest = repos.slice(featured);

  const cards = lead
    .map((repo) => {
      const links = [link(repo.url, 'Source'), repo.demoUrl ? link(repo.demoUrl, 'Live') : ''].filter(Boolean);
      const chips = techOf(repo)
        .slice(0, 8)
        .map((t) => `<span class="chip">${esc(t)}</span>`)
        .join('');
      return [
        '<article>',
        `<h3>${esc(repo.title)}</h3>`,
        repo.description ? `<p>${esc(repo.description)}</p>` : '',
        chips ? `<div class="chips">${chips}</div>` : '',
        links.length ? `<div class="meta">${links.join('')}</div>` : '',
        '</article>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  if (rest.length === 0) return cards;

  const others = rest.map((r) => link(r.url, r.title)).filter(Boolean).join(', ');
  return `${cards}\n<p class="more">Also: ${others}</p>`;
}

function renderExperience(experience: PortfolioExperience[]): string {
  return experience
    .map((role) => {
      const dates = [role.start, role.end].filter(Boolean).join(' — ');
      const bullets = role.bullets.length
        ? `<ul>${role.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
        : '';
      return [
        '<article>',
        '<div class="role">',
        `<h3>${esc([role.title, role.company].filter(Boolean).join(' · '))}</h3>`,
        dates ? `<span class="dates">${esc(dates)}</span>` : '',
        '</div>',
        bullets,
        '</article>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

export type BuiltPortfolio = {
  slug: string;
  title: string;
  html: string;
  /** Repository ids in display order, so a rebuild is comparable. */
  projectIds: number[];
};

/**
 * Render one variant.
 *
 * Self-contained HTML with inlined CSS and no external requests — it has to
 * work on GitHub Pages with no build step, and a portfolio that depends on a
 * CDN is a portfolio that breaks silently the day the CDN does.
 */
export function buildPortfolio(input: PortfolioInput, variant: Variant, variants: Variant[] = DEFAULT_VARIANTS): BuiltPortfolio {
  const publishable = input.repos.filter((r) => r.publish.allowed);
  const ordered = orderFor(publishable, variant);
  const featured = input.featured ?? 3;
  const { identity } = input;

  const heading = [identity.name, variant.slug ? `${variant.label}` : ''].filter(Boolean).join(' — ');

  const links = [
    identity.email ? `<a href="mailto:${esc(identity.email)}">Email</a>` : '',
    link(identity.linkedin, 'LinkedIn'),
    link(identity.github, 'GitHub'),
    link(identity.website, 'Website'),
  ]
    .filter(Boolean)
    .join('');

  const nav =
    variants.length > 1
      ? `<nav class="variants">${variants
          .map((v) => {
            const href = v.slug ? `/${v.slug}/` : '/';
            const current = v.slug === variant.slug ? ' aria-current="page"' : '';
            return `<a href="${esc(href)}"${current}>${esc(v.label)}</a>`;
          })
          .join('')}</nav>`
      : '';

  const stack = stackFor(ordered)
    .map(
      (g) =>
        `<div class="group"><div class="name">${esc(g.group)}</div><div class="chips">${g.items
          .map((i) => `<span class="chip">${esc(i)}</span>`)
          .join('')}</div></div>`,
    )
    .join('');

  const body = [
    '<div class="wrap">',
    '<header>',
    `<h1>${esc(identity.name)}</h1>`,
    identity.headline ? `<p class="tagline">${esc(identity.headline)}</p>` : '',
    links ? `<div class="links">${links}</div>` : '',
    nav,
    '</header>',
    input.summary ? `<h2>About</h2><p>${esc(input.summary)}</p>` : '',
    stack ? `<h2>Stack</h2>${stack}` : '',
    ordered.length ? `<h2>Projects</h2>${renderProjects(ordered, featured)}` : '',
    input.experience.length ? `<h2>Experience</h2>${renderExperience(input.experience)}` : '',
    `<footer>Every project listed here is a public repository of ${esc(identity.name)}${
      identity.location ? ` · ${esc(identity.location)}` : ''
    }</footer>`,
    '</div>',
  ]
    .filter(Boolean)
    .join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(heading)}</title>`,
    input.summary ? `<meta name="description" content="${esc(input.summary.slice(0, 160))}">` : '',
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');

  return { slug: variant.slug, title: heading, html, projectIds: ordered.map((r) => r.id) };
}

/** Build every variant that has at least one matching project. */
export function buildAll(input: PortfolioInput, variants: Variant[] = DEFAULT_VARIANTS): BuiltPortfolio[] {
  const publishable = input.repos.filter((r) => r.publish.allowed);
  const worthBuilding = variants.filter((v) => {
    if (!v.slug) return true;
    const wanted = new Set(v.emphasis.map((e) => e.toLowerCase()));
    /* A variant with nothing behind it is worse than no variant: an employer
       following /ai and finding the same generic list learns the pages are
       decoration. */
    return publishable.some((r) => techOf(r).some((t) => wanted.has(t.toLowerCase())));
  });

  return worthBuilding.map((v) => buildPortfolio(input, v, worthBuilding));
}
