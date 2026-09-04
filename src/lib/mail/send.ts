/**
 * Outbound mail.
 *
 * Provider-agnostic and dependency-free: every option here is an HTTPS API, so
 * there is no SMTP client to add and nothing to keep patched. Whichever
 * provider is configured wins; with none configured, sending reports failure
 * rather than pretending to succeed.
 *
 * That last point matters more than it looks. A mailer that silently swallows
 * sends makes "the candidate was notified" untrue in a way nothing surfaces —
 * so the caller always learns whether the message actually left.
 */

export type SendResult = { sent: boolean; reason: string };

export type Mail = {
  to: string;
  subject: string;
  text: string;
  /** Defaults to the configured from-address. */
  from?: string;
  /** Set so a recruiter replying to a forwarded message reaches the candidate. */
  replyTo?: string;
};

function fromAddress(): string {
  return process.env.MAIL_FROM?.trim() || '';
}

export function mailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY || process.env.POSTMARK_TOKEN) && fromAddress());
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const from = mail.from ?? fromAddress();
  if (!from) return { sent: false, reason: 'MAIL_FROM is not set.' };

  const resend = process.env.RESEND_API_KEY?.trim();
  const postmark = process.env.POSTMARK_TOKEN?.trim();
  if (!resend && !postmark) return { sent: false, reason: 'No mail provider configured.' };

  try {
    const res = resend
      ? await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [mail.to],
            subject: mail.subject,
            text: mail.text,
            ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
          }),
        })
      : await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'X-Postmark-Server-Token': postmark!,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            From: from,
            To: mail.to,
            Subject: mail.subject,
            TextBody: mail.text,
            ...(mail.replyTo ? { ReplyTo: mail.replyTo } : {}),
          }),
        });

    if (!res.ok) {
      /* The provider's message is kept: "domain not verified" and "rate
         limited" need different responses, and a generic failure hides both. */
      const detail = await res.text().catch(() => '');
      return { sent: false, reason: `Provider returned ${res.status}. ${detail.slice(0, 300)}` };
    }
    return { sent: true, reason: 'Sent.' };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'Network error.' };
  }
}
