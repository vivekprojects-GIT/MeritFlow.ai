import { NextResponse } from 'next/server';
import { forwardToUser, storeInbound, verifyWebhookSecret } from '@/lib/mail/inbound';
import { getJobSettings } from '@/lib/job-settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Inbound mail webhook.
 *
 * Called by whichever provider accepts mail for the apply domain. Deliberately
 * tolerant about payload shape — Cloudflare, Postmark and SES all describe the
 * same message with different field names, and normalising here is cheaper
 * than running a provider-specific route each time one is swapped.
 *
 * Everything in the payload is untrusted content from the public internet. It
 * is stored and displayed as text; nothing in it is executed, and no
 * instruction inside a message reaches a model that can act.
 */

type Payload = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Recipients across the three providers' shapes. */
function recipients(p: Payload): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') out.push(...v.split(',').map((s) => s.trim()));
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') out.push(item.trim());
        else if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          push(rec.email ?? rec.Email ?? rec.address);
        }
      }
    }
  };
  push(p.to);
  push(p.To);
  push(p.recipient);
  push(p.ToFull);
  push(p.envelope && typeof p.envelope === 'object' ? (p.envelope as Record<string, unknown>).to : undefined);
  return out.filter(Boolean);
}

function sender(p: Payload): { addr: string; name: string } {
  const raw =
    str(p.from) ||
    str(p.From) ||
    str(p.sender) ||
    (p.FromFull && typeof p.FromFull === 'object' ? str((p.FromFull as Record<string, unknown>).Email) : '');
  const addr = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim();
  const name =
    (p.FromFull && typeof p.FromFull === 'object' ? str((p.FromFull as Record<string, unknown>).Name) : '') ||
    raw.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  return { addr, name };
}

export async function POST(req: Request) {
  /* A shared secret, sent either as a header or as a query parameter, because
     not every provider lets you set custom headers on a webhook. */
  const url = new URL(req.url);
  const provided = req.headers.get('x-mail-webhook-secret') ?? url.searchParams.get('secret');
  if (!verifyWebhookSecret(provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const from = sender(payload);
  const result = await storeInbound({
    providerMessageId: str(payload.MessageID) || str(payload.messageId) || str(payload.id),
    recipients: recipients(payload),
    fromAddr: from.addr,
    fromName: from.name,
    subject: str(payload.subject) || str(payload.Subject),
    body: str(payload.text) || str(payload.TextBody) || str(payload['body-plain']) || str(payload.body),
  });

  /* An unknown alias is answered 200 on purpose. A catch-all receives mail for
     addresses that were never issued, and returning an error makes the
     provider retry a message that will never be deliverable. */
  if (result.status !== 'stored') {
    return NextResponse.json({ ok: true, outcome: result.status });
  }

  const settings = await getJobSettings(result.userId);
  let forwarded = false;
  if (settings.emailRecs) {
    const f = await forwardToUser(result.messageId);
    forwarded = f.forwarded;
  }

  return NextResponse.json({ ok: true, outcome: 'stored', hasCode: Boolean(result.otp), forwarded });
}
