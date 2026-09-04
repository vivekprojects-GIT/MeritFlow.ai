import { ROLES, allSkills, roleById, type Role } from './roles';

/**
 * The learner's living skill file, and what it says they could become.
 *
 * ## What it is
 *
 * One record per learner: the goal they typed, and the skills they have
 * actually earned by finishing courses. It is rebuilt from completed work
 * rather than edited, so it can never drift from what the learner did — the
 * only authored part is the goal itself.
 *
 * ## Why completion is the bar
 *
 * A course half-read teaches something, and it is not evidence. A skill file
 * that counts started courses inflates over time and eventually tells a
 * student they are ready for work they cannot do, which is the one failure
 * this feature must not have. A course counts when it is finished.
 *
 * ## Why coverage, never a verdict
 *
 * "You can become a structural engineer" after three courses is flattery, and
 * a person may act on it. Every answer here is a proportion with the missing
 * pieces named: two of five essentials, and here are the other three. The
 * learner sees the distance as well as the direction, and decides for
 * themselves.
 */

/** A course the learner finished, reduced to what it can evidence. */
export type CompletedCourse = {
  id: string;
  title: string;
  /** Module and lesson titles, which is where the subject matter actually shows. */
  topics: string[];
  level: string;
  completedAt: number;
};

export type SkillFile = {
  userId: string;
  /** What the learner said they want to become, in their own words. Empty until asked. */
  goalText: string;
  /** The role that goal resolved to, when it resolved to one. */
  goalRoleId: string | null;
  /** Skills earned from finished courses, with the course that taught each. */
  skills: EarnedSkill[];
  completedCourses: number;
  updatedAt: number;
};

export type EarnedSkill = {
  skill: string;
  /** Titles of the finished courses that evidence it. Never empty. */
  fromCourses: string[];
};

export type RoleMatch = {
  role: Role;
  /** Core skills held, out of those the role requires. */
  coreHeld: string[];
  coreMissing: string[];
  supportingHeld: string[];
  /** Proportion of core skills held, 0-100. The number shown to the learner. */
  coverage: number;
};

/* ── Reading skills out of finished courses ─────────────────────────────── */

/**
 * Which known skills a finished course evidences.
 *
 * Matched on whole words against the course title and its lesson titles. Whole
 * words matter more than it looks: the job corpus in this same database tags
 * the letter R in every posting it has, because it matched substrings. "Rust"
 * inside "trust" and "go" inside "algorithms" would put a learner's skill file
 * badly wrong in exactly the same way.
 *
 * A skill is only credited when the course actually names it. Nothing is
 * inferred from adjacency — a Python course does not evidence machine
 * learning, however often the two appear together elsewhere.
 */
export function skillsInCourse(course: { title: string; topics: string[] }, vocabulary = allSkills()): string[] {
  const hay = `${course.title} ${course.topics.join(' ')}`.toLowerCase();
  const found: string[] = [];

  for (const skill of vocabulary) {
    /* Escaped, because skills legitimately contain regex characters: "ci/cd",
       "a/b testing", "signals and systems". */
    const escaped = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (pattern.test(hay)) found.push(skill);
  }

  return found;
}

/**
 * Build the skill file from finished courses.
 *
 * Rebuilt whole rather than amended, so removing a course or correcting a
 * completion cannot leave a skill behind that nothing supports any more.
 */
export function buildSkillFile(
  userId: string,
  completed: CompletedCourse[],
  goal: { text: string; roleId: string | null },
  now = Date.now(),
): SkillFile {
  const vocabulary = allSkills();
  const bySkill = new Map<string, Set<string>>();

  for (const course of completed) {
    for (const skill of skillsInCourse(course, vocabulary)) {
      const courses = bySkill.get(skill) ?? new Set<string>();
      courses.add(course.title);
      bySkill.set(skill, courses);
    }
  }

  const skills: EarnedSkill[] = [...bySkill.entries()]
    /* The most evidenced first: a skill three courses taught is one the
       learner is likelier to actually hold. */
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([skill, courses]) => ({ skill, fromCourses: [...courses] }));

  return {
    userId,
    goalText: goal.text.trim().slice(0, 400),
    goalRoleId: goal.roleId,
    skills,
    completedCourses: completed.length,
    updatedAt: now,
  };
}

/* ── What the skills add up to ──────────────────────────────────────────── */

function coverageOf(role: Role, held: Set<string>): RoleMatch {
  const coreHeld = role.coreSkills.filter((s) => held.has(s));
  const coreMissing = role.coreSkills.filter((s) => !held.has(s));
  const supportingHeld = role.supportingSkills.filter((s) => held.has(s));

  return {
    role,
    coreHeld,
    coreMissing,
    supportingHeld,
    coverage: role.coreSkills.length === 0 ? 0 : Math.round((coreHeld.length / role.coreSkills.length) * 100),
  };
}

/**
 * "What could I become?" — roles the learner has genuinely started on.
 *
 * Ranked by how much of each role's core the learner holds, with a floor: one
 * course in common is not the beginning of a career, and a list that includes
 * every role in the catalogue is a list nobody reads. Below the floor the
 * honest answer is that nothing has emerged yet, which the caller shows as an
 * invitation to finish another course rather than as a result.
 */
export function possibleRoles(file: SkillFile, floor = 25): RoleMatch[] {
  const held = new Set(file.skills.map((s) => s.skill));
  if (held.size === 0) return [];

  return ROLES.map((role) => coverageOf(role, held))
    .filter((m) => m.coverage >= floor)
    .sort((a, b) => b.coverage - a.coverage || a.role.title.localeCompare(b.role.title))
    .slice(0, 6);
}

/**
 * "What is left to become the thing I said?" — the gap against a chosen goal.
 *
 * Returns the goal's coverage with every missing core skill named, so the next
 * step is a specific thing to learn rather than an encouragement. Null when no
 * goal has been set, because inventing one would be answering a question the
 * learner has not been asked.
 */
export function goalProgress(file: SkillFile): RoleMatch | null {
  if (!file.goalRoleId) return null;
  const role = roleById(file.goalRoleId);
  if (!role) return null;
  return coverageOf(role, new Set(file.skills.map((s) => s.skill)));
}

/**
 * What to learn next, in the order that moves the learner furthest.
 *
 * Core skills of the stated goal come first: they are what stands between the
 * learner and the thing they said they want. Supporting skills follow. When no
 * goal is set, the same logic runs against the role they are already closest
 * to, so the suggestion still leads somewhere rather than everywhere.
 */
/**
 * Progress against every goal the learner is working toward.
 *
 * `goalProgress` answers the same question for one goal, and is kept because
 * the skill file carries a single most-recent goal for the places that show
 * one. This takes the ids explicitly, so a caller that has read the goals
 * table gets all of them in the order it asked for.
 *
 * Goals whose wording never resolved to a career are dropped rather than
 * returned empty: there is nothing to measure against, and a nought-percent bar
 * beside a real one reads as failure rather than as an unresolved goal.
 */
export function goalsProgress(file: SkillFile, roleIds: string[]): RoleMatch[] {
  const held = new Set(file.skills.map((s) => s.skill));
  const seen = new Set<string>();
  const out: RoleMatch[] = [];

  for (const id of roleIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const role = roleById(id);
    if (role) out.push(coverageOf(role, held));
  }

  return out;
}

/**
 * What to study next, across everything the learner is working toward.
 *
 * ## Why one list rather than a list per goal
 *
 * A learner with three goals does not have three next steps; they have one
 * afternoon. Splitting the recommendation by goal makes them do the merge
 * themselves, and the merge is exactly the part worth automating — because the
 * skills overlap. Materials science is essential to civil engineering and to
 * structural engineering both, and it is a better use of a week than a skill
 * that serves one goal only.
 *
 * So a skill is scored by what it unlocks: two points wherever it is essential,
 * one wherever it merely helps. Ties keep the order the goals were given in, so
 * the learner's own most recent goal breaks them.
 *
 * With no goals set, it falls back to the closest role the finished work
 * already points at — which is the only honest suggestion available before
 * anyone has said where they are going.
 */
export function nextSkills(
  file: SkillFile,
  limit = 6,
  goals?: RoleMatch[],
): { skill: string; why: string }[] {
  const targets = goals && goals.length > 0 ? goals : [goalProgress(file) ?? possibleRoles(file)[0]].filter(Boolean) as RoleMatch[];
  if (targets.length === 0) return [];

  const held = new Set(file.skills.map((s) => s.skill));

  type Row = { skill: string; score: number; essentialFor: string[]; supports: string[]; rank: number };
  const rows = new Map<string, Row>();

  const row = (skill: string): Row => {
    const found = rows.get(skill);
    if (found) return found;
    const made: Row = { skill, score: 0, essentialFor: [], supports: [], rank: rows.size };
    rows.set(skill, made);
    return made;
  };

  for (const target of targets) {
    for (const skill of target.coreMissing) {
      const r = row(skill);
      r.score += 2;
      r.essentialFor.push(target.role.title);
    }
    for (const skill of target.role.supportingSkills) {
      if (held.has(skill)) continue;
      const r = row(skill);
      r.score += 1;
      r.supports.push(target.role.title);
    }
  }

  const listOf = (titles: string[]): string =>
    titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;

  return [...rows.values()]
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .slice(0, limit)
    .map((r) => ({
      skill: r.skill,
      why: r.essentialFor.length > 0
        ? `Essential for ${listOf(r.essentialFor)}.`
        : `Strengthens your case for ${listOf(r.supports)}.`,
    }));
}
