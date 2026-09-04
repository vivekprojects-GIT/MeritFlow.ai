import { after } from 'next/server';
import { coverLookupEnabled, findCourseCover } from './course-cover';
import { inferCourseCategory, mergeCourseVideos, setCourseCover } from './courses-store';
import { countVideoLookups, enrichCourseVideos } from './video-enrichment';
import { indexCourse, vectorSearchEnabled } from './vector-store';
import { credentialsFor } from './credentials-store';
import type { EnrichedCourse } from './course-schema';

/**
 * Everything that happens to a course after it is written and saved.
 *
 * ## Why this is one function rather than a block in each route
 *
 * There are two ways to make a course — the create flow, and building one from
 * a goal card — and they are supposed to produce the same thing. They did not.
 * The create route ran three finishing passes; the goal route ran none, so a
 * course built from a goal reached the learner with no cover art, no videos and
 * no vector index. Two courses made minutes apart looked like different
 * products depending on which button made them.
 *
 * Copying the block into the second route would have fixed the symptom and
 * left the cause: two copies drift, and the next pass added to one is missing
 * from the other. So both callers now call this.
 *
 * ## Why every pass runs after the response
 *
 * None of them is the course. A cover photo is decoration, an index is a
 * search convenience, and videos are an illustration of prose that already
 * teaches without them. Making the learner wait on any of it would trade the
 * thing they asked for against three things they did not, and letting one fail
 * the request would lose a course that was already written and saved.
 *
 * @returns whether any video lookups were queued, which the caller reports so
 *   the client knows to expect the course to change under it.
 */
export function finishCourse(
  userId: string,
  courseId: string,
  course: EnrichedCourse,
  prompt: string,
): { videosPending: boolean } {
  const videoLookups = countVideoLookups(course);

  /* The user's own SerpAPI key when they saved one, read inside each pass
     rather than up front: these run after the response, and a lookup that
     needs a key should read the key it is about to spend. */
  after(async () => {
    try {
      const { serpApiKey } = await credentialsFor(userId);
      if (!coverLookupEnabled(serpApiKey)) return;

      const cover = await findCourseCover(
        course.title,
        inferCourseCategory(course.title, course.subtitle, prompt),
        serpApiKey,
      );
      if (cover) await setCourseCover(userId, courseId, cover);
    } catch (err) {
      console.error(`[finish-course] cover failed course=${courseId}:`, err);
    }
  });

  if (vectorSearchEnabled()) {
    after(async () => {
      const startedAt = Date.now();
      try {
        const chunks = await indexCourse(courseId, userId, course);
        console.info(
          `[finish-course] vector index course=${courseId} chunks=${chunks ?? 'skipped'} ms=${Date.now() - startedAt}`,
        );
      } catch (err) {
        console.error(`[finish-course] vector index failed course=${courseId}:`, err);
      }
    });
  }

  if (videoLookups > 0) {
    after(async () => {
      const startedAt = Date.now();
      try {
        const { serpApiKey } = await credentialsFor(userId);
        const withVideos = await enrichCourseVideos(course, { serpApiKey });
        await mergeCourseVideos(userId, courseId, withVideos);
        console.info(
          `[finish-course] videos course=${courseId} lookups=${videoLookups} ms=${Date.now() - startedAt}`,
        );
      } catch (err) {
        console.error(`[finish-course] videos failed course=${courseId}:`, err);
      }
    });
  }

  return { videosPending: videoLookups > 0 };
}
