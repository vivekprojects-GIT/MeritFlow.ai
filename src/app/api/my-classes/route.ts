import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listClassesForStudent } from '@/lib/classes-store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const classes = await listClassesForStudent(user.id);
  return NextResponse.json({ classes });
}
