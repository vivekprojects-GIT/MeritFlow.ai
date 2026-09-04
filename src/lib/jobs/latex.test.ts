import { describe, it, expect } from 'vitest';
import { toLatex } from './latex';

const B = String.fromCharCode(92);

const RESUME = [
  'SUMMARY',
  'Machine learning engineer with three years of experience.',
  '',
  'EXPERIENCE',
  'Webflow — AI Engineer',
  '- Built RAG pipelines with Pinecone & ChromaDB.',
  '- Cut inference latency 30% across 5 services.',
  '',
  'SKILLS',
  'Python, PyTorch, C++, R&D tooling',
].join('\n');

describe('toLatex', () => {
  const tex = toLatex(RESUME, { name: 'Sai Vivek Katkuri', email: 'sv@example.com', phone: '+1 555 010 0000' });

  it('produces a complete document', () => {
    expect(tex).toContain(`${B}documentclass`);
    expect(tex).toContain(`${B}begin{document}`);
    expect(tex.trimEnd().endsWith(`${B}end{document}`)).toBe(true);
  });

  it('uses only packages a stock TeX Live already has', () => {
    const packages = [...tex.matchAll(/usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)].map((m) => m[1]);
    expect(packages.sort()).toEqual(['enumitem', 'geometry', 'hyperref', 'titlesec']);
  });

  it('carries the candidate name and contact line', () => {
    expect(tex).toContain('Sai Vivek Katkuri');
    expect(tex).toContain('sv@example.com');
  });

  it('turns résumé headings into sections', () => {
    expect(tex).toContain(`${B}section{SUMMARY}`);
    expect(tex).toContain(`${B}section{EXPERIENCE}`);
    expect(tex).toContain(`${B}section{SKILLS}`);
  });

  it('turns bullet lines into an itemize', () => {
    expect(tex).toContain(`${B}begin{itemize}`);
    expect(tex).toContain(`${B}item Built RAG pipelines`);
  });

  it('leaves prose as paragraphs rather than forcing a list', () => {
    expect(tex).toContain('Machine learning engineer with three years');
    expect(tex).not.toContain(`${B}item Machine learning engineer`);
  });

  /* Unescaped specials are the classic way a generated .tex fails to compile,
     and the candidate only finds out in Overleaf. */
  it('escapes ampersands', () => {
    expect(tex).toContain(`R${B}&D tooling`);
  });

  it('escapes percent signs, which would otherwise comment out the rest of the line', () => {
    expect(tex).toContain(`30${B}%`);
  });

  it('escapes underscores and braces', () => {
    const t = toLatex('Used snake_case and {braces}');
    expect(t).toContain(`snake${B}_case`);
    expect(t).toContain(`${B}{braces${B}}`);
  });

  it('escapes a literal backslash without breaking the command it becomes', () => {
    const t = toLatex(`path${B}to${B}thing`);
    expect(t).toContain(`${B}textbackslash{}`);
  });

  it('is single column, because multi-column parses badly in an ATS', () => {
    expect(tex).not.toContain('multicol');
    expect(tex).not.toContain(`${B}begin{tabular}`);
  });

  it('handles an empty résumé without producing a broken document', () => {
    const t = toLatex('');
    expect(t).toContain(`${B}begin{document}`);
    expect(t).toContain(`${B}end{document}`);
  });
});
