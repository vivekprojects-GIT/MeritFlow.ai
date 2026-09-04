import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLearner } from '../route';
import {
  createDocument,
  getDocument,
  deleteDocument,
  ensureSeedDocument,
  backfillStructured,
  listDocuments,
  setActive,
  updateDocument,
  type DocKind,
} from '@/lib/jobs/documents';
import { resumeSchema, emptyResume } from '@/lib/jobs/resume-schema';
import { parseResume } from '@/lib/jobs/resume-parse';
import { checkRate, rateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/** Every résumé and cover letter the candidate has. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  /* A candidate who uploaded a CV during onboarding should not open an empty
     editor and conclude the upload was lost. */
  await ensureSeedDocument(user.id);
  /* Documents predating the structured column would otherwise open in the old
     plain-text fallback, with the layout controls missing alongside it. */
  await backfillStructured(user.id);
  return NextResponse.json({ documents: await listDocuments(user.id) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLearner(user.role)) return NextResponse.json({ error: 'Not available for this account type.' }, { status: 403 });

  const rate = checkRate(user.id, 'write');
  if (!rate.allowed) return rateLimited(rate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const action = String(body.action ?? 'create');
  const id = String(body.id ?? '');

  if (action === 'delete') {
    const ok = await deleteDocument(user.id, id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  /* Re-read an uploaded document into structure. Offered as an action so a
     candidate whose résumé parsed badly can retry rather than retype it. */
  if (action === 'reparse') {
    const doc = await getDocument(user.id, id);
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    /* Parsed from the preserved upload, not from the regenerated body: the
       body is derived from the last parse, so re-reading it would only ever
       reproduce the same result. */
    const structured = await parseResume(doc.sourceText || doc.body);
    return NextResponse.json({ document: await updateDocument(user.id, id, { structured }) });
  }

  if (action === 'activate') {
    const doc = await setActive(user.id, id);
    return doc ? NextResponse.json({ document: doc }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const patch = {
    name: typeof body.name === 'string' ? body.name : undefined,
    body: typeof body.body === 'string' ? body.body : undefined,
    template: typeof body.template === 'string' ? body.template : undefined,
    font: typeof body.font === 'string' ? body.font : undefined,
    fontSize: typeof body.fontSize === 'number' ? body.fontSize : undefined,
    /* Validated rather than trusted: this arrives from the browser and is
       written straight back out as the document. */
    structured: body.structured ? resumeSchema.parse(body.structured) : undefined,
  };

  if (action === 'update') {
    const doc = await updateDocument(user.id, id, patch);
    return doc ? NextResponse.json({ document: doc }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const kind: DocKind = body.kind === 'cover_letter' ? 'cover_letter' : 'resume';
  if (!patch.name) return NextResponse.json({ error: 'Give the document a name.' }, { status: 400 });

  return NextResponse.json({
    document: await createDocument(user.id, {
      ...patch,
      kind,
      name: patch.name,
      /* A new résumé starts structured, so the editor never has to render a
         document with no shape. */
      structured: patch.structured ?? (kind === 'resume' ? emptyResume() : undefined),
    }),
  });
}
