import { Pool, types } from 'pg';
import type { Db, QueryResult } from './db-types';

/**
 * The application database when it is a real Postgres server.
 *
 * ## Why this exists beside the SQLite driver rather than replacing it
 *
 * A SQLite file is the right local database: no server to run, a backup is a
 * copy, and any tool on the machine can open it. It is the wrong *deployed*
 * database on a platform with an ephemeral filesystem, where every deploy
 * would delete every user, course and saved key.
 *
 * So both drivers stay, chosen by whether `DATABASE_URL` is set. Nothing else
 * in the codebase knows which one it is talking to.
 *
 * ## Why this driver is so much thinner than the SQLite one
 *
 * The two hundred queries in this codebase are written in Postgres dialect and
 * translated *down* to SQLite by `sql-compat.ts`. Here there is nothing to
 * translate: `$1` placeholders, `ON CONFLICT ... DO UPDATE`, `= ANY($1)` and
 * `ADD COLUMN IF NOT EXISTS` are all native. The schema needed no changes
 * either — it was written for Postgres and merely tolerated by SQLite.
 */

/*
 * Return BIGINT as a number rather than a string.
 *
 * `pg` hands back int8 as a string by default, because a 64-bit integer can
 * exceed what a JavaScript number holds exactly. Every BIGINT in this schema is
 * an epoch-milliseconds timestamp or a count — the largest is a date in the
 * year 2286, which is nowhere near 2^53 — so the precision that default is
 * protecting does not exist here, while the cost is real: call sites compare
 * `created_at` numerically, and a string silently sorts and compares wrong.
 */
types.setTypeParser(20, (value: string) => Number(value));

/* The same for numeric/REAL, so a score reads as a number and not "0.82". */
types.setTypeParser(1700, (value: string) => Number(value));

/**
 * Bind a value Postgres will accept.
 *
 * Far less to do than the SQLite equivalent: booleans, numbers and Dates all
 * bind natively. Only `undefined` needs handling, because `pg` rejects it
 * where the intent is always SQL NULL.
 */
function bindable(value: unknown): unknown {
  return value === undefined ? null : value;
}

export async function createPostgresDb(connectionString: string, schema: string): Promise<Db> {
  const pool = new Pool({
    connectionString,
    /*
     * Managed Postgres almost always terminates TLS with a certificate the
     * platform signs, not one in Node's trust store. Verifying it fails; the
     * connection is still encrypted. Set PGSSL_STRICT=1 where the certificate
     * chain is genuinely verifiable.
     */
    ssl:
      process.env.PGSSL_STRICT === '1'
        ? true
        : /sslmode=disable/.test(connectionString) || /localhost|127\.0\.0\.1/.test(connectionString)
          ? false
          : { rejectUnauthorized: false },
    /* A web dyno serves many concurrent requests but the database is the
       scarce resource; a small pool queues rather than exhausting it. */
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  /* An idle client dropped by the platform must not take the process with it:
     `pg` emits this on the pool, and an unhandled 'error' event is fatal. */
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  await migrate(pool, schema);

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
      const res = await pool.query(sql, params.map(bindable));
      return { rows: res.rows as T[], affectedRows: res.rowCount ?? 0 };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    raw: pool,
  };
}

/**
 * Apply the schema.
 *
 * Statement at a time rather than one multi-statement string, so a failure
 * names the statement that failed instead of the whole schema. Postgres
 * supports every `IF NOT EXISTS` form this schema uses, so unlike the SQLite
 * path there is nothing to special-case.
 */
async function migrate(pool: Pool, schema: string): Promise<void> {
  const { statements } = await import('./sql-compat');
  for (const statement of statements(schema)) {
    try {
      await pool.query(statement);
    } catch (err) {
      const head = statement.slice(0, 90).replace(/\s+/g, ' ');
      throw new Error(`Schema statement failed: ${head}… — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
