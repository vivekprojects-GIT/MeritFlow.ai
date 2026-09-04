import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { canAccessClass, isInstructorOf } from './discussions-store';

/**
 * Class materials — slides, readings, the source PDF a course was built from.
 *
 * Files are held as data URLs, the same approach assignment submissions already
 * use, so a self-hosted deployment needs no object store. That caps practical
 * file size, which is why the limit below is deliberately modest: this is for
 * handouts, not lecture video.
 */

export type Material = {
  id: string;
  name: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
  uploaderEmail: string;
};

/** 8 MB. Data URLs are ~33% larger than the bytes they encode. */
export const MATERIAL_MAX_BYTES = 8 * 1024 * 1024;

/** Listing never includes `data_url` — a class index would be tens of megabytes. */
export async function listMaterials(userId: string, classId: string): Promise<Material[] | null> {
  if (!(await canAccessClass(userId, classId))) return null;

  const db = await getDb();
  const res = await db.query<{
    id: string;
    name: string;
    description: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
    email: string;
  }>(
    `SELECT m.id, m.name, m.description, m.mime_type, m.size_bytes, m.created_at, u.email
       FROM class_materials m JOIN users u ON u.id = m.uploader_id
      WHERE m.class_id = $1
      ORDER BY m.created_at DESC`,
    [classId],
  );

  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    createdAt: Number(r.created_at),
    uploaderEmail: r.email,
  }));
}

export async function addMaterial(
  userId: string,
  classId: string,
  file: { name: string; description?: string; mimeType: string; sizeBytes: number; dataUrl: string },
): Promise<string | null> {
  /* Only the instructor publishes materials; students read them. */
  if (!(await isInstructorOf(userId, classId))) return null;
  if (file.sizeBytes > MATERIAL_MAX_BYTES) return null;
  if (!file.dataUrl.startsWith('data:')) return null;

  const db = await getDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO class_materials (id, class_id, uploader_id, name, description, mime_type, size_bytes, data_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      classId,
      userId,
      file.name.slice(0, 200),
      (file.description ?? '').slice(0, 400),
      file.mimeType.slice(0, 120),
      file.sizeBytes,
      file.dataUrl,
      Date.now(),
    ],
  );
  return id;
}

/** The actual bytes, for download. Membership-gated like the listing. */
export async function getMaterialData(
  userId: string,
  materialId: string,
): Promise<{ name: string; mimeType: string; dataUrl: string } | null> {
  const db = await getDb();
  const res = await db.query<{ class_id: string; name: string; mime_type: string; data_url: string }>(
    'SELECT class_id, name, mime_type, data_url FROM class_materials WHERE id = $1',
    [materialId],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (!(await canAccessClass(userId, row.class_id))) return null;
  return { name: row.name, mimeType: row.mime_type, dataUrl: row.data_url };
}

export async function deleteMaterial(userId: string, materialId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(
    `DELETE FROM class_materials
      WHERE id = $1 AND class_id IN (SELECT id FROM classes WHERE instructor_id = $2)`,
    [materialId, userId],
  );
  return (res.affectedRows ?? 0) > 0;
}
