import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { adminOverview, getUniversityForAdmin } from '@/lib/universities-store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const uni = await getUniversityForAdmin(user.id);
  if (!uni) return NextResponse.json({ error: 'Set up your university first.' }, { status: 409 });
  const overview = await adminOverview(uni.id);
  return NextResponse.json(overview);
}
