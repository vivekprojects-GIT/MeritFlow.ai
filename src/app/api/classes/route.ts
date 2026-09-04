import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createClass, listClassesForInstructor } from '@/lib/classes-store';
import { getLibraryItem } from '@/lib/library';
import { makeBlankCourse, type EnrichedCourse } from '@/lib/course-schema';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const classes = await listClassesForInstructor(user.id);
  return NextResponse.json({ classes });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let libraryId = '';
  let blank = false;
  let course: EnrichedCourse | null = null;
  try {
    const body = (await req.json()) as { libraryId?: unknown; course?: unknown; blank?: unknown };
    libraryId = typeof body.libraryId === 'string' ? body.libraryId : '';
    blank = body.blank === true;
    if (body.course && typeof body.course === 'object') course = body.course as EnrichedCourse;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (libraryId) {
    const item = getLibraryItem(libraryId);
    if (!item) return NextResponse.json({ error: 'Unknown course.' }, { status: 404 });
    course = item.course;
  } else if (blank && !course) {
    // Start an empty course the instructor will fill in with the editor.
    course = makeBlankCourse();
  }
  if (!course || !Array.isArray(course.modules) || course.modules.length === 0) {
    return NextResponse.json({ error: 'A valid course is required.' }, { status: 400 });
  }

  const { id, joinCode, expiresAt } = await createClass(user.id, course);
  return NextResponse.json({ id, joinCode, expiresAt });
}
