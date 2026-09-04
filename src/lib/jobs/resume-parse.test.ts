import { describe, it, expect } from 'vitest';
import { parseResumeText } from './resume-parse';
import { resumeToText } from './resume-schema';

/**
 * The rules pass, against the shape a real résumé arrives in — including the
 * one that exposed the bug: a name and headline that a .docx extraction ran
 * together onto one line.
 */
const RESUME = `SAI VIVEK KATKURI
PL/SQL Developer | ETL Developer | Data Engineer
Plano, TX | +1 (469) 454-8320 | katkurisaivivekk@gmail.com
https://www.linkedin.com/in/sai-vivek-katkuri-36698b203/

PROFESSIONAL SUMMARY
Senior Oracle PL/SQL Developer and Data Engineer with 7 years of experience building
and modernizing enterprise data platforms in banking, retail and telecom.

EDUCATION
Southern Arkansas University
Master of Science, Data Science | May 2023 - May 2025 | GPA: 3.8

SKILLS
Programming Languages: Python, SQL, R, TypeScript
Databases: PostgreSQL, MongoDB, Redis

WORK EXPERIENCE
Webflow | AI Engineer | Remote | Jan 2025 - Present
- Designed and launched AI-driven features across 5+ Webflow modules.
- Architected retrieval augmented generation pipelines using Pinecone.

Accenture | Machine Learning Engineer | Jan 2021 - Jul 2023
- Applied LoRA techniques to optimize parameter efficiency during fine-tuning.

PROJECTS
Knowledge Graph Explorer https://github.com/vivek/kg
- Built a Neo4j backed explorer for entity relationships.
`;

describe('parseResumeText', () => {
  const doc = parseResumeText(RESUME);

  it('reads the name and headline as separate lines', () => {
    /* The visible bug was these two concatenated into one string. */
    expect(doc.contact.name).toBe('SAI VIVEK KATKURI');
    expect(doc.contact.headline).toContain('PL/SQL Developer');
    expect(doc.contact.name).not.toContain('PL/SQL');
  });

  it('finds contact details wherever they sit', () => {
    expect(doc.contact.email).toBe('katkurisaivivekk@gmail.com');
    expect(doc.contact.phone).toContain('469');
    expect(doc.contact.linkedin).toContain('linkedin.com');
  });

  it('reads the summary', () => {
    expect(doc.summary).toContain('Senior Oracle PL/SQL Developer');
  });

  it('reads skills as labelled groups', () => {
    const langs = doc.skills.find((s) => s.label === 'Programming Languages');
    expect(langs?.items).toContain('Python');
    expect(doc.skills.find((s) => s.label === 'Databases')?.items).toContain('PostgreSQL');
  });

  it('reads each job with its dates', () => {
    expect(doc.experience).toHaveLength(2);
    expect(doc.experience[0].company).toBe('Webflow');
    expect(doc.experience[0].title).toBe('AI Engineer');
    expect(doc.experience[0].start).toBe('Jan 2025');
    expect(doc.experience[0].end).toMatch(/Present/i);
  });

  it('attaches bullets to the job above them', () => {
    expect(doc.experience[0].bullets).toHaveLength(2);
    expect(doc.experience[0].bullets[0]).toContain('AI-driven features');
    expect(doc.experience[1].bullets[0]).toContain('LoRA');
  });

  it('folds a degree line into the school above it', () => {
    /* Two lines, one entry — otherwise the résumé shows a school with no
       degree followed by a degree with no school. */
    expect(doc.education).toHaveLength(1);
    expect(doc.education[0].school).toBe('Southern Arkansas University');
    expect(doc.education[0].degree).toContain('Master of Science');
    expect(doc.education[0].gpa).toBe('3.8');
  });

  it('reads projects with their links', () => {
    expect(doc.projects[0].name).toContain('Knowledge Graph Explorer');
    expect(doc.projects[0].link).toContain('github.com');
    expect(doc.projects[0].bullets[0]).toContain('Neo4j');
  });

  it('does not invent anything the document lacks', () => {
    const sparse = parseResumeText('Jane Doe\njane@example.com');
    expect(sparse.summary).toBe('');
    expect(sparse.experience).toHaveLength(0);
    expect(sparse.education).toHaveLength(0);
  });

  it('round-trips back to text without losing the content', () => {
    const text = resumeToText(doc);
    expect(text).toContain('Webflow');
    expect(text).toContain('Python');
    expect(text).toContain('Southern Arkansas University');
    expect(text).toContain('AI-driven features');
  });
});

/**
 * Text that lost its list markers during extraction — the shape a .docx
 * arrives in, and the one that produced an empty employer row per bullet.
 */
const UNMARKED = `WORK EXPERIENCE
Acme Corp | Senior Data Engineer | Remote | Jan 2022 - Present
Migrated legacy Sybase IQ stored procedures to Oracle 19c, ensuring the rewritten packages matched the original logic without functional gaps.
Tuned batch queries that were taking several hours, using explain plans and SQL trace to bring them back inside acceptable SLAs.
Globex | Data Engineer | Austin, TX | Jun 2019 - Dec 2021
Built reconciliation reporting across upstream feeds and downstream outputs.
`;

describe('parseResumeText with unmarked bullets', () => {
  const doc = parseResumeText(UNMARKED);

  it('finds only the real employers', () => {
    expect(doc.experience).toHaveLength(2);
    expect(doc.experience.map((e) => e.company)).toEqual(['Acme Corp', 'Globex']);
  });

  it('attaches unmarked lines as bullets rather than new jobs', () => {
    expect(doc.experience[0].bullets).toHaveLength(2);
    expect(doc.experience[0].bullets[0]).toContain('Sybase IQ');
    expect(doc.experience[1].bullets).toHaveLength(1);
  });

  it('never produces an entry with no company', () => {
    /* The visible symptom was a run of empty "| Title | Location" rows. */
    expect(doc.experience.every((e) => e.company.trim().length > 0)).toBe(true);
  });
});

/**
 * The shape that reached the user: unmarked bullets with no separators, no
 * dates, and a bare company name between them.
 */
const REAL_WORLD = `WORK EXPERIENCE
Fifth Third Bank | Senior PL/SQL Developer | Jan 2022 - Present
Used SQL*Loader and external tables for high-volume data loading.
Prepared clean and structured datasets for downstream reporting.
Worked with cloud teams to migrate batch jobs.
APPLE, INDIA.
Developed PL/SQL programs for order management.
Participated in requirement gathering sessions with business users.
Built ETL processes using SSIS packages.
`;

describe('parseResumeText on unmarked bullets between bare company names', () => {
  const doc = parseResumeText(REAL_WORLD);

  it('does not turn each achievement into an employer', () => {
    /* The reported symptom: one "Company | Title | Location" row per bullet. */
    expect(doc.experience).toHaveLength(2);
  });

  it('keeps the real employers', () => {
    expect(doc.experience[0].company).toBe('Fifth Third Bank');
    expect(doc.experience[1].company).toBe('APPLE, INDIA.');
  });

  it('recognises a bare capitalised company name as a new employer', () => {
    expect(doc.experience[1].bullets).toHaveLength(3);
    expect(doc.experience[1].bullets[0]).toContain('PL/SQL programs');
  });

  it('files achievements under the employer above them', () => {
    expect(doc.experience[0].bullets).toHaveLength(3);
    expect(doc.experience[0].bullets[0]).toContain('SQL*Loader');
  });

  it('never leaves an employer row with an achievement as its name', () => {
    for (const e of doc.experience) {
      expect(e.company).not.toMatch(/^(Used|Prepared|Worked|Developed|Participated|Built)\b/i);
    }
  });
});

/**
 * A degree-first template with one field per line — the layout that produced
 * an education section listing "05/2025" as a qualification and "/10" as
 * another, alongside schools named after degrees.
 */
const DEGREE_FIRST = `EDUCATION
Master of Science: Computer Science
05/2025
Sacred Heart University - Fairfield, CT
Bachelor of Science: B.S.C (statistics)
05/2018
Osmania University - Hyderabad, India
GPA: 8.14
/10
`;

describe('parseResumeText on a degree-first education section', () => {
  const doc = parseResumeText(DEGREE_FIRST);

  it('reads two qualifications, not five', () => {
    expect(doc.education).toHaveLength(2);
  });

  it('pairs each degree with the school below it', () => {
    expect(doc.education[0].degree).toBe('Master of Science');
    expect(doc.education[0].field).toBe('Computer Science');
    expect(doc.education[0].school).toBe('Sacred Heart University');
    expect(doc.education[1].degree).toBe('Bachelor of Science');
    expect(doc.education[1].school).toBe('Osmania University');
  });

  it('keeps the location out of the school name', () => {
    expect(doc.education[0].school).not.toContain('Fairfield');
    expect(doc.education[0].location).toBe('Fairfield, CT');
  });

  it('attaches a standalone date to the entry above it', () => {
    expect(doc.education[0].end).toBe('05/2025');
    expect(doc.education[1].end).toBe('05/2018');
  });

  it('rejoins a GPA that a line break split from its scale', () => {
    expect(doc.education[1].gpa).toBe('8.14/10');
  });

  it('never names a qualification after a date or a number', () => {
    for (const e of doc.education) {
      expect(e.school).not.toMatch(/^[\d/.]+$/);
      expect(e.degree).not.toMatch(/^[\d/.]+$/);
    }
  });
});

/**
 * A resume carrying sections the schema does not name.
 *
 * The reported symptom was content simply going missing on import. What
 * actually happened was worse: an unrecognised heading was absorbed into the
 * section above it, so "CERTIFICATIONS" arrived as an achievement bullet on the
 * candidate's most recent job, with the certificates listed under it.
 */
const WITH_EXTRAS = `SAI VIVEK KATKURI

WORK EXPERIENCE
Fifth Third Bank | Senior PL/SQL Developer | Jan 2022 - Present
- Tuned batch queries back inside their SLAs.

CERTIFICATIONS
AWS Certified Solutions Architect - Associate (2024)
Oracle Database SQL Certified Associate

AWARDS
Employee of the Quarter, Fifth Third Bank, 2023

LANGUAGES
English (native), Telugu (native), Hindi (professional)
`;

describe('parseResumeText keeps sections the schema does not name', () => {
  const doc = parseResumeText(WITH_EXTRAS);

  it('keeps every extra section, in the order they appeared', () => {
    expect(doc.extras.map((e) => e.heading)).toEqual(['CERTIFICATIONS', 'AWARDS', 'LANGUAGES']);
  });

  it('keeps the lines under each one verbatim', () => {
    expect(doc.extras[0].lines).toEqual([
      'AWS Certified Solutions Architect - Associate (2024)',
      'Oracle Database SQL Certified Associate',
    ]);
    expect(doc.extras[2].lines[0]).toContain('Telugu');
  });

  it('does not leak the heading into the job above it', () => {
    /* The actual bug: one employer, one bullet -- not a bullet reading
       "CERTIFICATIONS" followed by the certificates. */
    expect(doc.experience).toHaveLength(1);
    expect(doc.experience[0].bullets).toHaveLength(1);
    expect(doc.experience[0].bullets.join(' ')).not.toMatch(/CERTIFICATIONS|AWS Certified/);
  });

  it('carries them into the flattened text every other feature reads', () => {
    /* Matching, tailoring and the evidence check all read this string. A
       certification the editor shows but the text omits is one the rest of the
       product behaves as though the candidate does not hold. */
    const text = resumeToText(doc);
    expect(text).toContain('CERTIFICATIONS');
    expect(text).toContain('AWS Certified Solutions Architect');
    expect(text).toContain('Employee of the Quarter');
  });
});
