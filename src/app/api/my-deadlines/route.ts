import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listUpcomingForStudent } from '@/lib/assignments-store';

export const runtime = 'nodejs';

/** Due-dated assignments across all of the current student's classes. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const deadlines = await listUpcomingForStudent(user.id);
  return NextResponse.json({ deadlines });
}
