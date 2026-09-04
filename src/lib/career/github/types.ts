/**
 * The parts of a GitHub repository this product reads.
 *
 * A subset of what the API returns, named here so the analyser is testable
 * against fixtures rather than against a live account, and so a change in the
 * API surface breaks compilation in one place.
 */
export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; type: 'User' | 'Organization' };
  private: boolean;
  fork: boolean;
  archived: boolean;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  size: number;
  pushed_at: string | null;
  created_at: string | null;
  license: { spdx_id: string | null } | null;
  has_pages: boolean;
};

/** A repository once it has been read and judged. */
export type AnalysedRepo = {
  id: number;
  name: string;
  /** The candidate-facing title: "ai-invoice-parser" becomes "AI Invoice Parser". */
  title: string;
  url: string;
  /** The deployed thing, when the repository points at one. */
  demoUrl: string;
  description: string;
  /** Technologies detected, grouped. Only ones with evidence in the repository. */
  tech: { group: TechGroup; items: string[] }[];
  /** Signals that say what kind of project this is. */
  signals: Signal[];
  languages: { name: string; bytes: number }[];
  stars: number;
  updatedAt: number;
  readme: ReadmeQuality;
  /** 0-100. Ranks projects for the portfolio; never shown as a claim. */
  score: number;
  /** Whether this may appear on a published page, and why not when it may not. */
  publish: PublishVerdict;
};

export type TechGroup = 'AI' | 'Backend' | 'Frontend' | 'Data' | 'Cloud' | 'Infrastructure' | 'Mobile' | 'Other';

export type Signal =
  | 'ai-ml'
  | 'api'
  | 'deployed'
  | 'containerised'
  | 'infrastructure-as-code'
  | 'tested'
  | 'documented'
  | 'licensed'
  | 'diagrammed';

export type ReadmeQuality = {
  present: boolean;
  words: number;
  hasHeadings: boolean;
  hasCodeBlocks: boolean;
  hasImages: boolean;
  hasInstall: boolean;
  hasUsage: boolean;
  /** 0-100, from the flags above. */
  score: number;
  /** What would raise the score, in the order worth doing it. */
  suggestions: string[];
};

export type PublishVerdict = {
  allowed: boolean;
  /**
   * How this repository is treated:
   *  - own-public      the candidate's own public work
   *  - contribution    public, but owned by an organisation or someone else
   *  - fork            a copy of someone else's project
   *  - private         not public
   *  - unknown         ownership could not be established
   */
  kind: 'own-public' | 'contribution' | 'fork' | 'private' | 'unknown';
  /** Shown to the candidate next to an excluded repository. */
  reason: string;
};
