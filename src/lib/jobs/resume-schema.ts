import { z } from 'zod';

/**
 * A résumé as structured data.
 *
 * The first version stored a résumé as one blob of text, which made the
 * editor a textarea and the preview the same text reflowed. Everything a
 * résumé editor is actually for — reordering sections, hiding a phone number,
 * fitting to one page, tailoring a single bullet — needs the parts addressable.
 *
 * Every field is optional and every list can be empty. Résumés genuinely vary:
 * a new graduate has no experience, a career changer has no relevant projects,
 * and a schema that insists on either produces empty headings on the page.
 */

export const contactSchema = z.object({
  name: z.string().default(''),
  /** The line under the name: "Senior Data Engineer", not a summary. */
  headline: z.string().default(''),
  location: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  website: z.string().default(''),
  linkedin: z.string().default(''),
  github: z.string().default(''),
});

export const experienceSchema = z.object({
  company: z.string().default(''),
  title: z.string().default(''),
  location: z.string().default(''),
  /** Free text, because résumés write dates every possible way. */
  start: z.string().default(''),
  end: z.string().default(''),
  bullets: z.array(z.string()).default([]),
});

export const educationSchema = z.object({
  school: z.string().default(''),
  degree: z.string().default(''),
  field: z.string().default(''),
  location: z.string().default(''),
  start: z.string().default(''),
  end: z.string().default(''),
  gpa: z.string().default(''),
});

export const projectSchema = z.object({
  name: z.string().default(''),
  link: z.string().default(''),
  start: z.string().default(''),
  end: z.string().default(''),
  bullets: z.array(z.string()).default([]),
});

/** "Programming Languages: Python, SQL" — the grouped form résumés use. */
export const skillGroupSchema = z.object({
  label: z.string().default(''),
  items: z.string().default(''),
});

export const SECTION_IDS = ['summary', 'education', 'skills', 'experience', 'projects'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/**
 * A section this schema has no field for.
 *
 * Certifications, awards, publications, licences, volunteering, languages,
 * patents — real résumés carry them constantly and the five named sections
 * above cover none of them. Without somewhere to put them the import simply
 * lost them, and an unrecognised heading was worse than dropped: it fell
 * through as a bullet of whatever section came before it, so "CERTIFICATIONS"
 * appeared as an achievement under someone's last job.
 *
 * Kept as a heading and its lines, edited exactly like everything else. The
 * point is that what a candidate uploaded is what they see.
 */
export const extraSectionSchema = z.object({
  heading: z.string().default(''),
  lines: z.array(z.string()).default([]),
});

export const resumeSchema = z.object({
  /* A lazy default rather than a literal: Zod 4 wants the whole object for a
     literal default, and restating eight empty strings here would be a second
     place for the shape to drift out of step with the schema above. */
  contact: contactSchema.default(() => contactSchema.parse({})),
  summary: z.string().default(''),
  education: z.array(educationSchema).default([]),
  skills: z.array(skillGroupSchema).default([]),
  experience: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  /**
   * Everything the five named sections do not cover, in the order it appeared.
   *
   * Rendered after them. Reordering happens within this list rather than
   * through `order`, which is typed to the fixed section ids — a candidate who
   * wants Certifications above Projects moves it there, and nothing about the
   * five known sections has to become stringly-typed to allow it.
   */
  extras: z.array(extraSectionSchema).default([]),
  /** Section order. Stored so a candidate can lead with what is strongest. */
  order: z.array(z.enum(SECTION_IDS)).default([...SECTION_IDS]),
  /** Contact fields to leave off the page — the eye toggles. */
  hidden: z.array(z.string()).default([]),
  /** Justified reads denser; left is safer for an ATS text extraction. */
  align: z.enum(['left', 'justified']).default('left'),
  /* Shrinks leading and margins until the document fits a single page.
     A preference rather than a guarantee: past a point the only honest
     answer is that there is too much text. */
  fitToOnePage: z.boolean().default(false),
});

export type Contact = z.infer<typeof contactSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Project = z.infer<typeof projectSchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type ResumeDoc = z.infer<typeof resumeSchema>;

export const SECTION_LABEL: Record<SectionId, string> = {
  summary: 'Professional summary',
  education: 'Education',
  skills: 'Skills',
  experience: 'Work experience',
  projects: 'Projects',
};

export function emptyResume(): ResumeDoc {
  return resumeSchema.parse({});
}

/**
 * Is there enough here to render a page?
 *
 * Used to decide whether to fall back to the raw text. A parse that produced
 * only a name is worse than the original document, and silently showing an
 * almost-empty résumé would look like data loss.
 */
export function hasContent(r: ResumeDoc): boolean {
  return Boolean(
    r.summary.trim() ||
      r.experience.length > 0 ||
      r.education.length > 0 ||
      r.skills.length > 0 ||
      r.projects.length > 0,
  );
}

/** Flatten to plain text — for matching, tailoring and the evidence check. */
export function resumeToText(r: ResumeDoc): string {
  const out: string[] = [];
  const c = r.contact;

  if (c.name) out.push(c.name);
  if (c.headline) out.push(c.headline);
  const line = [c.location, c.phone, c.email, c.linkedin, c.github, c.website].filter(Boolean).join(' | ');
  if (line) out.push(line);

  for (const id of r.order) {
    if (id === 'summary' && r.summary.trim()) {
      out.push('', 'PROFESSIONAL SUMMARY', r.summary.trim());
    }
    if (id === 'education' && r.education.length > 0) {
      out.push('', 'EDUCATION');
      for (const e of r.education) {
        out.push([e.school, e.location, [e.start, e.end].filter(Boolean).join(' - ')].filter(Boolean).join(' | '));
        out.push([[e.degree, e.field].filter(Boolean).join(', '), e.gpa && `GPA ${e.gpa}`].filter(Boolean).join(' | '));
      }
    }
    if (id === 'skills' && r.skills.length > 0) {
      out.push('', 'SKILLS');
      for (const s of r.skills) out.push(`${s.label}: ${s.items}`);
    }
    if (id === 'experience' && r.experience.length > 0) {
      out.push('', 'WORK EXPERIENCE');
      for (const e of r.experience) {
        out.push(
          [e.company, e.title, e.location, [e.start, e.end].filter(Boolean).join(' - ')].filter(Boolean).join(' | '),
        );
        for (const b of e.bullets) out.push(`- ${b}`);
      }
    }
    if (id === 'projects' && r.projects.length > 0) {
      out.push('', 'PROJECTS');
      for (const p of r.projects) {
        out.push([p.name, p.link, [p.start, p.end].filter(Boolean).join(' - ')].filter(Boolean).join(' | '));
        for (const b of p.bullets) out.push(`- ${b}`);
      }
    }
  }

  /* Extras last, and always included. This text is what matching, tailoring
     and the evidence check read, so a certification the candidate holds has to
     reach them — leaving it out of the flattened form would mean the editor
     shows it and every downstream decision pretends it does not exist. */
  for (const extra of r.extras) {
    const lines = extra.lines.filter((l) => l.trim());
    if (!extra.heading.trim() && lines.length === 0) continue;
    out.push('', extra.heading.trim().toUpperCase(), ...lines);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
