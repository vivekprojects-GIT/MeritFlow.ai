import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canAccessClass, createTopic, listTopics } from '@/lib/discussions-store';

export const runtime = 'nodejs';

/** Topics in a class. Members only — instructor or enrolled student. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await canAccessClass(user.id, id))) {
    return NextResponse.json({ error: 'You are not in this class.' }, { status: 403 });
  }
  return NextResponse.json({ topics: await listTopics(id, user.id) });
}

/** Start a topic. Students may too — a discussion board nobody can post to is a notice board. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  let body: { title?: unknown; body?: unknown; lessonKey?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const topicId = await createTopic(
    user.id,
    id,
    String(body.title ?? ''),
    String(body.body ?? ''),
    typeof body.lessonKey === 'string' ? body.lessonKey : null,
  );
  if (!topicId) {
    return NextResponse.json({ error: 'Could not post — check you are in this class and wrote a title and message.' }, { status: 403 });
  }
  return NextResponse.json({ id: topicId });
}
