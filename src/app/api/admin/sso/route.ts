import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getUniversityForAdmin } from '@/lib/universities-store';

export const runtime = 'nodejs';

/** Current SSO settings. The client secret is never returned — only whether one is set. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const university = await getUniversityForAdmin(user.id);
  if (!university) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = await getDb();
  const res = await db.query<{
    sso_issuer: string | null;
    sso_client_id: string | null;
    sso_client_secret: string | null;
    sso_domains: string | null;
  }>(
    'SELECT sso_issuer, sso_client_id, sso_client_secret, sso_domains FROM universities WHERE id = $1',
    [university.id],
  );
  const row = res.rows[0];
  return NextResponse.json({
    slug: university.slug,
    issuer: row?.sso_issuer ?? '',
    clientId: row?.sso_client_id ?? '',
    hasSecret: Boolean(row?.sso_client_secret),
    domains: row?.sso_domains ?? '',
  });
}

/** Save SSO settings. An empty secret leaves the stored one untouched. */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const university = await getUniversityForAdmin(user.id);
  if (!university) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { issuer?: unknown; clientId?: unknown; clientSecret?: unknown; domains?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const issuer = String(body.issuer ?? '').trim();
  /* An http issuer would carry tokens over the wire in clear text. */
  if (issuer && !/^https:\/\//i.test(issuer)) {
    return NextResponse.json({ error: 'The issuer URL must start with https://' }, { status: 400 });
  }

  const db = await getDb();
  const secret = String(body.clientSecret ?? '').trim();
  await db.query(
    `UPDATE universities
        SET sso_issuer = $1,
            sso_client_id = $2,
            sso_client_secret = COALESCE(NULLIF($3, ''), sso_client_secret),
            sso_domains = $4
      WHERE id = $5`,
    [
      issuer || null,
      String(body.clientId ?? '').trim() || null,
      secret,
      String(body.domains ?? '').trim() || null,
      university.id,
    ],
  );
  return NextResponse.json({ ok: true });
}
