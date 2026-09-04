import { loadEnv } from './env';
loadEnv();
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/lib/db';
import { listJobs } from '../src/lib/jobs-store';
import { runDryRun } from '../src/lib/autopilot/workflow';

/** Same behaviour as the apply-url endpoint: ingest a stub, run as candidate-chosen. */
async function main(): Promise<void> {
  const db = await getDb();
  const u = await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [process.argv[2].toLowerCase()]);
  const url = process.argv[3];
  let job = (await listJobs(4000)).find((j) => j.url === url);
  if (!job) {
    const id = randomUUID();
    const now = Date.now();
    const host = new URL(url).hostname.replace(/^www\./, '');
    await db.query(
      `INSERT INTO jobs (id,company,title,norm_title,location,remote,track,description,skills,min_comp,url,source,posted_at,detected_at,last_seen_at,status)
       VALUES ($1,$2,$3,$4,'',FALSE,'experienced','','[]',NULL,$5,'manual',$6,$6,$6,'open')`,
      /* The last path segment keeps two pasted postings distinct: a shared
          "Pasted posting" title made every pair of pastes look like the same
          role to the duplicate guard, and the second was refused as a twin
          of the first. */
       [id, host, `Pasted posting ${new URL(url).pathname.split('/').filter(Boolean).pop()?.slice(0, 18) ?? id.slice(0, 8)}`, `pasted ${id}`, url, now],
    );
    job = (await listJobs(4000)).find((j) => j.id === id);
  }
  if (!job) throw new Error('could not record posting');
  const out = await runDryRun(u.rows[0].id, job, { chosenByCandidate: true });
  process.stdout.write(`${out.receipt?.company ?? job.company} — ${out.receipt?.role ?? ''}\n${out.finalState}\n${out.reason.slice(0, 220)}\n`);
  process.exit(0);
}
void main().catch((e: unknown) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
