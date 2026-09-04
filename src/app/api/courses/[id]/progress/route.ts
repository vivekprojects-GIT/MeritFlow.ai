import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setLessonCompleted, userOwnsCourse } from '@/lib/courses-store';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  let lessonKey = '';
  let completed = false;
  try {
    const body = (await req.json()) as { lessonKey?: unknown; completed?: unknown };
    lessonKey = typeof body.lessonKey === 'string' ? body.lessonKey : '';
    completed = Boolean(body.completed);
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!lessonKey) return NextResponse.json({ error: 'Missing lessonKey.' }, { status: 400 });
  if (!(await userOwnsCourse(user.id, id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await setLessonCompleted(user.id, id, lessonKey, completed);
  return NextResponse.json({ ok: true });
}
