/**
 * What the companies we cannot collect from are actually running.
 *
 * The probe answers "is this a Greenhouse, Lever or Ashby board" and nothing
 * else, so a miss teaches us nothing about where to build next. This asks the
 * broader question against a sample: fetch the careers page, look for every
 * vendor marker we know of, and count. The answer decides which collector is
 * worth writing, which is a far better use of the information than a bare hit
 * rate.
 */
import { getDb } from '../src/lib/db';

const MARKERS: [string, RegExp][] = [
  ['greenhouse', /greenhouse\.io/i],
  ['lever', /lever\.co/i],
  ['ashby', /ashbyhq\.com/i],
  ['workday', /myworkdayjobs\.com|workday\.com/i],
  ['smartrecruiters', /smartrecruiters\.com/i],
  ['icims', /icims\.com/i],
  ['workable', /workable\.com/i],
  ['bamboohr', /bamboohr\.(com|co\.uk)/i],
  ['jazzhr', /jazz\.co|applytojob\.com/i],
  ['recruitee', /recruitee\.com/i],
  ['personio', /personio\.(com|de)/i],
  ['teamtailor', /teamtailor\.com/i],
  ['paylocity', /recruiting\.paylocity\.com/i],
  ['adp', /workforcenow\.adp\.com|myjobs\.adp\.com/i],
  ['ukg', /ultipro\.com|ukg\.(com|net)/i],
  ['taleo', /taleo\.net/i],
  ['successfactors', /successfactors\.(com|eu)/i],
  ['jobvite', /jobvite\.com/i],
  ['breezy', /breezy\.hr/i],
  ['rippling', /ats\.rippling\.com/i],
];

const SAMPLE = Number(process.argv[2] ?? 60);

async function main(): Promise<void> {
  const db = await getDb();
  const res = await db.query<{ name: string; domain: string }>(
    `SELECT name, domain FROM companies
      WHERE ats_identifier = '' AND domain <> '' AND priority = 'A'
      ORDER BY updated_at ASC LIMIT $1`,
    [SAMPLE],
  );

  const counts = new Map<string, number>();
  let reachable = 0;
  let unreachable = 0;

  for (const row of res.rows) {
    /* `/careers` first because it is by far the most common, then the root as
       a fallback -- plenty of small companies link their jobs from the home
       page and have no dedicated path at all. */
    let html = '';
    for (const path of ['/careers', '/jobs', '']) {
      try {
        const r = await fetch(`https://${row.domain}${path}`, {
          redirect: 'follow',
          headers: { 'user-agent': 'MeritFlow/1.0 (job discovery)' },
          signal: AbortSignal.timeout(9_000),
        });
        if (r.ok) {
          html = (await r.text()).slice(0, 300_000);
          break;
        }
      } catch {
        /* Next path. */
      }
    }

    if (!html) {
      unreachable += 1;
      continue;
    }
    reachable += 1;

    const hits = MARKERS.filter(([, re]) => re.test(html)).map(([name]) => name);
    if (hits.length === 0) counts.set('none found', (counts.get('none found') ?? 0) + 1);
    for (const h of hits) counts.set(h, (counts.get(h) ?? 0) + 1);
  }

  process.stdout.write(`Sampled ${res.rows.length} priority-A companies\n`);
  process.stdout.write(`  careers page reachable : ${reachable}\n`);
  process.stdout.write(`  no page found          : ${unreachable}\n\n`);
  for (const [vendor, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${vendor.padEnd(18)} ${String(n).padStart(3)}\n`);
  }
  process.exit(0);
}

void main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
