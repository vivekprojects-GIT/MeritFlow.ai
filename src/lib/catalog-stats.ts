import { libraryCourses } from './library';

/**
 * Public, verifiable facts about the catalogue.
 *
 * A logged-out visitor has no learner data, so there is nothing honest to say
 * about usage. What we CAN state truthfully is what is actually in the library,
 * and every number here is counted from it at build time — no invented
 * "120k courses generated" or "4.9 star average", which are unfalsifiable and
 * would be untrue today.
 */

export type CatalogStats = {
  courses: number;
  modules: number;
  lessons: number;
  /** Rounded total of the catalogue's own estimated hours. */
  hours: number;
  /** Distinct subject areas, derived from course levels and titles. */
  levels: string[];
};

function computeCatalogStats(): CatalogStats {
  const courses = libraryCourses.map((item) => item.course);
  let modules = 0;
  let lessons = 0;
  let hours = 0;
  const levels = new Set<string>();

  for (const course of courses) {
    modules += course.modules.length;
    lessons += course.modules.reduce((n, mod) => n + mod.lessons.length, 0);
    hours += Number(course.estimatedHours) || 0;
    if (course.level) levels.add(course.level);
  }

  return {
    courses: courses.length,
    modules,
    lessons,
    hours: Math.round(hours),
    levels: [...levels],
  };
}

/** Computed once — the catalogue is static, so this costs nothing per render. */
export const catalogStats: CatalogStats = computeCatalogStats();
