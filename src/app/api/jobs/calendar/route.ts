import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { createInterview, deleteInterview, listInterviews, toIcs, updateInterview } from '@/lib/jobs/calendar';
import { listArchive } from '@/lib/jobs/archive';
import { ensureCalendarToken } from '@/lib/job-settings';

export const runtime = 'nodejs';

/** Interviews, the application archive, and an .ics export of the diary. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const interviews = await listInterviews(user.id);

  if (new URL(req.url).searchParams.get('format') === 'ics') {
    return new Response(toIcs(interviews), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="meritflow-interviews.ics"',
      },
    });
  }

  return NextResponse.json({
    interviews,
    archive: await listArchive(user.id, 100),
    /* The subscribe URL, so the calendar stays live instead of being a
       one-time download the candidate has to repeat after every change. */
    feedPath: `/api/jobs/calendar/feed/${await ensureCalendarToken(user.id)}`,
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const action = String(body.action ?? 'create');

  if (action === 'rotate-feed') {
    /* Revokes every existing subscription, which is the only remedy for a
       feed URL that has been shared by accident. */
    return NextResponse.json({ feedPath: `/api/jobs/calendar/feed/${await ensureCalendarToken(user.id, true)}` });
  }

  if (action === 'delete') {
    const ok = await deleteInterview(user.id, String(body.id ?? ''));
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const patch = {
    company: typeof body.company === 'string' ? body.company : undefined,
    title: typeof body.title === 'string' ? body.title : undefined,
    kind: typeof body.kind === 'string' ? (body.kind as never) : undefined,
    startsAt: body.startsAt === null ? null : typeof body.startsAt === 'number' ? body.startsAt : undefined,
    durationMin: typeof body.durationMin === 'number' ? body.durationMin : undefined,
    location: typeof body.location === 'string' ? body.location : undefined,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    confirmed: typeof body.confirmed === 'boolean' ? body.confirmed : undefined,
  };

  if (action === 'update') {
    const updated = await updateInterview(user.id, String(body.id ?? ''), patch);
    return updated ? NextResponse.json({ interview: updated }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  if (!patch.company) return NextResponse.json({ error: 'A company is required.' }, { status: 400 });
  return NextResponse.json({ interview: await createInterview(user.id, { ...patch, company: patch.company }) });
}
