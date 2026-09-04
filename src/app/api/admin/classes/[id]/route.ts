import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUniversityForAdmin } from '@/lib/universities-store';
import { getClassRosterForUniversity } from '@/lib/classes-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const uni = await getUniversityForAdmin(user.id);
  if (!uni) return NextResponse.json({ error: 'Set up your university first.' }, { status: 409 });

  const { id } = await ctx.params;
  const data = await getClassRosterForUniversity(uni.id, id);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
