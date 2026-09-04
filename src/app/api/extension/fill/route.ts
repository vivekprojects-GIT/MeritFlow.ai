import { NextResponse } from 'next/server';
import { userForExtensionToken } from '@/lib/job-settings';
import { getProfile } from '@/lib/profile-store';
import { getVault, resolveQuestions, seedFromResume, seedIdentity, type FormQuestion } from '@/lib/autopilot/answer-vault';
import { matchIdentity } from '@/lib/autopilot/adapters/generic';
import { getCareerLinks } from '@/lib/career/store';
import { activeResume } from '@/lib/jobs/documents';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * What the extension is allowed to type.
 *
 * ## Why the browser does not decide this
 *
 * The extension is hands and eyes: it reads the fields on the page and types
 * what comes back. It holds no answers, no résumé and no vault, and it cannot
 * decide that a question is close enough to one it knows.
 *
 * That is the same split the multi-page navigator uses, for the same reason.
 * There is exactly one place that decides what may be said on someone's job
 * application, it is on the server, and it refuses rather than guesses. A
 * second copy of that logic living in a content script — shipped to the
 * browser, updated on its own schedule, running on employer pages — would be a
 * second answer to "is this candidate authorized to work here", and the two
 * would eventually disagree.
 *
 * ## What comes back
 *
 * A value per field it can answer, and a reason per field it cannot. The
 * refusals are the useful half: they are what the candidate fills in once, and
 * what stops the extension inventing a number of years of Kubernetes.
 */

type Incoming = {
  /** Fields the content script found, in page order. */
  fields?: { id?: unknown; label?: unknown; required?: unknown; kind?: unknown }[];
  /** The page being filled, for the audit line. Never used to pick answers. */
  url?: unknown;
};

const KINDS = new Set(['text', 'textarea', 'select', 'boolean', 'file']);

function clean(raw: Incoming['fields']): FormQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 120)
    .map((f) => ({
      id: String(f?.id ?? '').slice(0, 200),
      label: String(f?.label ?? '').slice(0, 300),
      required: Boolean(f?.required),
      kind: (KINDS.has(String(f?.kind)) ? String(f?.kind) : 'text') as FormQuestion['kind'],
    }))
    .filter((f) => f.id);
}

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  const userId = await userForExtensionToken(token);
  if (!userId) return json({ error: 'Connect the extension from Settings.' }, 401);

  const rate = checkRate(userId, 'write');
  if (!rate.allowed) return rateLimited(rate);

  let body: Incoming;
  try {
    body = (await req.json()) as Incoming;
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }

  const questions = clean(body.fields);
  if (questions.length === 0) return json({ answers: [], blocked: [], resume: null });

  const [profile, vault, links] = await Promise.all([getProfile(userId), getVault(userId), getCareerLinks(userId)]);

  seedIdentity(vault, {
    name: profile?.name,
    email: profile?.email,
    phone: profile?.phone,
    pronouns: profile?.pronouns,
    website: profile?.website,
    linkedin: links.linkedin,
    github: links.github,
    portfolio: links.portfolio,
  });

  /* Same order as the workflow: account first, then the résumé fills gaps. */
  seedFromResume(vault, await activeResume(userId));

  const identityFields: Record<string, string> = {
    firstName: (profile?.name ?? '').split(' ')[0] ?? '',
    lastName: (profile?.name ?? '').split(' ').slice(1).join(' '),
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    website: profile?.website ?? '',
    linkedin: links.linkedin,
    github: links.github,
    portfolio: links.portfolio || profile?.website || '',
  };

  const resolved = new Map(resolveQuestions(questions, vault).map((a) => [a.question.id, a]));

  const answers: { field: string; value: string; source: string }[] = [];
  const blocked: { field: string; label: string; reason: string }[] = [];

  for (const q of questions) {
    /* A file input is never filled from here. The extension cannot attach a
       file it does not have, and a path typed into a file field does nothing
       except look like it worked. */
    if (q.kind === 'file') {
      blocked.push({ field: q.id, label: q.label, reason: 'Attach your résumé yourself — a file cannot be filled in.' });
      continue;
    }

    const identity = matchIdentity(`${q.id} ${q.label}`.toLowerCase(), identityFields);
    if (identity !== null) {
      if (identity) answers.push({ field: q.id, value: identity, source: 'profile' });
      else blocked.push({ field: q.id, label: q.label, reason: 'Missing from your profile.' });
      continue;
    }

    const hit = resolved.get(q.id);
    if (hit?.value && !hit.blockedReason) {
      answers.push({ field: q.id, value: hit.value, source: 'vault' });
    } else {
      blocked.push({
        field: q.id,
        label: q.label,
        reason: hit?.blockedReason ?? 'No verified answer for this question yet.',
      });
    }
  }

  return json({
    answers,
    blocked,
    /* Named so the popup can tell the candidate which file to attach, rather
       than leaving them to guess which of their résumés this should be. */
    resume: profile?.name ? `${profile.name.replace(/\s+/g, '_')}_resume.pdf` : null,
  });
}

/** Preflight, so a content script on an employer page can reach this at all. */
export async function OPTIONS() {
  return json({}, 204);
}

/**
 * Responses carry permissive CORS, and can afford to.
 *
 * The endpoint authenticates with a bearer token rather than the session
 * cookie, so a hostile page reading this origin gets nothing it did not
 * already have to steal a token to obtain — and it never sees the cookie at
 * all. That is the reason for the separate credential.
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'cache-control': 'no-store',
    },
  });
}
