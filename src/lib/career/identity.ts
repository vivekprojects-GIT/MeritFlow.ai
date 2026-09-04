import { getCandidateProfile } from '../jobs-store';
import { getProfile } from '../profile-store';
import { listDocuments } from '../jobs/documents';
import { getCareerLinks, getSnapshot } from './store';
import type { AnalysedRepo } from './github/types';
import type { ResumeDoc } from '../jobs/resume-schema';

/**
 * The Career Identity — one read of who this candidate is.
 *
 * The facts were already in the product; they were just in five places. The
 * account holds the name and phone, the candidate profile holds target roles
 * and skills, the active résumé holds experience and education, the answer
 * vault holds what application forms ask, and GitHub holds the projects. Every
 * feature that needed "the candidate" assembled its own subset, and they
 * disagreed — the résumé header carried a LinkedIn URL the applications never
 * used, and the portfolio would have been a sixth version of the same person.
 *
 * This is that assembly, once, so a résumé, a portfolio, an application and a
 * profile review all describe the same person.
 *
 * ## What it is not
 *
 * It is a *read*. Nothing here writes, infers or fills a gap. A field the
 * candidate has not provided comes back empty, and the caller decides whether
 * that is worth interrupting them for — which is the same discipline the answer
 * vault applies to application questions, for the same reason: a plausible
 * guess about someone's career is a claim they have to defend.
 */

export type CareerIdentity = {
  userId: string;

  /* Who they are. */
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;

  /* Where they are. Empty strings, never placeholders. */
  links: {
    github: string;
    linkedin: string;
    portfolio: string;
    website: string;
  };

  /* What they have done. From the active résumé, copied verbatim. */
  resume: ResumeDoc | null;
  summary: string;

  /* Where they are going. */
  targetRoles: string[];
  locations: string[];
  skills: string[];

  /* What they have built. Empty until GitHub is connected. */
  github: {
    username: string;
    repos: AnalysedRepo[];
    /** Repositories cleared for publication, best first. */
    publishable: AnalysedRepo[];
    fetchedAt: number;
    error: string;
  };
};

/**
 * What is missing, and how much it costs.
 *
 * Ordered by impact rather than by how easy each is to fix, because a checklist
 * sorted by convenience gets the cheap items done and leaves the expensive ones
 * forever. Every entry names something the candidate can actually do.
 */
export type IdentityGap = {
  field: string;
  /** Shown to the candidate. Says what breaks, not just what is absent. */
  impact: string;
  severity: 'blocking' | 'important' | 'nice-to-have';
};

export async function getCareerIdentity(userId: string): Promise<CareerIdentity> {
  const [profile, candidate, links, snapshot, documents] = await Promise.all([
    getProfile(userId),
    getCandidateProfile(userId),
    getCareerLinks(userId),
    getSnapshot(userId),
    listDocuments(userId),
  ]);

  const active = documents.find((d) => d.kind === 'resume' && d.isActive) ?? documents.find((d) => d.kind === 'resume');
  const resume = active?.structured ?? null;
  const contact = resume?.contact;

  /* The account wins over the résumé for identity, and the résumé fills gaps.
     Their order matters: the account is what the person maintains, while a
     résumé is a snapshot of what they wrote once and may not have revised. */
  const pick = (fromAccount: string | undefined, fromResume: string | undefined) =>
    (fromAccount?.trim() || fromResume?.trim() || '').slice(0, 300);

  const repos = snapshot?.repos ?? [];

  return {
    userId,
    name: pick(profile?.name, contact?.name),
    headline: pick(profile?.headline, contact?.headline),
    email: pick(profile?.email, contact?.email),
    phone: pick(profile?.phone, contact?.phone),
    location: pick(profile?.location, contact?.location),
    links: {
      github: pick(links.github, contact?.github),
      linkedin: pick(links.linkedin, contact?.linkedin),
      portfolio: links.portfolio.trim(),
      website: pick(profile?.website, contact?.website),
    },
    resume,
    summary: (resume?.summary ?? '').trim(),
    targetRoles: candidate?.targetRoles ?? [],
    locations: candidate?.locations ?? [],
    skills: candidate?.skills ?? [],
    github: {
      username: snapshot?.username ?? '',
      repos,
      publishable: repos.filter((r) => r.publish.allowed),
      fetchedAt: snapshot?.fetchedAt ?? 0,
      error: snapshot?.error ?? '',
    },
  };
}

/**
 * What this candidate is missing, worst first.
 *
 * "Blocking" means an application will actually stop on it — those are the
 * fields the autopilot readiness check already refuses to proceed without, so
 * this list and that gate agree rather than telling the candidate two different
 * stories.
 */
export function identityGaps(identity: CareerIdentity): IdentityGap[] {
  const gaps: IdentityGap[] = [];

  if (!identity.name) {
    gaps.push({ field: 'name', impact: 'Applications cannot be filled without a name.', severity: 'blocking' });
  }
  if (!identity.email) {
    gaps.push({ field: 'email', impact: 'Employers have no way to reply.', severity: 'blocking' });
  }
  if (!identity.resume) {
    gaps.push({ field: 'resume', impact: 'Nothing can be tailored to a posting without a résumé.', severity: 'blocking' });
  }
  if (!identity.phone) {
    gaps.push({ field: 'phone', impact: 'Most application forms require one, and the run stops when it is missing.', severity: 'important' });
  }
  if (!identity.links.github) {
    gaps.push({
      field: 'github',
      impact: 'Without GitHub there are no projects to show and no portfolio to build.',
      severity: 'important',
    });
  }
  if (!identity.links.linkedin) {
    gaps.push({ field: 'linkedin', impact: 'Recruiters look for it, and forms ask for it by name.', severity: 'important' });
  }
  if (identity.links.github && identity.github.publishable.length === 0) {
    gaps.push({
      field: 'github.publishable',
      impact:
        identity.github.repos.length > 0
          ? 'None of your repositories can be published — they are private, forks, or owned by an organisation.'
          : 'GitHub is connected but has not been read yet.',
      severity: 'important',
    });
  }
  if (!identity.links.portfolio && identity.github.publishable.length > 0) {
    gaps.push({
      field: 'portfolio',
      impact: 'Your portfolio is built but not published, so applications cannot link to it.',
      severity: 'nice-to-have',
    });
  }
  if (identity.targetRoles.length === 0) {
    gaps.push({ field: 'targetRoles', impact: 'Matching and tailoring have nothing to aim at.', severity: 'important' });
  }
  if (!identity.headline) {
    gaps.push({ field: 'headline', impact: 'The line under your name on every document is blank.', severity: 'nice-to-have' });
  }

  const rank = { blocking: 0, important: 1, 'nice-to-have': 2 } as const;
  return gaps.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
