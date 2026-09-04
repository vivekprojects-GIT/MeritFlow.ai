import { describe, it, expect } from 'vitest';
import { familyOf, judgeRoleFit, wantedFamilies } from './role-fit';

const AI_CANDIDATE = [
  'Agentic AI Engineer', 'AI Engineer', 'GenAI Engineer', 'LLM Engineer',
  'Machine Learning Engineer', 'AI/ML Engineer',
];

describe('placing a title in a discipline', () => {
  it('reads AI/ML titles, including the oblique ones', () => {
    for (const t of [
      'Machine Learning Engineer, Ads Optimization',
      'Applied AI Engineer, Enterprise',
      'Research Scientist, Evaluations',
      'Senior GenAI Engineer',
      'Agentic Platform Engineer',
      'Data Scientist, Growth',
    ]) {
      expect(familyOf(t), t).toBe('AI_ML');
    }
  });

  /* The confusion the ordering exists to prevent. */
  it('does not read "Machine Learning Platform Engineer" as infrastructure', () => {
    expect(familyOf('Machine Learning Platform Engineer')).toBe('AI_ML');
  });

  it('reads other disciplines', () => {
    expect(familyOf('Intermediate Backend Engineer, Platform Readiness')).toBe('BACKEND');
    expect(familyOf('Software Engineer, Frontend')).toBe('FRONTEND');
    expect(familyOf('Senior Data Engineer')).toBe('DATA');
    expect(familyOf('Site Reliability Engineer')).toBe('DEVOPS');
    expect(familyOf('Product Designer')).toBe('DESIGN');
  });

  it('returns null for a title it cannot place', () => {
    expect(familyOf('Member of Technical Staff')).toBeNull();
    expect(familyOf('Software Engineer')).toBeNull();
  });

  it('derives the candidate’s families from their target roles', () => {
    expect(wantedFamilies(AI_CANDIDATE)).toEqual(['AI_ML']);
  });
});

describe('deciding whether the discipline matches', () => {
  const judge = (title: string) => judgeRoleFit({ title, targetRoles: AI_CANDIDATE });

  it('applies to AI/ML roles', () => {
    expect(judge('Senior Machine Learning Engineer, Ads Optimization').applies).toBe(true);
    expect(judge('Applied AI Engineer, Enterprise').applies).toBe(true);
  });

  /* The posting that reached the queue at 70% and nearly went out. */
  it('refuses a backend platform role for an AI engineer', () => {
    const v = judge('Intermediate Backend Engineer, Platform Readiness');
    expect(v.applies).toBe(false);
    expect(v.reason).toMatch(/backend role/i);
  });

  it('refuses a frontend role', () => {
    expect(judge('Software Engineer, Frontend').applies).toBe(false);
  });

  it('allows the adjacent data discipline', () => {
    expect(judge('Senior Data Engineer').applies).toBe(true);
  });

  it('lets an unplaceable title through to the fit score', () => {
    expect(judge('Member of Technical Staff').applies).toBe(true);
    expect(judge('Software Engineer').applies).toBe(true);
  });

  it('does not filter when no target roles are stated', () => {
    expect(judgeRoleFit({ title: 'Software Engineer, Frontend', targetRoles: [] }).applies).toBe(true);
  });
});
