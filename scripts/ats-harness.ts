/**
 * The ATS reliability harness.
 *
 *     npm run harness            -- every vendor
 *     npm run harness -- lever   -- one vendor
 *
 * ## What this is for
 *
 * Each adapter in this repository was written from exactly one live form. That
 * is enough to make an adapter work and nowhere near enough to make it
 * reliable: the same ATS renders differently per tenant, employers add required
 * questions, and a field that was optional last month is mandatory this month.
 * Supporting an ATS is a coding problem; supporting it across a hundred
 * employers is an evidence problem.
 *
 * So this runs each adapter against real tenants and reports what it found. It
 * is a tool, not a test — it depends on other people's live sites, it takes
 * minutes, and a failure here usually means an employer changed their form
 * rather than that this repository is broken. Putting it in the suite would
 * make the suite lie in both directions.
 *
 * ## What it will not do
 *
 * **Read-only.** It calls `inspect` and nothing else. No form is filled, no
 * application is submitted, and no account is touched. It looks at public job
 * postings the same way a candidate deciding whether to apply would.
 *
 * Sequential, with a pause between tenants. These are other people's servers
 * and thirty concurrent headless browsers from one address is the behaviour
 * that gets an IP blocked.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { greenhouseAdapter } from '../src/lib/autopilot/adapters/greenhouse';
import { leverAdapter } from '../src/lib/autopilot/adapters/lever';
import { ashbyAdapter } from '../src/lib/autopilot/adapters/ashby';
import { closeBrowser } from '../src/lib/autopilot/adapters/browser';
import { recordHealth } from '../src/lib/autopilot/registry';
import type { AtsAdapter, InspectResult } from '../src/lib/autopilot/adapters/types';

type Vendor = 'greenhouse' | 'lever' | 'ashby';

/** Tenants confirmed to be serving postings at the time this was written. */
const TENANTS: Record<Vendor, string[]> = {
  greenhouse: [
    'adapter',
    'databricks',
    'stripe',
    'anthropic',
    'discord',
    'robinhood',
    'flexport',
    'instacart',
    'gitlab',
    'affirm',
  ],
  /* Six rather than ten: Lever's public boards are simply thinner on the
     ground, and padding the list with dead tokens would report failures that
     say nothing about the adapter. */
  lever: ['spotify', 'swile', 'leverdemo', 'tala', 'shieldai', 'ledger'],
  ashby: ['ramp', 'linear', 'vanta', 'openai', 'hex', 'replit', 'posthog', 'warp', 'browserbase', 'modal'],
};

const ADAPTERS: Record<Vendor, AtsAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
};

/** One posting URL per tenant, taken from the vendor's own public board. */
async function pickPosting(vendor: Vendor, tenant: string): Promise<string | null> {
  const json = async (url: string) => {
    const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
    return res.ok ? res.json() : null;
  };

  try {
    if (vendor === 'greenhouse') {
      const body = (await json(`https://boards-api.greenhouse.io/v1/boards/${tenant}/jobs`)) as {
        jobs?: { absolute_url?: string }[];
      } | null;
      return body?.jobs?.[0]?.absolute_url ?? null;
    }
    if (vendor === 'lever') {
      const body = (await json(`https://api.lever.co/v0/postings/${tenant}?mode=json`)) as
        | { hostedUrl?: string }[]
        | null;
      return body?.[0]?.hostedUrl ?? null;
    }
    const body = (await json(`https://api.ashbyhq.com/posting-api/job-board/${tenant}`)) as {
      jobs?: { jobUrl?: string }[];
    } | null;
    return body?.jobs?.[0]?.jobUrl ?? null;
  } catch {
    return null;
  }
}

type Row = {
  vendor: Vendor;
  tenant: string;
  ok: boolean;
  questions: number;
  /* The three things every application on earth asks for. Their absence is the
     signal that matters: an inspect that "succeeded" without finding somewhere
     to put an email address has not read the form. */
  name: boolean;
  email: boolean;
  resume: boolean;
  captcha: boolean;
  ms: number;
  note: string;
};

function has(result: InspectResult, pattern: RegExp, kind?: string): boolean {
  return result.questions.some((q) => (kind ? q.kind === kind : true) && pattern.test(`${q.id} ${q.label}`));
}

async function probe(vendor: Vendor, tenant: string): Promise<Row> {
  const base: Row = {
    vendor,
    tenant,
    ok: false,
    questions: 0,
    name: false,
    email: false,
    resume: false,
    captcha: false,
    ms: 0,
    note: '',
  };

  const url = await pickPosting(vendor, tenant);
  if (!url) return { ...base, note: 'no live posting on this board' };

  const started = Date.now();
  try {
    const result = await ADAPTERS[vendor].inspect(url);
    return {
      ...base,
      ok: true,
      questions: result.questions.length,
      name: has(result, /name/i),
      email: has(result, /e-?mail/i),
      resume: has(result, /resume|cv/i) || has(result, /./, 'file'),
      captcha: result.requiresHumanChallenge,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      ...base,
      ms: Date.now() - started,
      note: err instanceof Error ? err.message.split('\n')[0].slice(0, 70) : 'failed',
    };
  }
}

function table(rows: Row[]): void {
  const flag = (b: boolean) => (b ? 'y' : '·');
  process.stdout.write(
    `\n${'vendor'.padEnd(11)}${'tenant'.padEnd(14)}${'ok'.padEnd(4)}${'q'.padEnd(4)}${'name'.padEnd(6)}${'mail'.padEnd(6)}${'cv'.padEnd(4)}${'cap'.padEnd(5)}${'ms'.padEnd(7)}note\n`,
  );
  process.stdout.write(`${'-'.repeat(96)}\n`);

  for (const r of rows) {
    process.stdout.write(
      r.vendor.padEnd(11) +
        r.tenant.padEnd(14) +
        (r.ok ? 'ok' : 'FAIL').padEnd(4) +
        String(r.questions).padEnd(4) +
        flag(r.name).padEnd(6) +
        flag(r.email).padEnd(6) +
        flag(r.resume).padEnd(4) +
        flag(r.captcha).padEnd(5) +
        String(r.ms).padEnd(7) +
        r.note +
        '\n',
    );
  }
}

function summarise(rows: Row[]): void {
  const byVendor = new Map<Vendor, Row[]>();
  for (const r of rows) byVendor.set(r.vendor, [...(byVendor.get(r.vendor) ?? []), r]);

  process.stdout.write('\nSUMMARY\n');
  for (const [vendor, group] of byVendor) {
    const reachable = group.filter((r) => r.note !== 'no live posting on this board');
    const ok = reachable.filter((r) => r.ok);
    /* "Read the form" is a higher bar than "did not throw": an inspect that
       returns two questions and no email field is a failure wearing a pass. */
    const complete = ok.filter((r) => r.name && r.email && r.resume);
    const captcha = ok.filter((r) => r.captcha);

    process.stdout.write(
      `  ${vendor.padEnd(11)} ${ok.length}/${reachable.length} inspected · ` +
        `${complete.length}/${ok.length} found name+email+CV · ` +
        `${captcha.length} behind a CAPTCHA\n`,
    );
  }

  const broken = rows.filter((r) => r.ok && !(r.name && r.email && r.resume));
  if (broken.length > 0) {
    process.stdout.write('\nREAD BUT INCOMPLETE — these are the adapter bugs worth fixing:\n');
    for (const r of broken) {
      const missing = [!r.name && 'name', !r.email && 'email', !r.resume && 'CV'].filter(Boolean).join(', ');
      process.stdout.write(`  ${r.vendor}/${r.tenant}: ${r.questions} questions, no ${missing}\n`);
    }
  }

  const failed = rows.filter((r) => !r.ok && r.note !== 'no live posting on this board');
  if (failed.length > 0) {
    process.stdout.write('\nFAILED TO READ:\n');
    for (const r of failed) process.stdout.write(`  ${r.vendor}/${r.tenant}: ${r.note}\n`);
  }
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2).filter((a) => a in TENANTS) as Vendor[];
  const vendors = wanted.length > 0 ? wanted : (Object.keys(TENANTS) as Vendor[]);

  process.stdout.write(`Probing ${vendors.join(', ')} — read-only, one tenant at a time.\n`);
  if (process.env.AUTOPILOT_ARTIFACTS) {
    process.stdout.write(`Artifacts → ${process.env.AUTOPILOT_ARTIFACTS}\n`);
  }

  const rows: Row[] = [];
  for (const vendor of vendors) {
    for (const tenant of TENANTS[vendor]) {
      const row = await probe(vendor, tenant);
      rows.push(row);
      process.stdout.write(`  ${row.ok ? '·' : '!'} ${vendor}/${tenant}\n`);
      /* Someone else's server. */
      await sleep(1200);
    }
  }

  table(rows);
  summarise(rows);

  /*
   * Persist what was observed, per vendor.
   *
   * This is what turns the registry from a table of intentions into one the
   * router can act on: a vendor whose reads started failing last week is
   * declined up front rather than discovered one candidate at a time. Only
   * counted where a tenant was actually reachable — a board with no live
   * postings says nothing about the adapter.
   */
  const byVendor = new Map<Vendor, { attempted: number; complete: number }>();
  for (const r of rows) {
    if (r.note === 'no live posting on this board') continue;
    const acc = byVendor.get(r.vendor) ?? { attempted: 0, complete: 0 };
    acc.attempted += 1;
    if (r.ok && r.name && r.email && r.resume) acc.complete += 1;
    byVendor.set(r.vendor, acc);
  }

  /* Skipped on a partial run: writing "lever 5/5" after probing only Lever
     would leave the other vendors' evidence looking current when it is not. */
  if (vendors.length === (Object.keys(TENANTS) as Vendor[]).length) {
    try {
      await recordHealth([...byVendor.entries()].map(([vendor, v]) => ({ vendor, ...v })));
      process.stdout.write('\nRecorded to ats_health.\n');
    } catch (err) {
      process.stdout.write(`\nCould not record health: ${err instanceof Error ? err.message : 'failed'}\n`);
    }
  } else {
    process.stdout.write('\nPartial run — health not recorded.\n');
  }

  await closeBrowser();
}

void main();
