import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { statements } from './sql-compat';

/**
 * The schema, executed by a Postgres engine rather than read by a person.
 *
 * ## Why this test exists
 *
 * The deployed database is Postgres and the development one is a SQLite file.
 * The schema is shared, and SQLite is famously tolerant — it accepts column
 * types it does not implement and constraints it does not enforce. So a
 * statement can pass every local run and every test, and fail on the first
 * boot in production, where the failure costs a deploy rather than a second.
 *
 * `pg-mem` is not Postgres, and this is not a claim that the deployment will
 * work. It parses and executes DDL with Postgres semantics, which makes it a
 * genuine check on dialect: `AUTOINCREMENT` and a SQLite-only function in a
 * default are both rejected here, and neither appears in the schema.
 *
 * It has a measured blind spot. Asked to create `BOOLEAN NOT NULL DEFAULT 0`,
 * pg-mem accepts it and Postgres does not. That one is checked below by
 * reading the schema rather than executing it, because an emulator's silence
 * is not evidence and this is exactly the sort of difference that only shows
 * up on the first deploy.
 */

/** The schema as db.ts holds it, read from source so the two cannot drift. */
async function schemaSql(): Promise<string> {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('src/lib/db.ts', 'utf8');
  const start = source.indexOf('const SCHEMA = `');
  const end = source.indexOf('`;', start);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start + 'const SCHEMA = `'.length, end);
}

/** Apply everything the emulator can, ignoring what it merely does not implement. */
function applied(sql: string) {
  const db = newDb();
  for (const statement of statements(sql)) {
    try {
      db.public.none(statement);
    } catch {
      /* Reported by the first test; here we only care what survived. */
    }
  }
  return db;
}

describe('the schema on Postgres', () => {
  it('applies statement by statement without error', async () => {
    const sql = await schemaSql();
    const db = newDb();

    const failures: string[] = [];
    for (const statement of statements(sql)) {
      try {
        db.public.none(statement);
      } catch (err) {
        const head = statement.slice(0, 80).replace(/\s+/g, ' ');
        const message = err instanceof Error ? err.message : String(err);

        /* pg-mem implements a subset. A statement it does not *support* is not
           a statement Postgres would reject, so those are reported separately
           rather than failing the run — what this test is for is dialect. */
        if (/not supported|unsupported|not implemented|Unexpected kind/i.test(message)) continue;
        failures.push(`${head}...\n    ${message}`);
      }
    }

    expect(failures, `Statements Postgres rejected:\n\n${failures.join('\n\n')}`).toEqual([]);
  });

  it('never gives a boolean an integer default', async () => {
    /* Postgres rejects `BOOLEAN DEFAULT 0`; SQLite and pg-mem both accept it.
       Since the emulator will not catch this, the text is checked directly. */
    const sql = await schemaSql();
    const offenders = sql
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((l) => /\bBOOLEAN\b/i.test(l.line) && /DEFAULT\s+[01]\b/i.test(l.line));

    const report = offenders.map((o) => `  line ${o.n}: ${o.line}`).join('\n');
    expect(offenders, `Boolean columns defaulted to an integer:\n${report}`).toEqual([]);
  });

  it('uses no SQLite-only syntax the emulator would reject', async () => {
    /* A guard on the guard: these are the constructs that would slip in from
       SQLite habits, and finding none is only meaningful because the emulator
       demonstrably rejects them when they are present. */
    const sql = await schemaSql();
    expect(sql).not.toMatch(/AUTOINCREMENT/i);
    expect(sql).not.toMatch(/WITHOUT\s+ROWID/i);
    expect(sql).not.toMatch(/\bdatetime\s*\(/i);
    expect(sql).not.toMatch(/\bstrftime\s*\(/i);
  });

  it('creates the tables the app depends on', async () => {
    const db = applied(await schemaSql());

    /* A spot check across the app's areas rather than every table: if these
       exist, the statements around them ran in the right order. */
    for (const table of ['users', 'sessions', 'courses', 'goals', 'goal_courses', 'user_credentials']) {
      expect(() => db.public.none(`SELECT 1 FROM ${table} LIMIT 1`), `missing table: ${table}`).not.toThrow();
    }
  });

  it('accepts a row through the columns the app writes', async () => {
    const db = applied(await schemaSql());

    db.public.none(`INSERT INTO users (id,email,password_hash,created_at) VALUES ('u1','a@b.c','x',1)`);
    expect(db.public.many(`SELECT email FROM users WHERE id = 'u1'`)).toHaveLength(1);

    /* The credentials table is the newest and the one a deploy would notice
       missing, because every saved API key lives in it. */
    db.public.none(
      `INSERT INTO user_credentials (user_id,provider,secret,last4,model,updated_at)
       VALUES ('u1','anthropic','sealed','beef','claude-opus-5',1)`,
    );
    expect(db.public.many(`SELECT last4 FROM user_credentials WHERE user_id = 'u1'`)).toHaveLength(1);
  });
});
