import { describe, expect, it } from 'vitest';
import { buildLearningRecord, recordAsText } from './learning-record';
import { buildSkillFile, type CompletedCourse } from './skill-file';
import { goalDetail } from './goal-progress';

/**
 * Every line this produces may end up on a CV and be asked about in an
 * interview. The failure that matters is a sentence the learner cannot defend
 * in the room — so most of what follows checks that nothing is upgraded on the
 * way out.
 */

const done = (title: string, level = 'Beginner'): CompletedCourse => ({
  id: title,
  title,
  topics: [],
  level,
  completedAt: 1,
});

const fileOf = (titles: string[]) => buildSkillFile('u1', titles.map((t) => done(t)), { text: '', roleId: null });

const civilGoal = (titles: string[]) =>
  goalDetail(
    { id: 'g1', goalText: 'design bridges', roleId: 'civil-engineer' },
    fileOf(titles),
    [],
  )!;

describe('buildLearningRecord', () => {
  it('says nothing at all when nothing was finished', () => {
    /* An empty CV section is worse than no section. */
    const record = buildLearningRecord(fileOf([]), [], []);
    expect(record.empty).toBe(true);
    expect(record.bullets).toHaveLength(0);
    expect(record.summary).toBe('');
  });

  it('leads with the goal, because it says where the person is going', () => {
    const titles = ['Surveying basics', 'Engineering mathematics'];
    const record = buildLearningRecord(fileOf(titles), titles.map((t) => done(t)), [civilGoal(titles)]);
    expect(record.bullets[0].text).toContain('Civil Engineer');
    expect(record.bullets[0].text).toContain('2 of 5');
  });

  it('claims completion, never expertise', () => {
    /* "Expert in Python" from one course is a sentence a candidate has to
       defend and cannot. */
    const record = buildLearningRecord(fileOf(['Python basics']), [done('Python basics')], []);
    const all = `${record.summary} ${record.bullets.map((b) => b.text).join(' ')}`.toLowerCase();
    expect(all).not.toContain('expert');
    expect(all).not.toContain('proficient');
    expect(all).not.toContain('mastery');
    expect(all).toContain('completed');
  });

  it('does not claim to be studying something when nothing is under way', () => {
    /* "Currently studying the remainder" was filler standing in for an empty
       list. On a CV it is a claim the candidate has to defend in a room. */
    const titles = ['Surveying basics'];
    const record = buildLearningRecord(fileOf(titles), titles.map((t) => done(t)), [civilGoal(titles)]);
    const goalLine = record.bullets.find((b) => b.text.includes('Working toward'))!;

    expect(goalLine.text).not.toContain('currently studying');
    expect(goalLine.text).not.toContain('the remainder');
  });

  it('reads as one sentence, whether or not a name was given', () => {
    const record = buildLearningRecord(fileOf(['Python basics']), [done('Python basics')], []);
    expect(record.summary).not.toContain('Completed completed');
    expect(record.summary.startsWith('Completed 1 course')).toBe(true);

    const named = buildLearningRecord(fileOf(['Python basics']), [done('Python basics')], [], 'Sai Vivek Katkuri');
    expect(named.summary.startsWith('Sai has completed 1 course')).toBe(true);
  });

  it('gives every line a basis the learner can point at', () => {
    const titles = ['Python basics', 'SQL for analysts'];
    const record = buildLearningRecord(fileOf(titles), titles.map((t) => done(t)), []);
    expect(record.bullets.every((b) => b.basis.length > 0)).toBe(true);
  });

  it('counts only what was actually finished', () => {
    const record = buildLearningRecord(fileOf(['Python basics']), [done('Python basics')], []);
    expect(record.bullets.some((b) => b.text.includes('1 structured course'))).toBe(true);
  });

  it('omits a goal with nothing earned yet rather than padding', () => {
    /* "Working toward Civil Engineer: 0 of 5" on a CV is worse than silence. */
    const record = buildLearningRecord(fileOf(['Python basics']), [done('Python basics')], [civilGoal([])]);
    expect(record.bullets.some((b) => b.text.includes('Working toward'))).toBe(false);
  });
});

describe('recordAsText', () => {
  it('produces plain text that survives a CV template', () => {
    const titles = ['Python basics'];
    const record = buildLearningRecord(fileOf(titles), [done('Python basics')], []);
    const text = recordAsText(record, 'Sai Vivek Katkuri');

    expect(text).toContain('Sai Vivek Katkuri');
    expect(text).toContain('LEARNING AND DEVELOPMENT');
    expect(text).toContain('- Completed');
    /* No markdown: half the places this lands would render it literally. */
    expect(text).not.toContain('**');
    expect(text).not.toContain('##');
  });

  it('returns nothing when there is no record', () => {
    expect(recordAsText(buildLearningRecord(fileOf([]), [], []))).toBe('');
  });
});
