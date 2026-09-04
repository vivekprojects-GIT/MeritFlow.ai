import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { submitAssignment, SUBMISSION_FILE_MAX_CHARS } from '@/lib/assignments-store';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let text = '';
  let link = '';
  let fileName: string | null = null;
  let fileData: string | null = null;
  try {
    const body = (await req.json()) as {
      text?: unknown;
      link?: unknown;
      fileName?: unknown;
      fileData?: unknown;
    };
    text = String(body.text ?? '');
    link = String(body.link ?? '').trim();
    if (typeof body.fileName === 'string' && body.fileName) fileName = body.fileName;
    if (typeof body.fileData === 'string' && body.fileData) fileData = body.fileData;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!text.trim() && !link && !fileData) {
    return NextResponse.json({ error: 'Add a written response, a link, or a file.' }, { status: 400 });
  }
  if (fileData && fileData.length > SUBMISSION_FILE_MAX_CHARS) {
    return NextResponse.json({ error: 'File is too large (max ~2.5 MB).' }, { status: 400 });
  }

  const result = await submitAssignment(user.id, id, { text, link, fileName, fileData });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
