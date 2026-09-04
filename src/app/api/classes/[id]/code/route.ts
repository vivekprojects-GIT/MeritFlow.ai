import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { regenerateJoinCode } from '@/lib/classes-store';

export const runtime = 'nodejs';

/** Generate a fresh, short-lived join code for a class (instructor-owned). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const result = await regenerateJoinCode(user.id, id);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result); // { joinCode, expiresAt }
}
