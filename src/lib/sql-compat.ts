/**
 * Postgres SQL, run on SQLite.
 *
 * ## Why a translator rather than a rewrite
 *
 * There are roughly two hundred queries in this codebase written against
 * Postgres. Rewriting each one by hand is two hundred chances to change a
 * `WHERE` clause by accident, in code that decides what goes onto somebody's
 * job application. Translating a small, closed set of dialect differences in
 * one place is a much smaller thing to get wrong, and the differences that
 * matter here really are small — SQLite has had upsert since 3.24, `FILTER`
 * since 3.30 and `RETURNING` since 3.35, and we are on 3.45.
 *
 * ## What it deliberately does not do
 *
 * Parse SQL. This is a set of targeted substitutions over a dialect we control
 * every line of, not a general Postgres compatibility layer — and the moment it
 * starts trying to be one, it will get something subtly wrong in a query nobody
 * re-reads. Anything it cannot translate is left alone so SQLite reports the
 * error loudly, rather than being silently mangled into something that runs.
 */

/**
 * Casts exist in Postgres to control the wire type. SQLite is dynamically
 * typed, so `count(*)::text` is simply `count(*)` — and the calling code
 * already wraps every numeric read in `Number(...)`, which is what made the
 * cast unnecessary rather than load-bearing.
 */
function casts(sql: string): string {
  return sql.replace(/::\s*(text|int|integer|bigint|float|numeric|boolean)\b/gi, '');
}

/** Postgres spells the scalar maximum `GREATEST`; SQLite spells it `MAX`. */
function scalarMax(sql: string): string {
  return sql.replace(/\bGREATEST\s*\(/gi, 'MAX(');
}

/**
 * Rewrite every parameter marker in source order, expanding array arguments.
 *
 * `col = ANY($1)` has no SQLite equivalent — there is no array type to bind —
 * so it becomes `col IN (?, ?, ?)` with the elements spliced into the parameter
 * list where the array used to be.
 *
 * Done in one left-to-right pass that emits both the new markers and the new
 * parameters together. The alternative — splicing into the middle and
 * renumbering afterwards — shifts every later index, and an off-by-one there
 * produces a query that runs happily and returns the wrong rows.
 */
function expandAndNumber(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  const out: unknown[] = [];

  /* ANY first in the alternation, so an array site is never matched as a bare
     marker. `String.replace` with a function visits matches in source order,
     which is what keeps the emitted list aligned with the emitted markers. */
  const rewritten = sql.replace(
    /([\w."]+)\s*=\s*ANY\s*\(\s*\$(\d+)\s*\)|\$(\d+)/gi,
    (_match, column: string | undefined, arrayIndex: string | undefined, plainIndex: string | undefined) => {
      if (column && arrayIndex) {
        const value = params[Number(arrayIndex) - 1];
        const list = Array.isArray(value) ? value : [value];
        /* An empty list matches nothing. `IN ()` is a syntax error, and
           omitting the predicate would silently match everything. */
        if (list.length === 0) return '0 = 1';
        const marks = list.map((v) => {
          out.push(v);
          return `?${out.length}`;
        });
        return `${column} IN (${marks.join(', ')})`;
      }

      out.push(params[Number(plainIndex) - 1]);
      return `?${out.length}`;
    },
  );

  return { sql: rewritten, params: out };
}

/**
 * SQLite has no `ADD COLUMN IF NOT EXISTS`.
 *
 * Recognised one statement at a time rather than lifted out of the script,
 * because the schema is order-dependent: an index further down references a
 * column one of these adds, so hoisting them to the end produces "no such
 * column: priority" on a fresh database.
 *
 * Applying it conditionally rather than attempting and swallowing the error
 * keeps a genuine mistake in a column definition visible.
 */
export type AddColumn = { table: string; column: string; definition: string };

const ADD_COLUMN = /^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+([\s\S]+)$/i;

export function asAddColumn(statement: string): AddColumn | null {
  const m = statement.trim().match(ADD_COLUMN);
  if (!m) return null;
  return { table: m[1], column: m[2], definition: m[3].trim() };
}

/**
 * Split a multi-statement script.
 *
 * Comments are removed first: they are full of prose containing semicolons and
 * apostrophes, and either would break a naive split.
 */
export function statements(ddl: string): string[] {
  const withoutComments = ddl.replace(/--[^\n]*/g, '');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * SQLite has no boolean type and libSQL will not bind one.
 *
 * Stored as 0/1, which is what `BOOLEAN` affinity means in SQLite anyway. Reads
 * come back as 0/1 and every call site already goes through `Boolean(...)`,
 * which was true before this migration and is why it needed no changes.
 */
export function bindable(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  return value;
}

/** The full translation for one parameterised statement. */
export function translate(sql: string, params: unknown[] = []): { sql: string; params: unknown[] } {
  const { sql: text, params: values } = expandAndNumber(scalarMax(casts(sql)), params);
  return { sql: text, params: values.map(bindable) };
}
