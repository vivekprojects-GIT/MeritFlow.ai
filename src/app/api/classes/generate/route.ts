import { after, NextResponse } from 'next/server';
import { generateCourse } from '@/lib/generate-course';
import { getCurrentUser } from '@/lib/auth';
import { createClass, mergeClassCourseVideos } from '@/lib/classes-store';
import { countVideoLookups, courseWithoutVideos, enrichCourseVideos } from '@/lib/video-enrichment';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Generate a course from a prompt or document and publish it as a class.
 * Text generation blocks the response; slower video enrichment runs after.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let mode: 'prompt' | 'document' = 'prompt';
  let prompt = '';
  let documentText = '';
  let title = '';
  let language = '';
  let level: 'Beginner' | 'Intermediate' | 'Advanced' | undefined;
  try {
    const body = (await req.json()) as {
      mode?: unknown;
      prompt?: unknown;
      documentText?: unknown;
      title?: unknown;
      language?: unknown;
      level?: unknown;
    };
    mode = body.mode === 'document' ? 'document' : 'prompt';
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    documentText = typeof body.documentText === 'string' ? body.documentText.trim() : '';
    title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    language = typeof body.language === 'string' ? body.language.trim().slice(0, 80) : '';
    if (body.level === 'Beginner' || body.level === 'Intermediate' || body.level === 'Advanced') level = body.level;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (mode === 'document') {
    if (documentText.length < 40) {
      return NextResponse.json(
        { error: 'Add the document text (upload a .txt/.md file or paste at least a paragraph of content).' },
        { status: 400 },
      );
    }
  } else if (!prompt) {
    return NextResponse.json({ error: 'Describe the course you want to create.' }, { status: 400 });
  }

  try {
    const startedAt = Date.now();
    const topic = mode === 'document' ? title : prompt;
    const course = await generateCourse(topic, {
      level,
      language,
      sourceText: mode === 'document' ? documentText : undefined,
    });
    const textReadyMs = Date.now() - startedAt;
    const enriched = courseWithoutVideos(course);
    const { id, joinCode, expiresAt } = await createClass(user.id, enriched);
    const videosPending = countVideoLookups(enriched);

    if (videosPending > 0) {
      after(async () => {
        const videoStartedAt = Date.now();
        try {
          const withVideos = await enrichCourseVideos(enriched);
          await mergeClassCourseVideos(user.id, id, withVideos);
          console.info(
            `[class-generate] background videos class=${id} lookups=${videosPending} ms=${Date.now() - videoStartedAt}`,
          );
        } catch (err) {
          console.error(`[class-generate] background videos failed class=${id}:`, err);
        }
      });
    }

    console.info(
      `[class-generate] textReady ms=${textReadyMs} class=${id} modules=${course.modules.length} videosPending=${videosPending}`,
    );
    return NextResponse.json({ id, joinCode, expiresAt, title: enriched.title, videosPending: videosPending > 0 });
  } catch (err) {
    console.error('Class generation failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Generation failed: ${message}` }, { status: 500 });
  }
}
