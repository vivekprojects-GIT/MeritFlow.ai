import { classifyRepo, redact } from './privacy';
import type { AnalysedRepo, GitHubRepo, ReadmeQuality, Signal, TechGroup } from './types';

/**
 * Turn repositories into portfolio material.
 *
 * Pure functions over data the caller fetched, so the interesting behaviour —
 * what counts as evidence of a technology, what makes a README good, which
 * projects lead — is testable without a network or an account.
 *
 * The rule the whole file follows: **nothing is claimed that the repository
 * does not show.** A portfolio is a document an employer will interview
 * against, so "detected Kubernetes because the repository mentions Kubernetes"
 * is the standard, and "this looks like the kind of project that probably used
 * Kubernetes" is not something this file does. It is the same evidence rule the
 * résumé tailoring already applies, for the same reason.
 */

/* ── Technology detection ────────────────────────────────────────────────── */

/**
 * Recognised technologies.
 *
 * ## Two haystacks, because a README is not evidence in the same way
 *
 * `signal` is what the repository *declares* it is — name, description, topics.
 * Short, deliberate, written by the owner to say what this thing is.
 *
 * `prose` is the README: thousands of words of ordinary English that happen to
 * live near code. Matching bare terms in it produces confident nonsense. Run
 * against a real account, an early version of this file reported Next.js and
 * AWS on `type-fest` — a types-only package that uses neither — because its
 * README contains the words "next" and "aws" in passing. That line would have
 * gone onto a public page under someone's name for them to defend.
 *
 * So each entry declares both: `any` matches the declared fields, and `prose`
 * is the stricter spelling allowed to count from a README. An entry with no
 * `prose` pattern is never inferred from prose at all.
 */
type TechRule = {
  /** Matched against name, description and topics. */
  any: RegExp;
  /** Matched against the README. Omitted when no spelling is safe enough. */
  prose?: RegExp;
  name: string;
  group: TechGroup;
};

const TECH: TechRule[] = [
  /* AI — the group most worth getting right, and the easiest to overclaim. */
  { any: /\blang(?:chain|graph)\b/i, prose: /\blang(?:chain|graph)\b/i, name: 'LangGraph', group: 'AI' },
  { any: /\brag\b|retrieval[- ]augmented/i, prose: /retrieval[- ]augmented|\brag\s+(?:pipeline|system|index)\b/i, name: 'RAG', group: 'AI' },
  { any: /\bllms?\b|large language model/i, prose: /large language model/i, name: 'LLMs', group: 'AI' },
  { any: /\bmcp\b|model context protocol/i, prose: /model context protocol/i, name: 'MCP', group: 'AI' },
  { any: /\bpytorch\b/i, prose: /\bpytorch\b/i, name: 'PyTorch', group: 'AI' },
  { any: /\btensorflow\b/i, prose: /\btensorflow\b/i, name: 'TensorFlow', group: 'AI' },
  { any: /\bhugging\s?face\b/i, prose: /\bhugging\s?face\b/i, name: 'Hugging Face', group: 'AI' },
  { any: /\bopenai\b/i, prose: /\bopenai\b/i, name: 'OpenAI', group: 'AI' },
  { any: /\banthropic\b|\bclaude\b/i, prose: /\banthropic\b/i, name: 'Anthropic', group: 'AI' },
  { any: /\bbedrock\b/i, prose: /\b(?:amazon|aws) bedrock\b/i, name: 'Bedrock', group: 'AI' },
  {
    any: /\bpinecone\b|\bweaviate\b|\bchroma(?:db)?\b|\bqdrant\b|vector\s?(?:db|database|store)/i,
    prose: /\bpinecone\b|\bweaviate\b|\bqdrant\b|vector\s(?:database|store)/i,
    name: 'Vector databases',
    group: 'AI',
  },
  { any: /\bscikit-?learn\b|\bsklearn\b/i, prose: /\bscikit-?learn\b|\bsklearn\b/i, name: 'scikit-learn', group: 'AI' },

  /* Backend */
  { any: /\bfastapi\b/i, prose: /\bfastapi\b/i, name: 'FastAPI', group: 'Backend' },
  { any: /\bdjango\b/i, prose: /\bdjango\b/i, name: 'Django', group: 'Backend' },
  { any: /\bflask\b/i, prose: /\bflask\b/i, name: 'Flask', group: 'Backend' },
  /* "express" is an ordinary English verb; only framework spellings count. */
  {
    any: /\bexpress(?:\.js)?\b/i,
    prose: /\bexpress(?:\.js|js)\b|\bexpress (?:server|app|middleware|router)\b/i,
    name: 'Express',
    group: 'Backend',
  },
  { any: /\bspring\s?boot\b/i, prose: /\bspring\s?boot\b/i, name: 'Spring Boot', group: 'Backend' },
  { any: /\bgraphql\b/i, prose: /\bgraphql\b/i, name: 'GraphQL', group: 'Backend' },
  { any: /\bgrpc\b/i, prose: /\bgrpc\b/i, name: 'gRPC', group: 'Backend' },
  { any: /\bnode(?:\.js)?\b/i, prose: /\bnode\.?js\b/i, name: 'Node.js', group: 'Backend' },

  /* Frontend */
  /* "react" and "next" are both ordinary words. Requiring the product spelling
     in prose is what stopped a types-only package being labelled Next.js. */
  {
    any: /\breact\b/i,
    prose: /\breact(?:\.js|js)\b|\breact (?:component|hook|app|native|router)\b/i,
    name: 'React',
    group: 'Frontend',
  },
  { any: /\bnext(?:\.js)?\b/i, prose: /\bnext\.?js\b/i, name: 'Next.js', group: 'Frontend' },
  { any: /\bvue(?:\.js)?\b/i, prose: /\bvue\.?js\b/i, name: 'Vue', group: 'Frontend' },
  { any: /\bsvelte(?:kit)?\b/i, prose: /\bsvelte(?:kit)?\b/i, name: 'Svelte', group: 'Frontend' },
  { any: /\btailwind(?:\s?css)?\b/i, prose: /\btailwind(?:\s?css)?\b/i, name: 'Tailwind CSS', group: 'Frontend' },

  /* Data */
  { any: /\bpostgres(?:ql)?\b/i, prose: /\bpostgres(?:ql)?\b/i, name: 'PostgreSQL', group: 'Data' },
  { any: /\bmongo(?:db)?\b/i, prose: /\bmongodb\b/i, name: 'MongoDB', group: 'Data' },
  { any: /\bredis\b/i, prose: /\bredis\b/i, name: 'Redis', group: 'Data' },
  { any: /\bsnowflake\b/i, prose: /\bsnowflake\b/i, name: 'Snowflake', group: 'Data' },
  { any: /\bdatabricks\b/i, prose: /\bdatabricks\b/i, name: 'Databricks', group: 'Data' },
  /* Bare "spark" is a word; the distributed engine is named in full. */
  { any: /\bspark\b|\bpyspark\b/i, prose: /\bapache spark\b|\bpyspark\b/i, name: 'Spark', group: 'Data' },
  { any: /\bairflow\b/i, prose: /\bapache airflow\b|\bairflow (?:dag|scheduler)/i, name: 'Airflow', group: 'Data' },
  /* Three letters that occur inside nothing useful and outside plenty. */
  { any: /\bdbt\b/i, name: 'dbt', group: 'Data' },
  { any: /\bkafka\b/i, prose: /\bkafka\b/i, name: 'Kafka', group: 'Data' },
  { any: /\boracle\b|\bpl\/sql\b/i, prose: /\bpl\/sql\b|\boracle (?:database|db|19c|12c)\b/i, name: 'Oracle PL/SQL', group: 'Data' },
  { any: /\betl\b/i, prose: /\betl (?:pipeline|process|job)\b/i, name: 'ETL', group: 'Data' },

  /* Cloud */
  /* Cloud vendors get name-dropped constantly in READMEs — sponsor blurbs,
     badges, unrelated links — so a bare mention is not evidence that this
     project runs there. */
  {
    any: /\baws\b|amazon web services/i,
    prose: /\bamazon web services\b|\baws (?:lambda|s3|ec2|ecs|rds|sdk|cdk|iam|sqs|sns)\b/i,
    name: 'AWS',
    group: 'Cloud',
  },
  {
    any: /\bazure\b/i,
    prose: /\bmicrosoft azure\b|\bazure (?:function|blob|devops|openai|container)/i,
    name: 'Azure',
    group: 'Cloud',
  },
  { any: /\bgcp\b|google cloud/i, prose: /\bgoogle cloud\b/i, name: 'GCP', group: 'Cloud' },
  { any: /\bvercel\b/i, prose: /\bvercel\b/i, name: 'Vercel', group: 'Cloud' },
  { any: /\blambda\b/i, prose: /\baws lambda\b/i, name: 'Lambda', group: 'Cloud' },
  { any: /\bs3\b/i, prose: /\b(?:amazon|aws) s3\b/i, name: 'S3', group: 'Cloud' },

  /* Infrastructure */
  { any: /\bdocker\b/i, prose: /\bdocker(?:file|-compose)?\b/i, name: 'Docker', group: 'Infrastructure' },
  { any: /\bkubernetes\b|\bk8s\b/i, prose: /\bkubernetes\b|\bk8s\b/i, name: 'Kubernetes', group: 'Infrastructure' },
  { any: /\bterraform\b/i, prose: /\bterraform\b/i, name: 'Terraform', group: 'Infrastructure' },
  { any: /\bgithub actions\b|\bci\/cd\b/i, prose: /\bgithub actions\b|\bci\/cd\b/i, name: 'CI/CD', group: 'Infrastructure' },

  /* Mobile */
  { any: /\breact native\b/i, prose: /\breact native\b/i, name: 'React Native', group: 'Mobile' },
  { any: /\bflutter\b/i, prose: /\bflutter\b/i, name: 'Flutter', group: 'Mobile' },
  { any: /\bswiftui\b/i, prose: /\bswiftui\b/i, name: 'SwiftUI', group: 'Mobile' },
];

/** Where a language name sits, when GitHub reports one. */
const LANGUAGE_GROUP: Record<string, TechGroup> = {
  Python: 'Backend',
  TypeScript: 'Frontend',
  JavaScript: 'Frontend',
  Java: 'Backend',
  Go: 'Backend',
  Rust: 'Backend',
  Ruby: 'Backend',
  'C#': 'Backend',
  PHP: 'Backend',
  Kotlin: 'Mobile',
  Swift: 'Mobile',
  Dart: 'Mobile',
  HCL: 'Infrastructure',
  Dockerfile: 'Infrastructure',
  SQL: 'Data',
  PLpgSQL: 'Data',
  Scala: 'Data',
  R: 'Data',
};

const GROUP_ORDER: TechGroup[] = ['AI', 'Backend', 'Frontend', 'Data', 'Cloud', 'Infrastructure', 'Mobile', 'Other'];

/**
 * Detect the technologies a repository actually evidences.
 *
 * `signal` is what the repository declares — name, description, topics.
 * `prose` is the README, held to the stricter spelling. Nothing outside those
 * two and the measured languages counts.
 */
export function detectTech(signal: string, prose: string, languages: string[]): AnalysedRepo['tech'] {
  const found = new Map<TechGroup, Set<string>>();
  const add = (group: TechGroup, item: string) => {
    if (!found.has(group)) found.set(group, new Set());
    found.get(group)!.add(item);
  };

  for (const rule of TECH) {
    const declared = rule.any.test(signal);
    const written = Boolean(rule.prose && prose && rule.prose.test(prose));
    if (declared || written) add(rule.group, rule.name);
  }
  for (const lang of languages) {
    if (lang) add(LANGUAGE_GROUP[lang] ?? 'Other', lang);
  }

  return GROUP_ORDER.filter((g) => found.has(g)).map((group) => ({
    group,
    items: [...found.get(group)!].sort(),
  }));
}

/* ── README quality ──────────────────────────────────────────────────────── */

const FENCE = '`'.repeat(3);

/**
 * Judge a README the way a hiring manager skims one.
 *
 * They spend about fifteen seconds: is there a description, can I see what it
 * looks like, can I tell how to run it. The flags below are those questions,
 * and the suggestions are ordered by how much each one moves that impression.
 */
export function gradeReadme(markdown: string): ReadmeQuality {
  const text = markdown ?? '';
  const present = text.trim().length > 0;
  const words = text.split(/\s+/).filter(Boolean).length;

  const hasHeadings = /^#{1,6}\s+\S/m.test(text);
  const hasCodeBlocks = text.includes(FENCE);
  const hasImages = /!\[[^\]]*\]\([^)]+\)|<img\s/i.test(text);
  const hasInstall = /^#{1,6}\s*(install|installation|setup|getting started|quick ?start)/im.test(text);
  const hasUsage = /^#{1,6}\s*(usage|how to use|running|run|example)/im.test(text);

  const checks: [boolean, number, string][] = [
    [present, 20, 'Add a README. Without one the repository reads as unfinished.'],
    [words >= 120, 20, 'Say what the project does and why, in a paragraph or two.'],
    [hasImages, 20, 'Add a screenshot or an architecture diagram. It is the single biggest change.'],
    [hasHeadings, 10, 'Break it into headings so it can be skimmed.'],
    [hasInstall, 10, 'Add setup steps, so someone can run it.'],
    [hasUsage, 10, 'Add a usage example.'],
    [hasCodeBlocks, 10, 'Show a code or command example in a fenced block.'],
  ];

  const score = checks.reduce((sum, [ok, weight]) => sum + (ok ? weight : 0), 0);
  const suggestions = checks
    .filter(([ok]) => !ok)
    .sort((a, b) => b[1] - a[1])
    .map(([, , advice]) => advice);

  return { present, words, hasHeadings, hasCodeBlocks, hasImages, hasInstall, hasUsage, score, suggestions };
}

/* ── Signals ─────────────────────────────────────────────────────────────── */

function detectSignals(repo: GitHubRepo, haystack: string, readme: ReadmeQuality): Signal[] {
  const signals: Signal[] = [];
  const has = (re: RegExp) => re.test(haystack);

  if (has(/\b(machine learning|deep learning|llm|rag|embedding|inference|fine-?tun|neural)\b/i)) signals.push('ai-ml');
  if (has(/\b(rest|api|endpoint|fastapi|express|graphql|grpc|openapi|swagger)\b/i)) signals.push('api');
  if (repo.homepage?.trim() || repo.has_pages) signals.push('deployed');
  if (has(/\bdocker\b|\bcontainer\b|\bkubernetes\b/i)) signals.push('containerised');
  if (has(/\bterraform\b|\bcloudformation\b|\bpulumi\b|\bansible\b/i)) signals.push('infrastructure-as-code');
  if (has(/\b(pytest|jest|vitest|unittest|test suite|coverage)\b/i)) signals.push('tested');
  if (readme.score >= 60) signals.push('documented');
  if (repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION') signals.push('licensed');
  if (readme.hasImages) signals.push('diagrammed');

  return signals;
}

/* ── Titles ──────────────────────────────────────────────────────────────── */

/** Words that look wrong in Title Case. */
const ACRONYMS = new Set([
  'ai', 'ml', 'api', 'rag', 'llm', 'etl', 'sql', 'aws', 'gcp', 'ui', 'ux', 'cli', 'sdk', 'mcp',
  'nlp', 'ocr', 'crm', 'erp', 'iot', 'db', 'ci', 'cd', 'http', 'json', 'csv', 'pdf', 'gpt',
]);

/** "ai-invoice-parser" becomes "AI Invoice Parser". */
export function titleFor(name: string): string {
  return name
    .replace(/[._]+/g, '-')
    .split('-')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      /* Already camelCase or deliberately capitalised: leave it alone rather
         than flattening "GraphQL" into "Graphql". */
      if (/[a-z][A-Z]/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/* ── Scoring ─────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;

/**
 * How prominently a project should feature.
 *
 * Ordering only. It never appears on the page and it is not a judgement of the
 * work — a quiet, well-documented, recently-touched project outranks an old one
 * with more stars because that is what reads better to someone skimming, not
 * because it is better software.
 */
export function scoreRepo(repo: AnalysedRepo, now = Date.now()): number {
  let score = 0;

  /* Recency, decaying over roughly two years. Stale repositories at the top of
     a portfolio suggest someone who stopped building. */
  const ageDays = repo.updatedAt ? (now - repo.updatedAt) / DAY : 9999;
  score += Math.max(0, 30 - (ageDays / 730) * 30);

  score += Math.min(20, repo.readme.score / 5);
  score += Math.min(15, repo.stars * 3);
  score += repo.signals.length * 4;
  score += Math.min(10, repo.tech.reduce((n, g) => n + g.items.length, 0));
  if (repo.demoUrl) score += 8;
  if (repo.description.trim().length > 30) score += 5;

  return Math.round(Math.min(100, score));
}

/* ── The analyser ────────────────────────────────────────────────────────── */

export type RepoInput = {
  repo: GitHubRepo;
  /** Bytes per language, as GitHub reports them. */
  languages?: Record<string, number>;
  readme?: string;
};

/**
 * Analyse one repository.
 *
 * The privacy gate runs here, and everything is analysed including what the
 * gate excludes: the candidate is shown every repository with the reason it did
 * or did not make the portfolio, which is more useful than a list that silently
 * omits things.
 */
export function analyseRepo(input: RepoInput, username: string, now = Date.now()): AnalysedRepo {
  const { repo } = input;
  const readmeText = input.readme ?? '';
  const languages = Object.entries(input.languages ?? {})
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const languageNames = languages.map((l) => l.name);
  if (repo.language && !languageNames.includes(repo.language)) languageNames.unshift(repo.language);

  /* Kept apart on purpose — see the note on TECH. What the repository calls
     itself is evidence; what its README mentions in passing is not. */
  const signal = [repo.name, repo.description ?? '', repo.topics.join(' ')].join('\n');
  const haystack = `${signal}\n${readmeText}`;
  const readme = gradeReadme(readmeText);

  const analysed: AnalysedRepo = {
    id: repo.id,
    name: repo.name,
    title: titleFor(repo.name),
    url: repo.html_url,
    demoUrl: repo.homepage?.trim() ?? '',
    /* Redacted on the way in. The privacy gate catches credential-shaped text
       too, but this string reaches a rendered page, and belt-and-braces is the
       right posture for something that cannot be un-published. */
    description: redact(repo.description ?? '').trim(),
    tech: detectTech(signal, readmeText, languageNames),
    signals: detectSignals(repo, haystack, readme),
    languages,
    stars: repo.stargazers_count,
    updatedAt: repo.pushed_at ? Date.parse(repo.pushed_at) : 0,
    readme,
    score: 0,
    publish: classifyRepo(repo, username),
  };

  analysed.score = scoreRepo(analysed, now);
  return analysed;
}

/** Analyse a set, best first. Archived repositories sort last but are kept. */
export function analyseAll(inputs: RepoInput[], username: string, now = Date.now()): AnalysedRepo[] {
  const archived = new Map(inputs.map((i) => [i.repo.id, i.repo.archived]));
  return inputs
    .map((i) => analyseRepo(i, username, now))
    .sort((a, b) => {
      const byArchived = Number(archived.get(a.id)) - Number(archived.get(b.id));
      return byArchived !== 0 ? byArchived : b.score - a.score;
    });
}
