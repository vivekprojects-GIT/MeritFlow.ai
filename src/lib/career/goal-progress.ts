import { roleById, type Role } from './roles';
import type { SkillFile } from './skill-file';

/**
 * Exactly where a learner stands on one goal.
 *
 * ## Why three states and not two
 *
 * "Held" and "missing" is enough to draw a progress bar and not enough to act
 * on. A learner who generated a course for surveying three days ago and is
 * halfway through it is in neither state: the skill is not earned, and telling
 * them it is missing hides the work they already did and invites them to start
 * it again.
 *
 * So a skill is earned, started, or not started, and started carries the
 * course and how far into it they are. That is the difference between a
 * progress bar and knowing what to do next.
 *
 * ## Why earned is computed, never stored
 *
 * The skill file is rebuilt from finished courses on every read. A goal that
 * cached its own copy would disagree with it the moment a lesson was
 * un-ticked, and the learner would be looking at two numbers that contradict
 * each other with no way to tell which is true.
 */

export type SkillState = 'earned' | 'started' | 'not-started';

export type SkillCard = {
  skill: string;
  state: SkillState;
  /** Whether the role treats this as essential or as strengthening. */
  essential: boolean;
  /** The courses that evidence it, once earned. */
  fromCourses: string[];
  /** The course generated for this skill, once one exists. */
  course: { id: string; title: string; lessonsDone: number; lessonsTotal: number } | null;
};

export type GoalDetail = {
  goalId: string;
  goalText: string;
  role: Role;
  cards: SkillCard[];
  /** Essentials earned, and how many there are. The headline number. */
  earned: number;
  total: number;
  coverage: number;
  /** Essentials with a course under way. Shown so effort in flight is visible. */
  inProgress: number;
};

/** A course generated for one of a goal's skills. */
export type LinkedCourse = {
  skill: string;
  courseId: string;
  title: string;
  lessonsDone: number;
  lessonsTotal: number;
};

/**
 * Build the card list for one goal.
 *
 * Essentials come first and in the role's own order, because that order is a
 * rough teaching sequence — engineering mathematics before structural
 * analysis — and re-sorting by status would scatter it. Within that, nothing
 * is hidden: an earned skill stays visible so the learner can see the ground
 * they have covered, not only the ground left.
 */
export function goalDetail(
  goal: { id: string; goalText: string; roleId: string },
  file: SkillFile,
  linked: LinkedCourse[],
): GoalDetail | null {
  const role = roleById(goal.roleId);
  if (!role) return null;

  const earnedSkills = new Map(file.skills.map((s) => [s.skill, s.fromCourses]));
  const bySkill = new Map(linked.map((l) => [l.skill, l]));

  const card = (skill: string, essential: boolean): SkillCard => {
    const evidence = earnedSkills.get(skill);
    const link = bySkill.get(skill) ?? null;

    /*
     * Earned wins over started. A learner who finished the course has the
     * skill, and showing it as in-progress because a link row exists would
     * tell them to keep going at something they completed.
     */
    const state: SkillState = evidence ? 'earned' : link ? 'started' : 'not-started';

    return {
      skill,
      state,
      essential,
      fromCourses: evidence ?? [],
      course: link
        ? { id: link.courseId, title: link.title, lessonsDone: link.lessonsDone, lessonsTotal: link.lessonsTotal }
        : null,
    };
  };

  const cards = [
    ...role.coreSkills.map((s) => card(s, true)),
    ...role.supportingSkills.map((s) => card(s, false)),
  ];

  const essentials = cards.filter((c) => c.essential);
  const earned = essentials.filter((c) => c.state === 'earned').length;

  return {
    goalId: goal.id,
    goalText: goal.goalText,
    role,
    cards,
    earned,
    total: essentials.length,
    coverage: essentials.length === 0 ? 0 : Math.round((earned / essentials.length) * 100),
    inProgress: essentials.filter((c) => c.state === 'started').length,
  };
}

/**
 * The prompt that generates a course for one skill.
 *
 * Named for the goal as well as the skill, because the same subject is taught
 * differently depending on where it is going: structural analysis for a civil
 * engineer is not the same course as structural analysis for an architect, and
 * a learner who asked to become one should not be handed the other's.
 */
export function courseBrief(skill: string, role: Role): string {
  return (
    `${skill} for someone becoming a ${role.title}. ` +
    `Teach it as it is actually used in that work — ${role.summary.toLowerCase().replace(/\.$/, '')} — ` +
    `starting from first principles and building to something they could apply.`
  );
}
