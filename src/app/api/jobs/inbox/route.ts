import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import { getDb } from '@/lib/db';
import { listInbound, forwardToUser } from '@/lib/mail/inbound';
import { ensureApplyAlias } from '@/lib/job-settings';
import { sendFromAlias, listOutbound } from '@/lib/mail/outbound';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/** The inbox: every message received at the candidate's application address. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const messages = await listInbound(user.id, 200);

  /* One message with its body, for the reading pane. Bodies are excluded from
     the list so opening Settings does not ship the user's whole mailbox. */
  if (id) {
    const one = messages.find((m) => m.id === id);
    if (!one) return NextResponse.json({ error: 'No such message.' }, { status: 404 });
    const db = await getDb();
    await db.query('UPDATE inbound_mail SET read_at = COALESCE(read_at, $1) WHERE user_id = $2 AND id = $3', [
      Date.now(),
      user.id,
      id,
    ]);
    return NextResponse.json({ message: one });
  }

  return NextResponse.json({
    sent: await listOutbound(user.id, 50),
    applyEmail: await ensureApplyAlias(user.id, user.email),
    messages: messages.map((m) => ({
      id: m.id,
      fromName: m.fromName || m.fromAddr,
      fromAddr: m.fromAddr,
      subject: m.subject,
      /* A short preview so the list is scannable without the full body. */
      preview: m.body.replace(/\s+/g, ' ').slice(0, 160),
      otp: m.otp,
      company: m.company,
      category: m.category,
      receivedAt: m.receivedAt,
      forwarded: m.forwardedAt != null,
      read: m.readAt != null,
    })),
  });
}

/** Retry a forward that did not go out. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  let body: { action?: string; id?: string; to?: unknown; subject?: unknown; body?: unknown; replyToId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  /* Compose or reply. Sent from the application alias so a recruiter thread
     stays on the address the application used. */
  if (body.action === 'send') {
    const rate = checkRate(user.id, 'write');
    if (!rate.allowed) return rateLimited(rate);
    const out = await sendFromAlias(user.id, {
      to: String(body.to ?? ''),
      subject: String(body.subject ?? ''),
      body: String(body.body ?? ''),
      replyToId: typeof body.replyToId === 'string' ? body.replyToId : undefined,
    });
    return out.ok
      ? NextResponse.json({ ok: true, id: out.id })
      : NextResponse.json({ error: out.reason }, { status: 400 });
  }

  if (body.action === 'forward' && body.id) {
    /* Ownership is checked before forwarding: the message id alone must not be
       enough to have someone else's mail sent to your address. */
    const mine = (await listInbound(user.id, 500)).some((m) => m.id === body.id);
    if (!mine) return NextResponse.json({ error: 'No such message.' }, { status: 404 });
    const result = await forwardToUser(body.id);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
