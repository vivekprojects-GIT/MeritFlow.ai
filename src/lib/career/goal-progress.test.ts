import { describe, expect, it } from 'vitest';
import { courseBrief, goalDetail, type LinkedCourse } from './goal-progress';
import { buildSkillFile, type CompletedCourse } from './skill-file';
import { roleById } from './roles';

/**
 * A goal page has to answer "where am I" precisely enough to act on. Two
 * answers would be wrong in ways a learner would feel: telling them a skill is
 * missing when they are halfway through a course on it, and telling them to
 * keep going at something they finished.
 */

const finished = (title: string): CompletedCourse => ({ id: title, title, topics: [], level: 'Beginner', completedAt: 1 });

const fileWith = (titles: string[]) =>
  buildSkillFile('u1', titles.map(finished), { text: 'civil engineer', roleId: 'civil-engineer' });

const goal = { id: 'g1', goalText: 'I want to design bridges and roads', roleId: 'civil-engineer' };

const link = (skill: string, done: number, total: number): LinkedCourse => ({
  skill,
  courseId: `c-${skill}`,
  title: `${skill} course`,
  lessonsDone: done,
  lessonsTotal: total,
});

describe('goalDetail', () => {
  it('counts only essentials toward coverage', () => {
    const detail = goalDetail(goal, fileWith(['Surveying basics']), [])!;
    const role = roleById('civil-engineer')!;
    expect(detail.total).toBe(role.coreSkills.length);
    expect(detail.earned).toBe(1);
  });

  it('shows a skill with a course under way as started, not missing', () => {
    /* Telling a learner surveying is missing while they are three lessons into
       a surveying course hides the work and invites them to start it twice. */
    const detail = goalDetail(goal, fileWith([]), [link('surveying', 3, 8)])!;
    const surveying = detail.cards.find((c) => c.skill === 'surveying')!;
    expect(surveying.state).toBe('started');
    expect(surveying.course?.lessonsDone).toBe(3);
    expect(detail.inProgress).toBe(1);
  });

  it('treats a finished skill as earned even though a course is linked', () => {
    /* The link row outlives completion; earned has to win or the learner is
       told to keep going at something they completed. */
    const detail = goalDetail(goal, fileWith(['Surveying basics']), [link('surveying', 8, 8)])!;
    const surveying = detail.cards.find((c) => c.skill === 'surveying')!;
    expect(surveying.state).toBe('earned');
    expect(surveying.fromCourses).toContain('Surveying basics');
    expect(detail.inProgress).toBe(0);
  });

  it('keeps essentials in the role’s own order', () => {
    /* That order is roughly a teaching sequence. Sorting by status would
       scatter it and lose the guidance. */
    const detail = goalDetail(goal, fileWith(['Surveying basics']), [])!;
    const essentials = detail.cards.filter((c) => c.essential).map((c) => c.skill);
    expect(essentials).toEqual(roleById('civil-engineer')!.coreSkills);
  });

  it('keeps earned skills visible rather than hiding them', () => {
    const detail = goalDetail(goal, fileWith(['Surveying basics']), [])!;
    expect(detail.cards.some((c) => c.state === 'earned')).toBe(true);
  });

  it('credits a course finished before the goal was ever set', () => {
    /* The professor's course came first and the goal came after, which is the
       ordinary case: a student finishes what they were assigned and only then
       asks what it makes them. Nothing links that course to this goal, so if
       credit came from the link table the learner would be told to study
       surveying again. It comes from the skill file, which is every completed
       course regardless of why it was taken. */
    const detail = goalDetail(goal, fileWith(['Surveying basics']), [])!;
    const surveying = detail.cards.find((c) => c.skill === 'surveying')!;

    expect(surveying.state).toBe('earned');
    /* And it names the course, so the learner recognises their own work. */
    expect(surveying.fromCourses).toContain('Surveying basics');
  });

  it('separates what is held from what is missing', () => {
    /* The page groups by state, so every card must land in exactly one of the
       three groups — a state the UI does not render would vanish silently. */
    const detail = goalDetail(goal, fileWith(['Surveying basics']), [link('autocad', 2, 8)])!;
    const grouped = (['earned', 'started', 'not-started'] as const).flatMap((st) =>
      detail.cards.filter((c) => c.state === st),
    );

    expect(grouped).toHaveLength(detail.cards.length);
    expect(detail.cards.filter((c) => c.state === 'earned').length).toBeGreaterThan(0);
    expect(detail.cards.filter((c) => c.state === 'not-started').length).toBeGreaterThan(0);
  });

  it('reports nothing for a goal whose role is unknown', () => {
    expect(goalDetail({ ...goal, roleId: 'nope' }, fileWith([]), [])).toBeNull();
  });

  it('starts at zero for a learner who has finished nothing', () => {
    const detail = goalDetail(goal, fileWith([]), [])!;
    expect(detail.coverage).toBe(0);
    expect(detail.cards.every((c) => c.state === 'not-started')).toBe(true);
  });
});

describe('courseBrief', () => {
  it('teaches the skill for the career it is wanted for', () => {
    /* Structural analysis for a civil engineer is not the same course as
       structural analysis for an architect. */
    const civil = courseBrief('structural analysis', roleById('civil-engineer')!);
    const architect = courseBrief('structural analysis', roleById('architect')!);
    expect(civil).toContain('Civil Engineer');
    expect(architect).toContain('Architect');
    expect(civil).not.toBe(architect);
  });
});
