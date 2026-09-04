/**
 * The database interface the rest of the codebase calls.
 *
 * Lifted out of `db.ts` so the two drivers can both implement it without
 * either importing the other — the Postgres driver must not pull `@libsql`
 * into a deployed bundle, and the SQLite driver must not pull `pg` into a
 * local one.
 */

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
  affectedRows: number;
};

export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  /**
   * The underlying client, for the rare caller that needs a transaction.
   *
   * Deliberately `unknown`: it is a libSQL `Client` on one driver and a `pg`
   * `Pool` on the other, and nothing outside this module uses it today. A
   * caller that needs it should narrow it and say why.
   */
  raw: unknown;
};
