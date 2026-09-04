import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUniversityForAdmin } from '@/lib/universities-store';
import { cohortComparison } from '@/lib/pacing';
import { recentAudit } from '@/lib/audit-log';

export const runtime = 'nodejs';

/** Term-over-term outcomes, plus this admin's own access trail. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const university = await getUniversityForAdmin(user.id);
  if (!university) return NextResponse.json({ error: 'Set up your university first.' }, { status: 409 });

  try {
    const [cohorts, trail] = await Promise.all([cohortComparison(university.id), recentAudit(user.id, 50)]);
    return NextResponse.json({ cohorts, trail });
  } catch (err) {
    /* Logged for the operator, generic for the client: a database message on
       the wire tells an attacker the schema. */
    console.error('[admin/cohorts]', err);
    return NextResponse.json({ error: 'Could not load cohort data.' }, { status: 500 });
  }
}
