import { generateObject } from 'ai';
import { fastModel, hasAiKey } from '../ai';
import { emptyResume, hasContent, resumeSchema, type ResumeDoc } from './resume-schema';

/**
 * Turn an uploaded résumé into structured data.
 *
 * Two passes, in this order:
 *
 *  1. A deterministic reader that recognises the conventions résumés actually
 *     follow — capitalised section headings, bullet markers, "Company | Title
 *     | Dates" lines. Free, instant, and correct on well-formed documents.
 *  2. A model, only when the first pass came back thin. Résumé layouts vary
 *     enough that no set of rules covers them, but paying for a model call on
 *     a document the rules already read correctly is waste.
 *
 * ## Versioning
 *
 * Bump PARSER_VERSION whenever the rules change in a way that would produce a
 * different reading. Documents parsed by an older build are re-read on next
 * load; without that, a fix only ever reaches people who have not imported yet.
 *
 * Nothing is invented in either pass. A field the document does not contain
 * stays empty, because a plausible-looking guess on a résumé is a claim the
 * candidate has to defend.
 */

const HEADINGS: Record<string, 'summary' | 'education' | 'skills' | 'experience' | 'projects'> = {
  summary: 'summary',
  'professional summary': 'summary',
  profile: 'summary',
  objective: 'summary',
  about: 'summary',
  education: 'education',
  skills: 'skills',
  'technical skills': 'skills',
  'core competencies': 'skills',
  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  employment: 'experience',
  'employment history': 'experience',
  projects: 'projects',
  'personal projects': 'projects',
  'selected projects': 'projects',
};

/**
 * Headings the schema has no field for, but résumés carry constantly.
 *
 * Before this list existed they were not merely dropped — an unrecognised
 * heading fell through as *content of the section above it*, so a line reading
 * "CERTIFICATIONS" became an achievement bullet under someone's last job, with
 * the certifications themselves following it.
 *
 * Matched as whole headings rather than by shape. A general "short line in
 * capitals is a heading" rule sounds tempting and immediately misreads a bare
 * capitalised employer — "APPLE" — as the start of a new section, which is the
 * same class of mistake in the other direction.
 */
const EXTRA_HEADINGS = [
  'certifications',
  'certification',
  'licenses',
  'licenses & certifications',
  'licences',
  'awards',
  'awards & honors',
  'honors',
  'honours',
  'achievements',
  'publications',
  'patents',
  'presentations',
  'volunteering',
  'volunteer experience',
  'community involvement',
  'languages',
  'interests',
  'hobbies',
  'activities',
  'extracurricular activities',
  'affiliations',
  'memberships',
  'professional memberships',
  'training',
  'courses',
  'coursework',
  'relevant coursework',
  'references',
  'leadership',
  'accomplishments',
];

/**
 * Bumped whenever the rules change enough to read a document differently.
 *
 * Version 2 added action-verb detection, which stopped every unmarked bullet
 * becoming its own employer. Version 3 made the model the primary reader and
 * folded standalone dates into the entry above them. Version 4 kept sections
 * the schema does not name -- certifications, awards, publications -- which were
 * previously absorbed into whatever section came before them.
 */
export const PARSER_VERSION = 4;

/**
 * How a résumé bullet opens.
 *
 * Achievement lines start with a past-tense verb, near-universally — it is the
 * one convention every résumé guide agrees on. A company name never does, so
 * this separates the two cases that no structural test can tell apart once the
 * list markers have been stripped by a .docx extraction.
 */
const ACTION_VERB =
  /^(analy[sz]ed|applied|architected|assisted|authored|automated|built|collaborated|conducted|configured|contributed|coordinated|created|customi[sz]ed|debugged|defined|delivered|deployed|designed|developed|documented|drove|engineered|enhanced|ensured|established|evaluated|executed|expanded|extracted|facilitated|fine-tuned|generated|handled|identified|implemented|improved|increased|integrated|introduced|led|maintained|managed|migrated|modernised|modernized|monitored|optimi[sz]ed|orchestrated|participated|partnered|performed|planned|prepared|processed|produced|provided|rebuilt|reduced|refactored|refined|researched|resolved|reviewed|revamped|scaled|shipped|simplified|streamlined|supported|tested|trained|transformed|troubleshot|tuned|used|utili[sz]ed|validated|worked|wrote)\b/i;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /https?:\/\/[^\s|]+|(?:www\.)[^\s|]+/gi;

/** Normalised heading text, or '' when the line is not a heading at all. */
function headingKey(line: string): string {
  return line.trim().toLowerCase().replace(/[:•\-–—]+$/, '').trim();
}

function headingFor(line: string): keyof typeof HEADINGS | null {
  const key = headingKey(line);
  return key in HEADINGS ? (key as keyof typeof HEADINGS) : null;
}

/** An extra section heading, in the candidate's own capitalisation, or ''. */
function extraHeadingFor(line: string): string {
  const key = headingKey(line);
  return EXTRA_HEADINGS.includes(key) ? line.trim().replace(/[:•\-–—]+$/, '').trim() : '';
}

/** Rules-based pass. Correct on conventional résumés, silent when unsure. */
export function parseResumeText(text: string): ResumeDoc {
  const doc = emptyResume();
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());

  /* Contact details are scanned across the whole document rather than only the
     header: plenty of résumés put the email in a footer. */
  const whole = lines.join('\n');
  doc.contact.email = whole.match(EMAIL)?.[0] ?? '';
  doc.contact.phone = whole.match(PHONE)?.[0]?.trim() ?? '';

  for (const raw of whole.match(URL_RE) ?? []) {
    const u = raw.toLowerCase();
    if (u.includes('linkedin') && !doc.contact.linkedin) doc.contact.linkedin = raw;
    else if (u.includes('github') && !doc.contact.github) doc.contact.github = raw;
    else if (!doc.contact.website) doc.contact.website = raw;
  }

  /* The first non-empty line is the name; the next is the headline when it is
     not contact details. A résumé that opens with a heading has neither. */
  const head = lines.filter(Boolean).slice(0, 4);
  if (head[0] && !headingFor(head[0]) && !EMAIL.test(head[0])) doc.contact.name = head[0];
  if (head[1] && !headingFor(head[1]) && !EMAIL.test(head[1]) && !PHONE.test(head[1])) {
    doc.contact.headline = head[1];
  }
  const locLine = head.find((l) => /,\s*[A-Z]{2}\b|,\s*[A-Za-z ]+$/.test(l) && !EMAIL.test(l) && l.length < 60);
  if (locLine && locLine !== doc.contact.name && locLine !== doc.contact.headline) {
    doc.contact.location = locLine.split('|')[0].trim();
  }

  /* Group the body by heading.
   *
   * Two buckets: the five sections the schema names, and everything else. An
   * unknown-but-recognised heading closes the section above it rather than
   * being absorbed into it — which is what used to turn "CERTIFICATIONS" into
   * a bullet on somebody's last job. */
  const groups = new Map<string, string[]>();
  const extras = new Map<string, string[]>();
  let current = '';
  let currentExtra = '';

  for (const line of lines) {
    const h = headingFor(line);
    if (h) {
      current = HEADINGS[h];
      currentExtra = '';
      if (!groups.has(current)) groups.set(current, []);
      continue;
    }

    const extra = extraHeadingFor(line);
    if (extra) {
      current = '';
      currentExtra = extra;
      if (!extras.has(extra)) extras.set(extra, []);
      continue;
    }

    if (!line) continue;
    if (currentExtra) extras.get(currentExtra)!.push(line);
    else if (current) groups.get(current)!.push(line);
  }

  /* Kept verbatim, list markers and all. Nothing here is understood well
     enough to restructure, and a certification retyped by a parser is a claim
     the candidate did not write. */
  doc.extras = [...extras.entries()]
    .filter(([, lns]) => lns.length > 0)
    .map(([heading, lns]) => ({ heading, lines: lns }));

  doc.summary = (groups.get('summary') ?? []).join(' ').trim();

  for (const line of groups.get('skills') ?? []) {
    const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (m) doc.skills.push({ label: m[1].trim(), items: m[2].trim() });
    else if (line) doc.skills.push({ label: '', items: line });
  }

  const isBullet = (l: string) => /^[-•*·]\s+/.test(l);
  const strip = (l: string) => l.replace(/^[-•*·]\s+/, '').trim();
  /* "May 2023 - May 2025", "Jan 2025 – Present", "2019-2021". */
  const DATES = /((?:[A-Z][a-z]{2,8}\.?\s+)?\d{4})\s*[-–—to]+\s*((?:[A-Z][a-z]{2,8}\.?\s+)?\d{4}|Present|Current)/i;

  for (const line of groups.get('experience') ?? []) {
    if (isBullet(line)) {
      const last = doc.experience.at(-1);
      if (last) last.bullets.push(strip(line));
      continue;
    }

    /*
     * A line with no bullet marker is not automatically a new job.
     *
     * Text extracted from a .docx routinely loses its list markers, so every
     * achievement arrives as a bare line. Treating each as a new employer
     * produced one empty "Company | Title | Location" row per bullet, which is
     * what a real résumé looked like after import.
     *
     * The strongest signal is the convention résumés already follow: an
     * achievement opens with a past-tense verb, and a company name does not.
     * "Used SQL*Loader for bulk loads" carries no separator and no date, so
     * every structural test misses it while the verb catches it immediately.
     */
    const isAchievement = ACTION_VERB.test(line);
    const looksLikeHeader =
      !isAchievement &&
      (DATES.test(line) ||
        /[|·]|\s[-–—]\s/.test(line) ||
        /\b(inc|llc|ltd|corp|corporation|limited|gmbh|technologies|solutions|systems|labs|bank)\b\.?$/i.test(line) ||
        /* A short line in capitals is a company, not a sentence. */
        (line.length < 45 && line.replace(/[^A-Za-z]/g, '') === line.replace(/[^A-Za-z]/g, '').toUpperCase()));

    if (!looksLikeHeader && doc.experience.length > 0) {
      doc.experience.at(-1)!.bullets.push(line);
      continue;
    }

    const dates = line.match(DATES);
    const parts = line
      .replace(DATES, '')
      .split(/\s*[|·]\s*|\s+[-–—]\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    doc.experience.push({
      company: parts[0] ?? '',
      title: parts[1] ?? '',
      location: parts[2] ?? '',
      start: dates?.[1] ?? '',
      end: dates?.[2] ?? '',
      bullets: [],
    });
  }

  /*
   * Education arrives one field per line as often as one entry per line, and
   * in either order — some templates lead with the degree, some with the
   * school, and nearly all put the graduation date on a row of its own. Read
   * line by line and attach each fragment to the entry it belongs to.
   *
   * The alternative, one entry per line, is what produced a qualification
   * called "05/2025" and another called "/10".
   */
  const BARE_DATE = /^\(?\s*((?:\d{1,2}\/)?\d{4}|[A-Z][a-z]{2,8}\.?\s+\d{4})\s*\)?$/;
  /** "8.14", "GPA: 3.8", "CGPA 8.14/10". */
  const BARE_GPA = /^\d\.\d+$|^(C?GPA)\s*:?\s*[\d.]+(\s*\/\s*\d+)?$/i;
  /** The tail of a GPA that a line break split off its number: "/10". */
  const GPA_SCALE = /^\/\s*\d{1,3}$/;
  const DEGREE = /\b(bachelor|master|b\.?\s?sc?\.?|m\.?\s?sc?\.?|b\.?tech|m\.?tech|mba|ph\.?d|doctorate|associate|diploma|certificate)\b/i;
  /* Prefixes, not whole words: "universit" has to match "University" and
     "Universität", and a trailing \b would reject both. */
  const SCHOOL = /\b(universit|college|institut|school|academy|polytechnic|vidyalaya)/i;

  for (const line of groups.get('education') ?? []) {
    const prev = doc.education.at(-1);

    if (prev && BARE_DATE.test(line)) {
      const when = line.replace(/[()]/g, '').trim();
      if (!prev.end) prev.end = when;
      continue;
    }
    if (prev && GPA_SCALE.test(line)) {
      /* Meaningless without the numerator, so it is dropped when there is
         nothing to attach it to rather than becoming its own qualification. */
      if (prev.gpa && !prev.gpa.includes('/')) prev.gpa += line.replace(/\s/g, '');
      continue;
    }
    if (prev && BARE_GPA.test(line)) {
      const found = line.match(/[\d.]+(?:\s*\/\s*\d+)?/)?.[0];
      if (found && !prev.gpa) prev.gpa = found.replace(/\s/g, '');
      continue;
    }

    const dates = line.match(DATES);
    const gpa = line.match(/C?GPA:?\s*([\d.]+(?:\s*\/\s*\d+)?)/i)?.[1]?.replace(/\s/g, '') ?? '';
    const rest = line.replace(DATES, '').replace(/C?GPA:?\s*[\d.]+(\s*\/\s*\d+)?/i, '');
    /* Colon separates a degree from its field ("Master of Science: Computer
       Science"); a dash or pipe separates a school from its location. */
    const parts = rest
      .split(/\s*[|·:,]\s*|\s+[-–—]\s+/)
      .map((p) => p.trim().replace(/[,|·-]+$/, '').trim())
      .filter(Boolean);
    if (parts.length === 0) continue;

    const isDegree = DEGREE.test(rest);
    const isSchool = !isDegree && SCHOOL.test(rest);

    if (isDegree && prev && !prev.degree) {
      prev.degree = parts[0];
      if (!prev.field) prev.field = parts[1] ?? '';
      if (gpa && !prev.gpa) prev.gpa = gpa;
      if (dates && !prev.start) {
        prev.start = dates[1];
        prev.end = dates[2];
      }
      continue;
    }

    /* A degree-first template leaves the entry above waiting for its school. */
    if (isSchool && prev && !prev.school) {
      prev.school = parts[0];
      if (!prev.location) prev.location = parts.slice(1).join(', ');
      if (gpa && !prev.gpa) prev.gpa = gpa;
      if (dates && !prev.start) {
        prev.start = dates[1];
        prev.end = dates[2];
      }
      continue;
    }

    doc.education.push({
      school: isDegree ? '' : parts[0],
      degree: isDegree ? parts[0] : '',
      field: isDegree ? (parts[1] ?? '') : '',
      location: isDegree ? '' : parts.slice(1).join(', '),
      start: dates?.[1] ?? '',
      end: dates?.[2] ?? '',
      gpa,
    });
  }

  for (const line of groups.get('projects') ?? []) {
    if (isBullet(line)) {
      doc.projects.at(-1)?.bullets.push(strip(line));
      continue;
    }
    const link = line.match(URL_RE)?.[0] ?? '';
    doc.projects.push({
      name: line.replace(URL_RE, '').split(/\s*[|·]\s*/)[0].trim(),
      link,
      start: '',
      end: '',
      bullets: [],
    });
  }

  return doc;
}

/**
 * How well-formed a parse is.
 *
 * Counts entries that could actually appear on a résumé and penalises the
 * wreckage a rules pass produces on an unfamiliar layout: a job with no
 * employer, a qualification with no school, an entry whose name is a date.
 * Comparable between the two passes, which is the whole point — it decides
 * which one the candidate sees.
 */
function quality(doc: ResumeDoc): number {
  let score = 0;

  for (const e of doc.experience) {
    if (!e.company.trim()) score -= 3;
    else score += 2 + (e.title.trim() ? 1 : 0) + (e.start.trim() ? 1 : 0) + Math.min(e.bullets.length, 6);
    /* An employer named after a date or a sentence is a parse failure. */
    if (/^\(?\d/.test(e.company) || e.company.length > 70) score -= 4;
  }

  for (const e of doc.education) {
    /* A degree with no school is a real résumé line; a row with neither is
       wreckage, and so is one named after a date or a GPA denominator. */
    if (!e.school.trim() && !e.degree.trim()) score -= 3;
    else score += 1 + (e.school.trim() ? 1 : 0) + (e.degree.trim() ? 1 : 0);
    if (/^[\d/.\s]+$/.test(e.school.trim() || e.degree.trim())) score -= 4;
  }

  /* Sections kept rather than lost. A parse that preserved the candidate's
     certifications is a better reading than one that silently dropped them. */
  score += Math.min(doc.extras.reduce((n, e) => n + (e.lines.length > 0 ? 2 : 0), 0), 8);
  score += Math.min(doc.skills.filter((s) => s.items.trim()).length, 8);
  if (doc.summary.trim()) score += 2;
  if (doc.contact.name.trim() && doc.contact.name.length < 45) score += 2;

  return score;
}

/**
 * Parse a résumé, preferring whichever pass reads it better.
 *
 * The model leads where one is available. Résumé layouts vary far more than a
 * rule set can follow — dates on their own line, a degree above its school,
 * bullets with no markers — and an earlier version only reached for the model
 * when the rules produced *nothing*, so a confidently wrong rules parse was
 * never reconsidered. It shipped an education section listing "05/2025" as a
 * qualification.
 *
 * Both passes run and the better-formed result wins, measured rather than
 * assumed. The model is instructed to copy, never compose: a résumé is a
 * factual document, and a line the candidate never wrote is a claim they did
 * not make.
 */
export async function parseResume(text: string): Promise<ResumeDoc> {
  const rules = parseResumeText(text);
  if (!hasAiKey() || text.trim().length < 40) return rules;

  try {
    const { object } = await generateObject({
      model: fastModel(),
      schema: resumeSchema,
      maxOutputTokens: 6000,
      temperature: 0,
      system: [
        'You convert a résumé into structured data.',
        'Copy the text as written. Do not summarise, improve, reword, or infer anything the document does not state.',
        'Leave a field empty rather than guessing it. Keep every bullet point verbatim.',
        'Dates stay in the format the résumé used; a date belongs to the entry it describes, never as an entry of its own.',
        'An achievement line belongs in the bullets of the job above it, not as a new employer.',
        'Any section that does not fit the named fields -- certifications, awards, publications, languages -- goes in extras, with its heading and its lines copied exactly. Never drop a section.',
      ].join(' '),
      prompt: text.slice(0, 20_000),
    });

    const parsed = resumeSchema.parse(object);
    if (!hasContent(parsed)) return rules;
    return quality(parsed) >= quality(rules) ? parsed : rules;
  } catch {
    return rules;
  }
}
