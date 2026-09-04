import { sampleCourses } from './sample-courses';
import { demoCourses } from './demo-courses';
import { extraCourses } from './extra-courses';
import type { EnrichedCourse } from './course-schema';

/** Pricing (USD). Adjust freely — UI reads these. */
export const SINGLE_COURSE_PRICE = 29;
export const PRO_MONTHLY = 19;
export const PRO_YEARLY = 149;

export type LibraryItem = { id: string; price: number; course: EnrichedCourse };

/** The full purchasable catalog: flagship samples + demo library + extra courses. */
const catalog: EnrichedCourse[] = [...sampleCourses, ...demoCourses, ...extraCourses];

/** Stable id + price per catalog slot (order matches `catalog`). */
const META: { id: string; price: number }[] = [
  { id: 'lib-python', price: 29 },
  { id: 'lib-uiux', price: 29 },
  { id: 'lib-finance', price: 24 },
  { id: 'lib-speaking', price: 19 },
  { id: 'lib-ml', price: 39 },
  { id: 'lib-productivity', price: 19 },
  { id: 'lib-photography', price: 19 },
  { id: 'lib-negotiation', price: 24 },
  { id: 'lib-webdev', price: 29 },
];

/** Pre-made, purchasable courses. Browsable + previewable by anyone. */
export const libraryCourses: LibraryItem[] = catalog.map((course, i) => ({
  id: META[i]?.id ?? `lib-${i}`,
  price: META[i]?.price ?? SINGLE_COURSE_PRICE,
  course,
}));

export function getLibraryItem(id: string): LibraryItem | null {
  return libraryCourses.find((l) => l.id === id) ?? null;
}

export function isLibraryId(id: string): boolean {
  return libraryCourses.some((l) => l.id === id);
}
