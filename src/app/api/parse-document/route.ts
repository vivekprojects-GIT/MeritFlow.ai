import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB upload cap
const MAX_TEXT = 200_000; // cap the extracted text we return

/** Extract plain text from an uploaded PDF, Word (.docx), or text file (instructor-only). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'instructor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is too large (max 12 MB).' }, { status: 413 });

  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    let text = '';
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const res = await extractText(pdf, { mergePages: true });
      text = Array.isArray(res.text) ? res.text.join('\n\n') : res.text;
    } else if (name.endsWith('.docx') || file.type.includes('officedocument.wordprocessingml')) {
      const mod = await import('mammoth');
      const extractRawText = mod.extractRawText ?? mod.default.extractRawText;
      const res = await extractRawText({ buffer: buf });
      text = res.value;
    } else if (
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.markdown') ||
      name.endsWith('.csv') ||
      file.type.startsWith('text/')
    ) {
      text = buf.toString('utf8');
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, Word (.docx), or text file.' },
        { status: 415 },
      );
    }

    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
    if (text.length < 20) {
      return NextResponse.json(
        { error: 'Could not read meaningful text from that file — it may be scanned/image-only. Try another file or paste the content.' },
        { status: 422 },
      );
    }
    return NextResponse.json({ text, chars: text.length, name: file.name });
  } catch (err) {
    console.error('Document parse failed:', err);
    return NextResponse.json({ error: 'Could not read that file. Try another file or paste the content.' }, { status: 500 });
  }
}
