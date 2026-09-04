import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listCourses } from '@/lib/courses-store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courses = await listCourses(user.id);
  return NextResponse.json({ courses });
}
