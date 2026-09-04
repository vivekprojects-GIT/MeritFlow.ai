import type { Course, EnrichedCourse, EnrichedModule, VideoInfo } from './course-schema';
import { mapWithConcurrency } from './async';
import { findBestVideo, type ProviderKeys } from './youtube';

type Lookup = { m: number; l: number; query: string };

/** Convert generated course text into the reader/editor shape without blocking on videos. */
export function courseWithoutVideos(course: Course): EnrichedCourse {
  const modules: EnrichedModule[] = course.modules.map((mod) => ({
    ...mod,
    lessons: mod.lessons.map((lesson) => ({ ...lesson, video: null })),
  }));
  return { ...course, modules };
}

export function countVideoLookups(course: EnrichedCourse): number {
  return collectLookups(course).length;
}

/** Find and attach videos to a copy of the course. Slow external calls belong here. */
export async function enrichCourseVideos(
  course: EnrichedCourse,
  keys: ProviderKeys = {},
): Promise<EnrichedCourse> {
  const lookups = collectLookups(course);
  if (lookups.length === 0) return course;

  const found = await mapWithConcurrency(lookups, videoConcurrency(), (item) => findBestVideo(item.query, keys));
  const videoByCell = new Map<string, VideoInfo | null>();
  lookups.forEach((item, i) => videoByCell.set(`${item.m}:${item.l}`, found[i]));

  return {
    ...course,
    modules: course.modules.map((mod, m) => ({
      ...mod,
      lessons: mod.lessons.map((lesson, l) => ({
        ...lesson,
        video: videoByCell.get(`${m}:${l}`) ?? lesson.video ?? null,
      })),
    })),
  };
}

function collectLookups(course: EnrichedCourse): Lookup[] {
  const lookups: Lookup[] = [];
  course.modules.forEach((mod, m) =>
    mod.lessons.forEach((lesson, l) => {
      if (lesson.needsVideo && lesson.videoQuery.trim() && !lesson.video) {
        lookups.push({ m, l, query: lesson.videoQuery });
      }
    }),
  );
  return lookups;
}

function videoConcurrency(): number {
  const configured = Number(process.env.VIDEO_SEARCH_CONCURRENCY ?? 8);
  if (!Number.isFinite(configured)) return 8;
  return Math.max(1, Math.min(12, Math.floor(configured)));
}
