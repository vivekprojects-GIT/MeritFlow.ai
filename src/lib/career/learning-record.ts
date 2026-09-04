import type { GoalDetail } from './goal-progress';
import type { CompletedCourse, SkillFile } from './skill-file';

/**
 * The learner's record of what they actually learned, written to be used.
 *
 * ## What it is for
 *
 * A student finishes six courses and has nothing to show for it outside the
 * app. This turns the skill file into lines they can paste into a CV, a
 * LinkedIn summary or an email to a hiring manager — each one traceable to
 * work they completed.
 *
 * ## Why the wording is careful
 *
 * Every line here will end up on a document someone is judged by, and may be
 * asked about in an interview. "Expert in Python" from one course is a
 * sentence a candidate has to defend in a room, and cannot. So the record
 * claims exactly what happened: courses completed, subjects covered, progress
 * toward a stated goal. Nothing is upgraded on the way out.
 *
 * That restraint is also what makes it useful. A hiring manager discounts
 * self-assessment and does not discount "completed a 24-lesson course in
 * structural analysis", because it is checkable.
 */

export type RecordLine = {
  /** The sentence to paste. */
  text: string;
  /** Where it came from, so the learner can answer "says who?" */
  basis: string;
};

export type LearningRecord = {
  /** A one-paragraph summary for the top of a CV. Empty until there is something true to say. */
  summary: string;
  /** Bullet lines, strongest first. */
  bullets: RecordLine[];
  skills: string[];
  courses: { title: string; level: string; completedAt: number }[];
  goals: { title: string; earned: number; total: number; coverage: number }[];
  /** Nothing has been finished, so there is no record yet. */
  empty: boolean;
};

const listOf = (items: string[], max = 6): string => {
  const shown = items.slice(0, max);
  if (shown.length === 0) return '';
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

const titleCase = (s: string) =>
  s
    .split(' ')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

/**
 * Build the record.
 *
 * Ordered by what a reader would find most convincing: the goal being worked
 * toward, then the volume of finished work, then the specific subjects. A list
 * that opens with "completed a course on SQL" buries the fact that the person
 * is two thirds of the way to being a data analyst.
 */
export function buildLearningRecord(
  file: SkillFile,
  courses: CompletedCourse[],
  goals: GoalDetail[],
  name = '',
): LearningRecord {
  const skills = file.skills.map((s) => s.skill);
  const empty = courses.length === 0;

  if (empty) {
    return { summary: '', bullets: [], skills: [], courses: [], goals: [], empty: true };
  }

  const bullets: RecordLine[] = [];

  /* The goal first: it is the only line that says where the person is going. */
  for (const goal of goals) {
    if (goal.earned === 0) continue;

    /* Named only when something actually is. "Currently studying the
       remainder" was the filler that stood in for an empty list, and it put a
       claim on a CV that the learner would have to walk back in an interview. */
    const studying = listOf(goal.cards.filter((c) => c.state === 'started').map((c) => c.skill), 2);

    bullets.push({
      text:
        `Working toward ${goal.role.title}: ${goal.earned} of ${goal.total} essential skills covered` +
        `${studying ? `, currently studying ${studying}` : ''}.`,
      basis: `${goal.earned} of ${goal.total} essentials for ${goal.role.title}, from completed courses.`,
    });
  }

  /* Then the volume, which is the checkable part. */
  bullets.push({
    text: `Completed ${courses.length} structured course${courses.length === 1 ? '' : 's'} covering ${listOf(skills)}.`,
    basis: `${courses.length} course${courses.length === 1 ? '' : 's'} finished in full — every lesson.`,
  });

  /* Then the individual courses, most recent first, which is what an
     interviewer will actually ask about. */
  for (const course of courses.slice(0, 5)) {
    const covered = skills.filter((s) => file.skills.find((f) => f.skill === s)?.fromCourses.includes(course.title));
    bullets.push({
      text: covered.length
        ? `${course.title} — covering ${listOf(covered, 4)}.`
        : `${course.title}.`,
      basis: `Completed${course.level ? `, ${course.level.toLowerCase()} level` : ''}.`,
    });
  }

  const goalLine = goals.find((g) => g.earned > 0);

  /* With a name the sentence is about a person; without one it is about the
     work, and the verb carries the subject. Appending "completed" to both is
     what produced "Completed completed 1 course". */
  const opening = name
    ? `${name.split(' ')[0]} has completed ${courses.length} course${courses.length === 1 ? '' : 's'}`
    : `Completed ${courses.length} course${courses.length === 1 ? '' : 's'}`;

  const summary = goalLine
    ? `${opening} working toward ${goalLine.role.title}, covering ${listOf(skills, 5)}. ` +
      `${goalLine.earned} of ${goalLine.total} essential skills for the role are in place.`
    : `${opening} covering ${listOf(skills, 5)}.`;

  return {
    summary,
    bullets,
    skills,
    courses: courses.map((c) => ({ title: c.title, level: c.level, completedAt: c.completedAt })),
    goals: goals.map((g) => ({ title: g.role.title, earned: g.earned, total: g.total, coverage: g.coverage })),
    empty: false,
  };
}

/**
 * The record as plain text, ready to paste.
 *
 * Markdown would look wrong in half the places this lands — a CV template, a
 * LinkedIn box, an email — and plain text with hyphens survives all of them.
 */
export function recordAsText(record: LearningRecord, name = ''): string {
  if (record.empty) return '';

  const lines: string[] = [];
  if (name) lines.push(name, '');
  if (record.summary) lines.push(record.summary, '');

  lines.push('LEARNING AND DEVELOPMENT');
  for (const b of record.bullets) lines.push(`- ${b.text}`);

  if (record.skills.length > 0) {
    lines.push('', 'SKILLS COVERED', record.skills.map(titleCase).join(' · '));
  }

  return lines.join('\n');
}
