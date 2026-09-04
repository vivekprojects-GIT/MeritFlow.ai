import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setCourseFavorite } from '@/lib/courses-store';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let favorite = true;
  try {
    const body = (await req.json()) as { favorite?: unknown };
    favorite = typeof body.favorite === 'boolean' ? body.favorite : true;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const ok = await setCourseFavorite(user.id, id, favorite);
  if (!ok) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  return NextResponse.json({ ok: true, favorite });
}
