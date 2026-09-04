import { describe, expect, it } from 'vitest';
import {
  buildSkillFile,
  goalProgress,
  goalsProgress,
  nextSkills,
  possibleRoles,
  skillsInCourse,
  type CompletedCourse,
} from './skill-file';
import { matchRoles, roleById } from './roles';

/**
 * The promise this feature makes to a student is that finishing courses tells
 * them something true about what they could become. Two failures would break
 * it: crediting a skill a course never taught, and declaring someone ready for
 * work they cannot do. Most of what follows guards those two.
 */

const course = (title: string, topics: string[] = [], id = title): CompletedCourse => ({
  id,
  title,
  topics,
  level: 'Beginner',
  completedAt: 1,
});

const fileFrom = (courses: CompletedCourse[], goalId: string | null = null) =>
  buildSkillFile('u1', courses, { text: '', roleId: goalId });

describe('skillsInCourse', () => {
  it('credits a skill the course actually names', () => {
    expect(skillsInCourse(course('Introduction to Python', ['Variables', 'Functions']))).toContain('python');
  });

  it('reads the lesson titles, not only the course title', () => {
    const found = skillsInCourse(course('Getting started with data', ['Writing SQL joins', 'Charting with data visualisation']));
    expect(found).toContain('sql');
    expect(found).toContain('data visualisation');
  });

  it('matches whole words only', () => {
    /* The job corpus in this same database tags the letter R in every posting
       it holds, because it matched substrings. A skill file built that way
       would be wrong about a person's career. */
    expect(skillsInCourse(course('Building trust in teams'))).not.toContain('rust');
    expect(skillsInCourse(course('Understanding algorithms'))).not.toContain('go');
    expect(skillsInCourse(course('Scalable system growth'))).not.toContain('scala');
  });

  it('handles skills containing regex characters', () => {
    expect(skillsInCourse(course('A practical guide to CI/CD'))).toContain('ci/cd');
    expect(skillsInCourse(course('Running an A/B testing programme'))).toContain('a/b testing');
  });

  it('infers nothing from adjacency', () => {
    /* Python and machine learning appear together constantly. A Python course
       is still not evidence of machine learning. */
    expect(skillsInCourse(course('Introduction to Python'))).not.toContain('machine learning');
  });
});

describe('buildSkillFile', () => {
  it('records which courses evidence each skill', () => {
    const file = fileFrom([course('Python basics'), course('Python for data', ['Using python with sql'])]);
    const python = file.skills.find((s) => s.skill === 'python');
    expect(python?.fromCourses).toHaveLength(2);
  });

  it('is rebuilt from courses, so removing one removes what it supported', () => {
    const before = fileFrom([course('Python basics'), course('Structural analysis fundamentals')]);
    expect(before.skills.map((s) => s.skill)).toContain('structural analysis');

    const after = fileFrom([course('Python basics')]);
    expect(after.skills.map((s) => s.skill)).not.toContain('structural analysis');
  });

  it('starts empty for a learner who has finished nothing', () => {
    const file = fileFrom([]);
    expect(file.skills).toHaveLength(0);
    expect(file.completedCourses).toBe(0);
  });
});

describe('possibleRoles', () => {
  it('names what a body of finished work points toward', () => {
    const file = fileFrom([
      course('Structural analysis fundamentals'),
      course('Engineering mathematics'),
      course('Materials science for builders'),
      course('AutoCAD for technical drawing'),
    ]);
    const titles = possibleRoles(file).map((m) => m.role.title);
    expect(titles).toContain('Civil Engineer');
    expect(titles).toContain('Structural Engineer');
  });

  it('does not suggest a career from one course in common', () => {
    /* Finishing an Excel course is not the start of becoming a financial
       analyst, and saying so wastes a person's time. */
    const file = fileFrom([course('Excel for beginners')]);
    expect(possibleRoles(file).map((m) => m.role.title)).not.toContain('Financial Analyst');
  });

  it('reports coverage rather than a verdict', () => {
    const file = fileFrom([course('Structural analysis'), course('Engineering mathematics')]);
    const civil = possibleRoles(file).find((m) => m.role.id === 'civil-engineer');
    expect(civil?.coverage).toBeGreaterThan(0);
    expect(civil?.coverage).toBeLessThan(100);
    /* And says what is still missing. */
    expect(civil?.coreMissing.length).toBeGreaterThan(0);
  });

  it('returns nothing when nothing has been finished', () => {
    expect(possibleRoles(fileFrom([]))).toHaveLength(0);
  });
});

describe('goalProgress', () => {
  it('measures the learner against the goal they chose', () => {
    const file = fileFrom([course('Python basics'), course('Machine learning foundations')], 'ai-engineer');
    const progress = goalProgress(file);
    expect(progress?.role.title).toBe('AI Engineer');
    expect(progress?.coreHeld).toContain('python');
    expect(progress?.coreMissing).toContain('retrieval augmented generation');
  });

  it('answers nothing when no goal was set', () => {
    /* Inventing a goal answers a question the learner was never asked. */
    expect(goalProgress(fileFrom([course('Python basics')]))).toBeNull();
  });
});

describe('nextSkills', () => {
  it('leads with what the goal requires', () => {
    const file = fileFrom([course('Python basics')], 'ai-engineer');
    const next = nextSkills(file);
    expect(next[0].why).toContain('Essential');
    expect(next.map((n) => n.skill)).toContain('machine learning');
  });

  it('never suggests something already held', () => {
    const file = fileFrom([course('Python basics')], 'ai-engineer');
    expect(nextSkills(file).map((n) => n.skill)).not.toContain('python');
  });

  it('falls back to the closest role when no goal is set', () => {
    const file = fileFrom([
      course('Structural analysis'),
      course('Engineering mathematics'),
      course('Materials science'),
    ]);
    expect(nextSkills(file).length).toBeGreaterThan(0);
  });
});

describe('goalsProgress', () => {
  it('measures every goal, not only the newest', () => {
    /* The dashboard showed one while the goals page showed three, so the two
       screens disagreed about what the learner was working on. */
    const file = fileFrom([course('Surveying basics')]);
    const rows = goalsProgress(file, ['civil-engineer', 'ai-engineer']);

    expect(rows.map((r) => r.role.id)).toEqual(['civil-engineer', 'ai-engineer']);
  });

  it('keeps the order it was given, so the newest goal stays first', () => {
    const file = fileFrom([course('Surveying basics')]);
    expect(goalsProgress(file, ['ai-engineer', 'civil-engineer'])[0].role.id).toBe('ai-engineer');
  });

  it('drops a goal that never resolved to a career', () => {
    /* A nought-percent bar beside a real one reads as failure rather than as
       a goal we could not match. */
    const file = fileFrom([course('Surveying basics')]);
    expect(goalsProgress(file, ['civil-engineer', '', 'not-a-role']).map((r) => r.role.id)).toEqual([
      'civil-engineer',
    ]);
  });

  it('counts a career named twice once', () => {
    const file = fileFrom([course('Surveying basics')]);
    expect(goalsProgress(file, ['civil-engineer', 'civil-engineer'])).toHaveLength(1);
  });
});

describe('nextSkills across several goals', () => {
  const file = () => fileFrom([course('Surveying basics')]);
  const both = () => goalsProgress(file(), ['civil-engineer', 'structural-engineer']);

  it('puts a skill that serves two goals above one that serves one', () => {
    /* A learner with two goals has one afternoon, and the overlap is the part
       worth automating. Materials science is essential to both civil and
       structural engineering; autocad is essential to civil alone. */
    const out = nextSkills(file(), 6, both()).map((n) => n.skill);
    expect(out.indexOf('materials science')).toBeLessThan(out.indexOf('autocad'));
  });

  it('names every goal a skill is essential for', () => {
    const line = nextSkills(file(), 6, both()).find((n) => n.skill === 'materials science')!;
    expect(line.why).toContain('Civil Engineer');
    expect(line.why).toContain('Structural Engineer');
  });

  it('never suggests something the learner already holds', () => {
    const out = nextSkills(file(), 12, both()).map((n) => n.skill);
    expect(out).not.toContain('surveying');
  });

  it('falls back to the closest role when no goal is set', () => {
    /* Before anyone has said where they are going, the finished work is the
       only honest basis for a suggestion. Two courses, because one skill out
       of five is under the confidence floor and correctly suggests nothing. */
    const enough = fileFrom([course('Surveying basics'), course('Engineering mathematics')]);
    expect(nextSkills(enough, 6, []).length).toBeGreaterThan(0);
  });

  it('suggests nothing when the finished work points nowhere yet', () => {
    /* One skill out of five is not a direction, and inventing one from it is
       the flattery this feature exists to avoid. */
    expect(nextSkills(fileFrom([course('Surveying basics')]), 6, [])).toEqual([]);
  });
});

describe('matchRoles', () => {
  it('understands a goal typed in the learner’s own words', () => {
    expect(matchRoles('I want to become an AI engineer').map((r) => r.id)).toContain('ai-engineer');
    expect(matchRoles('design buildings').map((r) => r.id)).toContain('architect');
  });

  it('offers the alternatives rather than picking one', () => {
    /* "engineer" alone is eleven different jobs, and asking beats guessing.
       A query that names a title outright is not ambiguous and is not asked
       about — see roles.test.ts, which owns the matcher's behaviour. */
    expect(matchRoles('I want to be an engineer').length).toBeGreaterThan(1);
  });

  it('ignores filler words that match every role', () => {
    /* "and" is three characters, so a length filter kept it, and it appears in
       nearly every role's prose. Typing "design bridges and roads" offered
       Data Scientist and Cloud Architect alongside Civil Engineer. */
    const ids = matchRoles('I want to design bridges and roads').map((r) => r.id);
    expect(ids).toContain('civil-engineer');
    expect(ids).not.toContain('data-scientist');
    expect(ids).not.toContain('cloud-architect');
  });

  it('is not fooled by the vocabulary of stating a goal', () => {
    /* "I want to become good at my job" names no career. */
    expect(matchRoles('I want to become good at my job')).toHaveLength(0);
  });

  it('returns nothing for text that names no career', () => {
    expect(matchRoles('asdfgh')).toHaveLength(0);
    expect(matchRoles('')).toHaveLength(0);
  });

  it('every catalogue role is retrievable by id', () => {
    expect(roleById('civil-engineer')?.title).toBe('Civil Engineer');
    expect(roleById('nope')).toBeNull();
  });
});
