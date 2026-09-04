import { NextResponse } from 'next/server';
import { universityPulse } from '@/lib/analytics';
import { getCurrentUser } from '@/lib/auth';
import { getUniversityForAdmin } from '@/lib/universities-store';

export const runtime = 'nodejs';

/** University-wide activity. Admin of that university only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* Returns only for the admin who owns the university — the ownership check. */
  const university = await getUniversityForAdmin(user.id);
  if (!university) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(await universityPulse(university.id));
}
