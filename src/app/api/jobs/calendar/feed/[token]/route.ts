import { userForCalendarToken } from '@/lib/job-settings';
import { listInterviews, toIcs } from '@/lib/jobs/calendar';

export const runtime = 'nodejs';

/**
 * The subscribable calendar feed.
 *
 * Deliberately not session-authenticated: Google Calendar, Apple Calendar and
 * Outlook poll this URL from their own servers and cannot send a cookie. The
 * token in the path is the credential, which is exactly how every private ICS
 * address works.
 *
 * Chosen over the Google Calendar API on purpose. That API is free, but it
 * needs OAuth, a consent screen, and Google's review before it can be used by
 * anyone outside a test list. A feed URL needs none of that and works in every
 * calendar app rather than only in Google's.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const userId = await userForCalendarToken(token);

  /* 404 rather than 401 for a bad token: a distinct "unauthorised" would
     confirm that a guessed token was the right shape, and there is no login to
     redirect a calendar client to anyway. */
  if (!userId) return new Response('Not found', { status: 404 });

  const ics = toIcs(await listInterviews(userId));

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      /* Clients poll on their own schedule; a short cache keeps a subscribed
         calendar close to live without inviting a poll per minute. */
      'Cache-Control': 'private, max-age=300',
      /* Never indexed, never cached by an intermediary. */
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
