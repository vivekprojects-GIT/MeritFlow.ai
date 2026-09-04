import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  ANTHROPIC_MODELS,
  credentialSummary,
  deleteCredential,
  isAnthropicModel,
  isProvider,
  saveCredential,
} from '@/lib/credentials-store';

export const runtime = 'nodejs';

/**
 * The user's own API keys.
 *
 * Nothing here ever returns a key. GET reports which providers are configured
 * and the last four characters of each, which is what the settings page needs
 * to show and the most it is allowed to know.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    keys: await credentialSummary(user.id),
    models: ANTHROPIC_MODELS,
    /* Whether the operator's own keys are configured, so the page can say
       what happens when a user saves nothing — "falls back to the shared key"
       and "this feature is off" are very different messages. */
    fallback: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      serpapi: Boolean(process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY),
      youtube: Boolean(process.env.YOUTUBE_API_KEY),
    },
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string; secret?: string; model?: string };
  const provider = String(body.provider ?? '');
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 });
  }

  const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : undefined;

  if (model !== undefined && model !== '' && provider === 'anthropic' && !isAnthropicModel(model)) {
    return NextResponse.json({ error: 'That is not a model we can use.' }, { status: 400 });
  }

  /*
   * A shape check, not a validity check. Calling the provider to prove the key
   * works would spend the user's money on a settings save, and a key that is
   * the wrong shape is the mistake worth catching here — a pasted account id,
   * or a value with the quotes still attached.
   */
  if (secret) {
    if (secret.length < 16 || /\s/.test(secret)) {
      return NextResponse.json({ error: 'That does not look like an API key.' }, { status: 400 });
    }
    if (provider === 'anthropic' && !secret.startsWith('sk-ant-')) {
      return NextResponse.json({ error: 'An Anthropic key starts with "sk-ant-".' }, { status: 400 });
    }
  }

  await saveCredential(user.id, provider, { secret, model });
  return NextResponse.json({ keys: await credentialSummary(user.id) });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = String(body.provider ?? '');
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 });
  }

  await deleteCredential(user.id, provider);
  return NextResponse.json({ keys: await credentialSummary(user.id) });
}
