/**
 * Is this posting the kind of job the candidate is actually looking for?
 *
 * ## Why the fit score does not settle this
 *
 * The scorer is a weighted sum, and a weighted sum lets a strong component pay
 * for a weak one. A backend platform role scored 70% for an AI engineer —
 * role match 7 out of 20, made up by seniority, location and freshness — while
 * an ML role at the same company scored the same 70% with a perfect role match
 * of 20. The totals were identical and the two postings were not remotely
 * comparable.
 *
 * That is the right behaviour for *ranking* and the wrong behaviour for
 * *deciding*. Discipline is not a factor to be traded against location; it is
 * the thing the candidate typed into their target roles, and a posting outside
 * it should not be applied to however convenient it is in other respects.
 *
 * ## Families, not titles
 *
 * Titles are not a controlled vocabulary — "Applied Scientist", "MLE", "Member
 * of Technical Staff" and "Forward Deployed Engineer" can all be the same job.
 * Matching titles to titles fails constantly in both directions, so both sides
 * are reduced to a family first and compared there.
 *
 * ## Unclassifiable is not rejected
 *
 * A title this cannot place goes through to the fit score, which is what
 * already judged it. Refusing everything unfamiliar would quietly narrow the
 * search to the vocabulary of this file, and the interesting jobs are often the
 * ones with strange titles.
 */

export type RoleFamily =
  | 'AI_ML'
  | 'DATA'
  | 'BACKEND'
  | 'FRONTEND'
  | 'FULLSTACK'
  | 'MOBILE'
  | 'DEVOPS'
  | 'SECURITY'
  | 'QA'
  | 'DESIGN'
  | 'PRODUCT'
  | 'SALES'
  | 'SUPPORT';

export type RoleVerdict = {
  applies: boolean;
  /** The family the posting was placed in, or null when it could not be. */
  posting: RoleFamily | null;
  /** Families the candidate said they want. */
  wanted: RoleFamily[];
  reason: string;
};

/*
 * Ordered: the first family whose pattern matches wins.
 *
 * AI/ML sits first because its titles routinely contain the words of other
 * families — "Machine Learning *Engineer*", "ML *Platform* Engineer", "AI
 * *Backend* Engineer" — and reading those as backend roles is the exact
 * confusion this file exists to prevent.
 */
const FAMILY_PATTERNS: [RoleFamily, RegExp][] = [
  [
    'AI_ML',
    /\b(machine\s*learning|\bml\b|\bai\b|a\.i\.|artificial\s+intelligence|deep\s+learning|nlp|llm|genai|gen\s?ai|generative|agentic|applied\s+scientist|research\s+scientist|research\s+engineer|data\s+scientist|computer\s+vision|mlops|prompt|foundation\s+model)\b/i,
  ],
  ['DATA', /\b(data\s+engineer|analytics\s+engineer|data\s+platform|etl|data\s+warehouse|business\s+intelligence|\bbi\b|data\s+analyst)\b/i],
  ['DEVOPS', /\b(devops|sre|site\s+reliability|infrastructure|platform\s+engineer|cloud\s+engineer|kubernetes|observability)\b/i],
  ['SECURITY', /\b(security|appsec|infosec|penetration|threat|compliance\s+engineer)\b/i],
  ['MOBILE', /\b(ios|android|mobile|react\s+native|flutter|swift|kotlin)\s*(engineer|developer)?\b/i],
  ['FRONTEND', /\b(frontend|front[-\s]end|ui\s+engineer|web\s+developer|react\s+engineer)\b/i],
  ['FULLSTACK', /\b(full[-\s]?stack|fullstack)\b/i],
  ['BACKEND', /\b(backend|back[-\s]end|server[-\s]side|api\s+engineer|distributed\s+systems)\b/i],
  ['QA', /\b(\bqa\b|quality\s+assurance|test\s+engineer|sdet|automation\s+engineer)\b/i],
  ['DESIGN', /\b(designer|\bux\b|\bui\/ux\b|product\s+design)\b/i],
  ['PRODUCT', /\b(product\s+manager|program\s+manager|\bpm\b|product\s+owner)\b/i],
  ['SALES', /\b(sales|account\s+executive|business\s+development|solutions\s+consultant)\b/i],
  ['SUPPORT', /\b(support\s+engineer|customer\s+success|technical\s+support)\b/i],
];

/**
 * Families that are close enough to apply across.
 *
 * Deliberately sparse. An ML engineer applying to a data-engineering role is a
 * reasonable stretch that many candidates make on purpose; an ML engineer
 * applying to a frontend role is not, and no amount of shared Python makes it
 * one.
 */
const ADJACENT: Partial<Record<RoleFamily, RoleFamily[]>> = {
  AI_ML: ['DATA'],
  DATA: ['AI_ML'],
  BACKEND: ['FULLSTACK'],
  FULLSTACK: ['BACKEND', 'FRONTEND'],
  FRONTEND: ['FULLSTACK'],
};

/** Which family a title belongs to, or null when it cannot be placed. */
export function familyOf(title: string): RoleFamily | null {
  for (const [family, pattern] of FAMILY_PATTERNS) {
    if (pattern.test(title)) return family;
  }
  return null;
}

/** The families a candidate's stated target roles cover. */
export function wantedFamilies(targetRoles: string[]): RoleFamily[] {
  const out = new Set<RoleFamily>();
  for (const role of targetRoles) {
    const f = familyOf(role);
    if (f) out.add(f);
  }
  return [...out];
}

export function judgeRoleFit(input: { title: string; targetRoles: string[] }): RoleVerdict {
  const wanted = wantedFamilies(input.targetRoles);
  const posting = familyOf(input.title);

  /* Nothing stated to compare against. The fit score already judged it. */
  if (wanted.length === 0) {
    return { applies: true, posting, wanted, reason: 'You have not named any target roles, so this was judged on fit alone.' };
  }

  if (posting === null) {
    return {
      applies: true,
      posting,
      wanted,
      reason: 'This title does not clearly belong to any discipline, so it was judged on fit alone.',
    };
  }

  if (wanted.includes(posting)) {
    return { applies: true, posting, wanted, reason: `A ${label(posting)} role, which is what you are looking for.` };
  }

  const adjacent = wanted.some((w) => (ADJACENT[w] ?? []).includes(posting));
  if (adjacent) {
    return { applies: true, posting, wanted, reason: `A ${label(posting)} role, adjacent to what you are looking for.` };
  }

  return {
    applies: false,
    posting,
    wanted,
    reason: `This is a ${label(posting)} role and you are looking for ${wanted.map(label).join(' or ')} work.`,
  };
}

function label(f: RoleFamily): string {
  return {
    AI_ML: 'AI/ML',
    DATA: 'data',
    BACKEND: 'backend',
    FRONTEND: 'frontend',
    FULLSTACK: 'full-stack',
    MOBILE: 'mobile',
    DEVOPS: 'infrastructure',
    SECURITY: 'security',
    QA: 'QA',
    DESIGN: 'design',
    PRODUCT: 'product',
    SALES: 'sales',
    SUPPORT: 'support',
  }[f];
}
