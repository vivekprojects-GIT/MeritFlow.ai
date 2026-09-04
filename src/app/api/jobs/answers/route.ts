import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { applyMarkdown, forgetAnswer, learnAnswer, listBook, toMarkdown } from '@/lib/autopilot/answer-book';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * The answer book, over HTTP.
 *
 * `GET` reads it, `POST` teaches it one answer, `PUT` replaces it from an
 * edited file, `DELETE` forgets one. Nothing here decides what may go on an
 * application — that stays in the vault, which refuses on its own terms. This
 * is storage and presentation.
 */

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const entries = await listBook(user.id);

  if (new URL(req.url).searchParams.get('format') === 'md') {
    return new NextResponse(toMarkdown(entries), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'attachment; filename="my-application-answers.md"',
        'cache-control': 'no-store',
      },
    });
  }

  return NextResponse.json({ entries, markdown: toMarkdown(entries) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const rate = checkRate(user.id, 'write');
  if (!rate.allowed) return rateLimited(rate);

  let body: { question?: unknown; value?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const entry = await learnAnswer(user.id, {
    question: String(body.question ?? '').slice(0, 300),
    value: String(body.value ?? '').slice(0, 4000),
  });

  if (!entry) return NextResponse.json({ error: 'A question and an answer are both required.' }, { status: 400 });

  return NextResponse.json({
    entry,
    /* Said plainly, because it is the point of the whole feature: this was the
       last time they will be asked. */
    message: entry.auto
      ? 'Saved. Future applications asking this will fill it in automatically.'
      : 'Saved. Autopilot will still hand this one back to you before sending.',
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const rate = checkRate(user.id, 'write');
  if (!rate.allowed) return rateLimited(rate);

  let text = '';
  try {
    text = String(((await req.json()) as { markdown?: unknown }).markdown ?? '');
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const written = await applyMarkdown(user.id, text.slice(0, 200_000));
  const entries = await listBook(user.id);

  return NextResponse.json({
    written,
    entries,
    markdown: toMarkdown(entries),
    message: written === 0 ? 'Nothing in that file parsed, so nothing was changed.' : `Updated ${written} answers.`,
  });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const intent = new URL(req.url).searchParams.get('intent') ?? '';
  if (!intent) return NextResponse.json({ error: 'Which answer?' }, { status: 400 });

  await forgetAnswer(user.id, intent);
  return NextResponse.json({ ok: true, entries: await listBook(user.id) });
}
