import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { issueCertificate } from '@/lib/certificates';
import { PASS_THRESHOLD } from '@/lib/course-schema';

export const runtime = 'nodejs';

type Body = {
  courseId?: string;
  courseTitle?: string;
  recipient?: string;
  score?: number;
  total?: number;
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const courseTitle = (body.courseTitle ?? '').toString().trim().slice(0, 200);
  const courseId = (body.courseId ?? '').toString().slice(0, 200);
  const score = Number(body.score);
  const total = Number(body.total);

  if (!courseTitle || !Number.isFinite(score) || !Number.isFinite(total) || total < 4) {
    return NextResponse.json({ error: 'A certificate needs a valid exam result.' }, { status: 400 });
  }
  // Server-side gate: only issue when the learner actually passed.
  if (score / total < PASS_THRESHOLD) {
    return NextResponse.json(
      { error: `You need at least ${Math.round(PASS_THRESHOLD * 100)}% to earn a certificate.` },
      { status: 400 },
    );
  }

  const recipient =
    (body.recipient ?? '').toString().trim().slice(0, 80) || user.email.split('@')[0] || 'MeritFlow Learner';

  const id = await issueCertificate(user.id, { courseId, courseTitle, recipient, score, total });
  return NextResponse.json({ id });
}
