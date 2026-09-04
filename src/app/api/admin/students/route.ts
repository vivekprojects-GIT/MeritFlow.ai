import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUniversityForAdmin } from '@/lib/universities-store';
import { universityStudents } from '@/lib/student-analytics';
import { audit } from '@/lib/audit-log';

export const runtime = 'nodejs';

/** Every learner in the admin's university, with progress and a status flag. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  /* Scoped to the university this admin owns — never a global student list. */
  const university = await getUniversityForAdmin(user.id);
  if (!university) return NextResponse.json({ error: 'Set up your university first.' }, { status: 409 });

  const data = await universityStudents(university.id);

  /* This endpoint returns named, individual student records. Log the access
     before returning it. */
  await audit(user.id, 'read:student-records', university.slug, `${data.students.length} learner records`);

  return NextResponse.json(data);
}
