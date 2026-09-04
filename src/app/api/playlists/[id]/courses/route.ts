import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addCourseToPlaylist } from '@/lib/courses-store';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let courseId = '';
  try {
    const body = (await req.json()) as { courseId?: unknown };
    courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!courseId) return NextResponse.json({ error: 'Course id is required.' }, { status: 400 });
  const ok = await addCourseToPlaylist(user.id, id, courseId);
  if (!ok) return NextResponse.json({ error: 'Playlist or course not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
