import type { GitHubRepo, PublishVerdict } from './types';

/**
 * What may appear on a page with the candidate's name on it.
 *
 * This gate exists because the failure it prevents is not recoverable. A
 * portfolio that quotes an employer's internal repository, or reprints a README
 * containing a live API key, is a page on the public internet under the
 * candidate's own name — and the damage is done the moment it is indexed, not
 * when someone notices.
 *
 * So it is default-deny. A repository is publishable only when every condition
 * for "this is the candidate's own public work" holds; anything else is
 * excluded with a reason the candidate can read and, where it is genuinely
 * their call, override for that one repository.
 *
 * ## What the conditions are, and why each one
 *
 * **Public.** A private repository is private for a reason nobody here knows.
 * Being able to read it through an authorised token is not permission to
 * republish it — the token was granted so the product could understand the
 * candidate's work, not broadcast it.
 *
 * **Owned by the candidate.** An organisation repository is somebody else's
 * property even when the candidate wrote most of it, and "org" covers both
 * genuine open-source communities and the employer whose code this must never
 * touch. Those two are indistinguishable from the API, so both are treated as
 * contributions rather than as the candidate's projects: linked and credited
 * honestly, never featured as "my work".
 *
 * **Not a fork.** A fork is a copy of someone else's project. Presenting one as
 * a personal project is a false claim about authorship, which is the same class
 * of problem as an invented résumé bullet.
 */

/** Anything that looks like a live credential, in text we were about to publish. */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/\bASIA[0-9A-Z]{16}\b/, 'an AWS temporary access key id'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, 'a GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'an API secret key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'a Slack token'],
  [/-----BEGIN[ A-Z]*PRIVATE KEY-----/, 'a private key block'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}["']?/i, 'a hard-coded credential'],
];

/**
 * Does this text carry something that must not be republished?
 *
 * Applied to every string lifted out of a repository — description, README
 * excerpt, topic list — rather than only to files that look like config. A key
 * pasted into a README is the common case, not the exotic one.
 *
 * Returns what was found rather than a boolean so the candidate is told which
 * repository to go and clean up. That is worth more to them than the redaction.
 */
export function findSecret(text: string): string | null {
  if (!text) return null;
  for (const [pattern, what] of SECRET_PATTERNS) {
    if (pattern.test(text)) return what;
  }
  return null;
}

/** Strip anything credential-shaped out of text bound for a public page. */
export function redact(text: string): string {
  let out = text;
  for (const [pattern] of SECRET_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), '[redacted]');
  }
  return out;
}

/**
 * May this repository appear on a published portfolio?
 *
 * `username` is the candidate's own GitHub login. It is required rather than
 * optional: without it there is no way to tell the candidate's work from
 * anyone else's, and the safe behaviour in that case is to publish nothing.
 */
export function classifyRepo(repo: GitHubRepo, username: string): PublishVerdict {
  const me = username.trim().toLowerCase();
  if (!me) {
    return {
      allowed: false,
      kind: 'unknown',
      reason: 'No GitHub username is connected, so ownership cannot be established.',
    };
  }

  if (repo.private) {
    return {
      allowed: false,
      kind: 'private',
      reason: 'This repository is private. Being able to read it is not permission to publish it.',
    };
  }

  const owner = repo.owner?.login?.toLowerCase() ?? '';
  if (!owner) {
    return { allowed: false, kind: 'unknown', reason: 'This repository has no owner recorded.' };
  }

  if (repo.fork) {
    return {
      allowed: false,
      kind: 'fork',
      reason: 'This is a fork of someone else\u2019s project. Listing it as your own work would misstate authorship.',
    };
  }

  if (owner !== me) {
    return {
      allowed: false,
      kind: 'contribution',
      reason: `Owned by ${repo.owner.login}, not by you. It can be credited as a contribution, but it is not yours to feature.`,
    };
  }

  /* Ownership established. The last check is on the text itself, because a
     repository can be entirely the candidate's own and still carry a key its
     author pasted in eighteen months ago and forgot about. */
  const leak = findSecret(`${repo.description ?? ''} ${repo.topics.join(' ')}`);
  if (leak) {
    return {
      allowed: false,
      kind: 'own-public',
      reason: `The description looks like it contains ${leak}. Remove it from the repository before this is published anywhere.`,
    };
  }

  return { allowed: true, kind: 'own-public', reason: '' };
}
