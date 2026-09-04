import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEnrolledClass } from '@/lib/classes-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const data = await getEnrolledClass(user.id, id);
  if (!data) return NextResponse.json({ error: 'Not enrolled.' }, { status: 404 });
  return NextResponse.json(data);
}
