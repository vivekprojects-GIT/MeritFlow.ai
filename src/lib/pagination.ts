import type { EnrichedCourse } from './course-schema';

/**
 * Page numbering for a course read as a book.
 *
 * One lesson is one page: it keeps the numbering honest (a page number always
 * lands on exactly one screen of reading) and lets the table of contents and
 * the folio at the foot of each lesson come from the same function, so they
 * can never drift apart.
 *
 * Front matter — the title page, syllabus, and contents — is numbered in
 * lowercase roman, exactly as a printed book does, so the body can start at 1.
 */

export type CoursePagination = {
  /** 1-based page number of a lesson, or null when the indices don't exist. */
  pageOf: (moduleIndex: number, lessonIndex: number) => number | null;
  /** First page of a module — the page its opening lesson sits on. */
  chapterStart: (moduleIndex: number) => number | null;
  totalPages: number;
};

export function buildPagination(course: EnrichedCourse): CoursePagination {
  /* pages[m][l] = the page that lesson sits on. */
  const pages: number[][] = [];
  let page = 0;
  for (const mod of course.modules) {
    const row: number[] = [];
    for (let l = 0; l < mod.lessons.length; l += 1) {
      page += 1;
      row.push(page);
    }
    pages.push(row);
  }

  return {
    pageOf: (m, l) => pages[m]?.[l] ?? null,
    chapterStart: (m) => pages[m]?.[0] ?? null,
    totalPages: page,
  };
}

const ROMAN: Array<[number, string]> = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** Lowercase roman numeral, for front-matter folios. */
export function roman(value: number): string {
  let remaining = Math.max(0, Math.floor(value));
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out || 'i';
}
