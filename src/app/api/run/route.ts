import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isRemoteLang, runRemote } from '@/lib/sandbox';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = { language?: string; code?: string; stdin?: string };

export async function POST(req: Request) {
  // Require a session so this isn't an open public code-execution proxy.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to run this language in the cloud sandbox. (Python & JavaScript run instantly without an account.)' },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const language = (body.language ?? '').toString();
  const code = (body.code ?? '').toString();
  const stdin = (body.stdin ?? '').toString();

  if (!isRemoteLang(language)) {
    return NextResponse.json({ error: `Unsupported language: ${language}` }, { status: 400 });
  }
  if (!code.trim()) {
    return NextResponse.json({ error: 'Nothing to run.' }, { status: 400 });
  }
  if (code.length > 50_000) {
    return NextResponse.json({ error: 'Code is too long.' }, { status: 413 });
  }

  try {
    const result = await runRemote(language, code, stdin);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sandbox unavailable.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
