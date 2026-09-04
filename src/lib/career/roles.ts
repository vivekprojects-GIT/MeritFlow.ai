/**
 * What each career actually requires, so "you could become this" can be earned.
 *
 * ## Why a curated catalogue rather than inference
 *
 * The obvious source for "what does an AI engineer need" is the job corpus,
 * and it is the wrong one twice over. Its skill extraction is a substring
 * match, so the letter R is tagged in every posting; and it holds software
 * roles only, while a learner may be heading for civil engineering or
 * architecture. A recommender that can only see tech jobs would quietly tell
 * every student to become a backend engineer.
 *
 * So the requirements are written down. Each role names the skills without
 * which the job is not the job, separately from the ones that help. That
 * distinction is what lets the app say "you are two thirds of the way" and
 * mean it.
 *
 * ## Why coverage is reported rather than a verdict
 *
 * Finishing three courses does not make someone a structural engineer, and
 * telling them it does is the kind of flattery that costs a person real time.
 * Every answer this feeds is a proportion with the missing pieces named, so
 * the learner sees the distance as well as the direction.
 */

export type Discipline =
  | 'software'
  | 'data'
  | 'infrastructure'
  | 'security'
  | 'built-environment'
  | 'engineering'
  | 'product'
  | 'design'
  | 'business'
  | 'health';

export type Role = {
  id: string;
  title: string;
  discipline: Discipline;
  /** One line on what the work actually is, in the learner's language. */
  summary: string;
  /**
   * Skills without which this is not the job.
   *
   * Kept short on purpose. A list of twenty "essentials" makes every learner
   * look equally far away from everything, which tells them nothing.
   */
  coreSkills: string[];
  /** Skills that strengthen the case but are not the job's definition. */
  supportingSkills: string[];
  /** Roles a learner often moves to from here, for showing a next step. */
  adjacentRoles?: string[];
};

export const ROLES: Role[] = [
  {
    id: 'ai-engineer',
    title: 'AI Engineer',
    discipline: 'software',
    summary: 'Builds products powered by language models — retrieval, agents, evaluation and the systems around them.',
    coreSkills: ['python', 'machine learning', 'large language models', 'prompt engineering', 'apis', 'retrieval augmented generation'],
    supportingSkills: ['pytorch', 'vector databases', 'docker', 'aws', 'evaluation', 'fine-tuning', 'agents'],
    adjacentRoles: ['ml-engineer', 'data-engineer', 'backend-engineer'],
  },
  {
    id: 'ml-engineer',
    title: 'Machine Learning Engineer',
    discipline: 'data',
    summary: 'Trains, evaluates and ships models that keep working once real data reaches them.',
    coreSkills: ['python', 'machine learning', 'statistics', 'model evaluation', 'data preprocessing'],
    supportingSkills: ['pytorch', 'tensorflow', 'mlops', 'sql', 'deep learning', 'feature engineering'],
    adjacentRoles: ['ai-engineer', 'data-scientist'],
  },
  {
    id: 'data-scientist',
    title: 'Data Scientist',
    discipline: 'data',
    summary: 'Turns data into decisions — asking answerable questions and showing the evidence.',
    coreSkills: ['statistics', 'python', 'sql', 'data visualisation', 'experiment design'],
    supportingSkills: ['machine learning', 'pandas', 'a/b testing', 'communication', 'excel'],
    adjacentRoles: ['ml-engineer', 'data-analyst'],
  },
  {
    id: 'data-analyst',
    title: 'Data Analyst',
    discipline: 'data',
    summary: 'Answers business questions with data, and makes the answer legible to people who will act on it.',
    coreSkills: ['sql', 'data visualisation', 'excel', 'statistics'],
    supportingSkills: ['python', 'dashboards', 'business intelligence', 'storytelling'],
    adjacentRoles: ['data-scientist', 'data-engineer'],
  },
  {
    id: 'data-engineer',
    title: 'Data Engineer',
    discipline: 'data',
    summary: 'Builds the pipelines everything else depends on, and keeps them trustworthy.',
    coreSkills: ['sql', 'python', 'data pipelines', 'data modelling', 'etl'],
    supportingSkills: ['spark', 'airflow', 'cloud platforms', 'kafka', 'data warehousing'],
    adjacentRoles: ['backend-engineer', 'ml-engineer'],
  },
  {
    id: 'backend-engineer',
    title: 'Backend Engineer',
    discipline: 'software',
    summary: 'Builds the services behind a product — data, logic and the interfaces others build on.',
    coreSkills: ['programming', 'apis', 'databases', 'testing', 'version control'],
    supportingSkills: ['docker', 'system design', 'caching', 'message queues', 'cloud platforms'],
    adjacentRoles: ['fullstack-engineer', 'devops-engineer', 'data-engineer'],
  },
  {
    id: 'frontend-engineer',
    title: 'Frontend Engineer',
    discipline: 'software',
    summary: 'Builds what people actually touch, and makes it fast and usable.',
    coreSkills: ['html', 'css', 'javascript', 'accessibility', 'version control'],
    supportingSkills: ['react', 'typescript', 'testing', 'performance', 'design systems'],
    adjacentRoles: ['fullstack-engineer', 'ux-designer'],
  },
  {
    id: 'fullstack-engineer',
    title: 'Full-stack Engineer',
    discipline: 'software',
    summary: 'Carries a feature the whole way — interface, service and data.',
    coreSkills: ['javascript', 'apis', 'databases', 'html', 'css', 'version control'],
    supportingSkills: ['react', 'typescript', 'docker', 'testing', 'cloud platforms'],
    adjacentRoles: ['backend-engineer', 'frontend-engineer'],
  },
  {
    id: 'devops-engineer',
    title: 'DevOps Engineer',
    discipline: 'infrastructure',
    summary: 'Makes shipping boring — automation, environments and the path from commit to production.',
    coreSkills: ['linux', 'ci/cd', 'containers', 'scripting', 'cloud platforms'],
    supportingSkills: ['kubernetes', 'terraform', 'monitoring', 'networking', 'docker'],
    adjacentRoles: ['cloud-architect', 'backend-engineer'],
  },
  {
    id: 'cloud-architect',
    title: 'Cloud Architect',
    discipline: 'infrastructure',
    summary: 'Designs systems that hold up under load, cost and failure.',
    coreSkills: ['cloud platforms', 'system design', 'networking', 'security', 'cost management'],
    supportingSkills: ['kubernetes', 'terraform', 'aws', 'azure', 'disaster recovery'],
    adjacentRoles: ['devops-engineer'],
  },
  {
    id: 'cybersecurity-analyst',
    title: 'Cybersecurity Analyst',
    discipline: 'security',
    summary: 'Finds and closes the ways in, and knows what to do when something gets through.',
    coreSkills: ['networking', 'security fundamentals', 'threat detection', 'incident response', 'linux'],
    supportingSkills: ['cryptography', 'penetration testing', 'siem', 'compliance', 'scripting'],
    adjacentRoles: ['devops-engineer'],
  },
  {
    id: 'civil-engineer',
    title: 'Civil Engineer',
    discipline: 'built-environment',
    summary: 'Designs and oversees the built world — roads, water, bridges and the ground they sit on.',
    coreSkills: ['structural analysis', 'engineering mathematics', 'materials science', 'autocad', 'surveying'],
    supportingSkills: ['geotechnical engineering', 'hydraulics', 'project management', 'building codes', 'revit'],
    adjacentRoles: ['structural-engineer', 'architect'],
  },
  {
    id: 'structural-engineer',
    title: 'Structural Engineer',
    discipline: 'built-environment',
    summary: 'Works out whether a structure stands up, and what it takes to be sure.',
    coreSkills: ['structural analysis', 'engineering mathematics', 'materials science', 'building codes'],
    supportingSkills: ['finite element analysis', 'concrete design', 'steel design', 'autocad', 'seismic design'],
    adjacentRoles: ['civil-engineer'],
  },
  {
    id: 'architect',
    title: 'Architect',
    discipline: 'built-environment',
    summary: 'Designs buildings that work for the people in them and can actually be built.',
    coreSkills: ['architectural design', 'technical drawing', 'building codes', 'autocad', 'spatial planning'],
    supportingSkills: ['revit', 'sustainability', '3d modelling', 'construction methods', 'project management'],
    adjacentRoles: ['civil-engineer', 'ux-designer'],
  },
  {
    id: 'mechanical-engineer',
    title: 'Mechanical Engineer',
    discipline: 'engineering',
    summary: 'Designs things that move, and works out why they fail.',
    coreSkills: ['engineering mathematics', 'thermodynamics', 'mechanics', 'cad', 'materials science'],
    supportingSkills: ['solidworks', 'manufacturing', 'fluid dynamics', 'control systems'],
    adjacentRoles: ['electrical-engineer'],
  },
  {
    id: 'electrical-engineer',
    title: 'Electrical Engineer',
    discipline: 'engineering',
    summary: 'Designs circuits, power and the electronics other things depend on.',
    coreSkills: ['circuit analysis', 'engineering mathematics', 'electronics', 'signals and systems'],
    supportingSkills: ['embedded systems', 'power systems', 'pcb design', 'control systems'],
    adjacentRoles: ['mechanical-engineer'],
  },
  {
    id: 'product-manager',
    title: 'Product Manager',
    discipline: 'product',
    summary: 'Decides what gets built and why, and carries the reasoning to everyone else.',
    coreSkills: ['user research', 'prioritisation', 'communication', 'product strategy', 'data analysis'],
    supportingSkills: ['roadmapping', 'stakeholder management', 'sql', 'experimentation', 'writing'],
    adjacentRoles: ['ux-designer', 'data-analyst'],
  },
  {
    id: 'ux-designer',
    title: 'UX Designer',
    discipline: 'design',
    summary: 'Works out what people are trying to do, and makes the product let them.',
    coreSkills: ['user research', 'wireframing', 'prototyping', 'interaction design', 'accessibility'],
    supportingSkills: ['figma', 'usability testing', 'design systems', 'visual design', 'html'],
    adjacentRoles: ['product-manager', 'frontend-engineer'],
  },
  {
    id: 'digital-marketer',
    title: 'Digital Marketer',
    discipline: 'business',
    summary: 'Finds the people who want the thing, and measures whether the finding worked.',
    coreSkills: ['content strategy', 'seo', 'analytics', 'copywriting', 'campaign management'],
    supportingSkills: ['paid advertising', 'email marketing', 'social media', 'excel', 'a/b testing'],
    adjacentRoles: ['product-manager'],
  },
  {
    id: 'financial-analyst',
    title: 'Financial Analyst',
    discipline: 'business',
    summary: 'Builds the numbers a decision rests on, and says what they do and do not show.',
    coreSkills: ['financial modelling', 'accounting', 'excel', 'valuation', 'statistics'],
    supportingSkills: ['sql', 'forecasting', 'data visualisation', 'corporate finance'],
    adjacentRoles: ['data-analyst'],
  },
];

/** One role by id. */
export function roleById(id: string): Role | null {
  return ROLES.find((r) => r.id === id) ?? null;
}

/** Every skill any role asks for, deduplicated. The vocabulary courses map onto. */
export function allSkills(): string[] {
  const out = new Set<string>();
  for (const role of ROLES) {
    for (const s of role.coreSkills) out.add(s);
    for (const s of role.supportingSkills) out.add(s);
  }
  return [...out].sort();
}

/**
 * Find roles a learner may have meant by whatever they typed.
 *
 * The goal box takes free text — "I want to design bridges", "become an AI
 * engineer" — so this matches on the role title, its discipline and the words
 * of its summary. Returns everything plausible rather than one guess, because
 * asking "did you mean structural or civil?" is better than picking.
 */
/*
 * Words that carry no signal, removed before scoring.
 *
 * A length filter is not enough and was also actively harmful. "and" is three
 * characters, so it survived one and then matched nearly every role's prose:
 * "I want to design bridges and roads" offered Data Scientist, Cloud Architect
 * and UX Designer alongside Civil Engineer. But filtering by length in the
 * other direction threw away the answer — "ai" is two characters, so "I want
 * to become an AI engineer" scored on "engineer" alone, which eleven of the
 * twenty titles share, and the five roles shown were simply the first five in
 * the array. So the stopword list is explicit and length is not a proxy.
 *
 * Also dropped is the vocabulary of stating a goal. "want", "become" and
 * "work" describe the sentence, not the career.
 */
const NOISE = new Set([
  'and', 'the', 'for', 'with', 'into', 'that', 'this', 'from', 'was', 'are', 'you', 'your',
  'want', 'wants', 'wanted', 'become', 'becoming', 'like', 'love', 'would', 'could', 'should',
  'work', 'working', 'works', 'job', 'jobs', 'career', 'careers', 'role', 'roles', 'get',
  'good', 'great', 'best', 'some', 'thing', 'things', 'about', 'able', 'make', 'making',
  'an', 'to', 'in', 'of', 'my', 'me', 'be', 'am', 'is', 'it', 'as', 'at', 'on', 'or', 'so',
  'we', 'do', 'go', 'up', 'by', 'if', 'one', 'can', 'will',
]);

const wordsOf = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(' ').filter(Boolean);

/*
 * How many role titles contain each title word.
 *
 * "Engineer" is in eleven of twenty titles and therefore separates almost
 * nothing; "civil" is in one and separates completely. Weighting both at
 * twelve is what let a query naming neither of them return five roles in
 * array order. Computed once from ROLES so adding a role keeps it honest.
 */
const TITLE_WORD_SHARE = (() => {
  const counts = new Map<string, number>();
  for (const role of ROLES) {
    for (const w of new Set(wordsOf(role.title))) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return counts;
})();

/** A word worth 12 when it names one role, 4 when half the catalogue shares it. */
const titleWeight = (word: string): number => {
  const shared = TITLE_WORD_SHARE.get(word) ?? 0;
  if (shared === 0) return 0;
  if (shared === 1) return 12;
  if (shared <= 3) return 8;
  return 4;
};

/*
 * The word in a role's text that a query word matches, or null.
 *
 * Substring matching over the whole blob was how "ai" would have found
 * "detail", "maintain" and "explain" — three roles that have nothing to do
 * with it. Matching whole words only would lose "design" against "designer".
 * So: a word may match one that starts the same way, provided both are long
 * enough and close enough in length. "Design" reaches "designer"; "buildings"
 * does not reach the "build" in "interfaces others build on", which is how the
 * backend engineer beat the architect at describing what an architect does.
 *
 * It returns the matched word rather than a boolean because the weight depends
 * on the word that was found, not the one that was typed — "design" scores as
 * "designer", the title word it actually hit.
 */
const matchIn = (queryWord: string, haystackWords: Set<string>): string | null => {
  if (haystackWords.has(queryWord)) return queryWord;
  if (queryWord.length < 4) return null;
  for (const w of haystackWords) {
    if (w.length < 4 || Math.abs(w.length - queryWord.length) > 3) continue;
    if (w.startsWith(queryWord) || queryWord.startsWith(w)) return w;
  }
  return null;
};

/**
 * Roles a learner's own words could mean, best first.
 *
 * Returns more than one only when the query genuinely does not separate them —
 * "engineer" alone is five different jobs and the learner should be asked. A
 * query that names a role decisively returns just that role, because an
 * unnecessary "which one did you mean?" is a worse experience than a wrong
 * guess the learner can change.
 */
export function matchRoles(text: string): Role[] {
  const q = text.toLowerCase().trim();
  if (!q) return [];

  const words = wordsOf(q).filter((w) => w.length > 1 && !NOISE.has(w));
  if (words.length === 0) return [];

  const scored = ROLES.map((role) => {
    const titleWords = new Set(wordsOf(role.title));
    const summaryWords = new Set([...wordsOf(role.summary), ...wordsOf(role.discipline)]);
    const skillWords = new Set([...role.coreSkills.flatMap(wordsOf), ...role.supportingSkills.flatMap(wordsOf)]);
    let score = 0;

    /* The title named outright is the strongest possible signal. */
    if (q.includes(role.title.toLowerCase())) score += 100;

    /*
     * Otherwise a title word counts for what it distinguishes, and a word from
     * the description counts half. "Design buildings" names the job an
     * architect does without using the word architect, and scoring the summary
     * at a token weight found the UX designer and missed the architect.
     */
    /*
     * The summary outscores the skill list because it is the one line written
     * in the learner's own language, and a paraphrase lands there. "Design
     * buildings" is the architect's summary almost verbatim; the civil
     * engineer and the structural engineer reach the same two words only
     * through "building codes" in a skill list, and scoring both at one weight
     * left three roles tied and the architect losing on array order.
     */
    for (const w of words) {
      const inTitle = matchIn(w, titleWords);
      if (inTitle) score += titleWeight(inTitle);
      else if (matchIn(w, summaryWords)) score += 7;
      else if (matchIn(w, skillWords)) score += 5;
    }
    return { role, score };
  });

  const strong = scored.filter((s) => s.score >= 12).sort((a, b) => b.score - a.score);

  /*
   * A query whose only word is one eleven titles share scores four points and
   * clears nothing — and dismissing a learner who typed "I want to be an
   * engineer" is worse than asking them which kind. So when nothing is strong,
   * whatever matched at all becomes the question.
   */
  const ranked = strong.length > 0 ? strong : scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return [];

  /*
   * Only roles in contention with the leader. A clear winner is not a choice
   * to put to the learner, and the runners-up on a decisive query are exactly
   * the roles that merely share the word "engineer".
   */
  const cutoff = ranked[0].score * 0.6;
  return ranked.filter((s) => s.score >= cutoff).slice(0, 5).map((s) => s.role);
}
