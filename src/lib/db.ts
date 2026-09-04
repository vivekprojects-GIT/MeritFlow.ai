import { createClient, type Client } from '@libsql/client';
import { asAddColumn, statements, translate } from './sql-compat';
import type { Db, QueryResult } from './db-types';

export type { Db, QueryResult };

/**
 * The application database: SQLite, one file, opened through libSQL.
 *
 * ## Why this is no longer Postgres-in-WebAssembly
 *
 * It was PGlite, which is genuinely good at what it does and was the wrong
 * choice here for one reason: it is single-process and locks its data
 * directory. Every consequence of that was a workaround — the background worker
 * could not run beside the dev server, no script could read the database while
 * the app was up, and a dropped lock file was indistinguishable from a live
 * one.
 *
 * That constraint eventually destroyed the development database: a script
 * opened the live directory as a second connection, and the only symptom was an
 * opaque WebAssembly `Aborted()` on every subsequent open, with no
 * `pg_resetwal` to recover with.
 *
 * SQLite has none of those properties. It is a single file with real
 * file-locking, several processes may read it at once, a backup is a file copy,
 * and a corrupt database can be inspected with any SQLite tool on the machine.
 * At the scale this system targets — a thousand new postings a day — it is also
 * comfortably faster than the WebAssembly Postgres it replaces.
 *
 * ## The SQL did not change
 *
 * Queries are still written in Postgres dialect and translated in one place;
 * see `sql-compat.ts` for what that means and what it deliberately refuses to
 * do. Two hundred hand-edited queries would have been two hundred chances to
 * change a `WHERE` clause in code that decides what goes on someone's job
 * application.
 *
 * ## Deployed, it is Postgres again
 *
 * A file is the right local database and the wrong one on a host with an
 * ephemeral filesystem, where a deploy deletes every user, course and saved
 * API key. So when `DATABASE_URL` is set the Postgres driver in
 * `db-postgres.ts` is used instead — and because the SQL never stopped being
 * Postgres, that driver has nothing to translate.
 *
 * Which one is running is deliberately invisible to callers. The only thing
 * that changes is where the bytes live.
 */

export function dataDir(): string {
  /* The variable keeps its old name so every script and test that already sets
     it keeps working. It now names a file rather than a directory. */
  const configured = process.env.PGLITE_DATA_DIR?.trim() || process.env.SQLITE_PATH?.trim();
  if (!configured) return './courseai.db';
  /* A path left over from the PGlite era names a directory; put the database
     file inside it rather than failing. */
  return /\.(db|sqlite|sqlite3)$/i.test(configured) ? configured : `${configured.replace(/[/\\]+$/, '')}.db`;
}

type GlobalWithDb = typeof globalThis & { __courseaiDb?: Promise<Db> };
const g = globalThis as GlobalWithDb;

/**
 * Apply the schema.
 *
 * `ADD COLUMN IF NOT EXISTS` has no SQLite equivalent, so each one is applied
 * only where `PRAGMA table_info` says the column is missing. Attempting it and
 * swallowing the error would also work, and would also swallow a genuine
 * mistake in a column definition.
 */
async function migrate(client: Client, schema: string): Promise<void> {
  /*
   * In source order, always.
   *
   * The schema is order-dependent in both directions: a table must exist before
   * a column is added to it, and a column must exist before an index names it.
   * Hoisting the ALTERs to the end produced "no such column: priority" on a
   * fresh database, because the index that uses it is written above.
   */
  for (const statement of statements(schema)) {
    const add = asAddColumn(statement);

    if (!add) {
      await client.execute(statement);
      continue;
    }

    const info = await client.execute(`PRAGMA table_info(${add.table})`);
    const exists = info.rows.some((r) => String((r as Record<string, unknown>).name) === add.column);
    if (exists) continue;

    /* SQLite cannot add a NOT NULL column without a default to a table that
       already holds rows, which is what every migration here does, so the
       definitions all carry one. A definition that does not is a real error
       worth surfacing rather than swallowing. */
    await client.execute(`ALTER TABLE ${add.table} ADD COLUMN ${add.column} ${add.definition}`);
  }
}

/**
 * The Postgres connection string, when this deployment has one.
 *
 * `DATABASE_URL` is what every managed Postgres sets, Render included. Its
 * presence is the whole switch: no flag to forget, and a local checkout with
 * no such variable keeps the file it has always used.
 */
export function postgresUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

export function getDb(): Promise<Db> {
  if (!g.__courseaiDb) {
    g.__courseaiDb = (async () => {
      const url = postgresUrl();
      if (url) {
        const { createPostgresDb } = await import('./db-postgres');
        return createPostgresDb(url, SCHEMA);
      }

      const client = createClient({ url: `file:${dataDir()}` });

      /* Off by default in SQLite, and this schema relies on it: deleting a user
         is expected to take their sessions, runs and answers with them. */
      await client.execute('PRAGMA foreign_keys = ON');
      /* Write-ahead logging is what makes concurrent readers safe, which is the
         property this whole migration was for. */
      await client.execute('PRAGMA journal_mode = WAL');
      await client.execute('PRAGMA busy_timeout = 5000');

      await migrate(client, SCHEMA);

      const db: Db = {
        async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
          const t = translate(sql, params);
          const res = await client.execute({ sql: t.sql, args: t.params as never });
          return { rows: res.rows as unknown as T[], affectedRows: Number(res.rowsAffected ?? 0) };
        },
        async exec(sql: string) {
          for (const statement of statements(sql)) {
            await client.execute(translate(statement).sql);
          }
        },
        raw: client,
      };

      return db;
    })();
  }
  return g.__courseaiDb;
}

const SCHEMA = `
        CREATE TABLE IF NOT EXISTS users (
          id            TEXT PRIMARY KEY,
          email         TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at    BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token      TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS courses (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title      TEXT NOT NULL,
          subtitle   TEXT NOT NULL DEFAULT '',
          level      TEXT NOT NULL DEFAULT '',
          prompt     TEXT NOT NULL DEFAULT '',
          data       TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );

        ALTER TABLE courses ADD COLUMN IF NOT EXISTS lesson_count INTEGER NOT NULL DEFAULT 0;

        -- Cover photo for the course card, looked up once after generation and
        -- cached here. Nullable: the card falls back to generated artwork.
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_url TEXT;

        -- Student organization ------------------------------------------------
        -- Playlists are user-owned folders for saved courses. A course can live in
        -- more than one playlist, or in none ("outside" any playlist).
        CREATE TABLE IF NOT EXISTS course_playlists (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS course_playlist_items (
          playlist_id TEXT NOT NULL REFERENCES course_playlists(id) ON DELETE CASCADE,
          course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          added_at    BIGINT NOT NULL,
          PRIMARY KEY (playlist_id, course_id)
        );

        CREATE TABLE IF NOT EXISTS course_favorites (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, course_id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tone       TEXT NOT NULL DEFAULT 'info',
          title      TEXT NOT NULL,
          message    TEXT NOT NULL DEFAULT '',
          href       TEXT NOT NULL DEFAULT '',
          read_at    BIGINT,
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS course_progress (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          lesson_key TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, course_id, lesson_key)
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
          user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          plan               TEXT NOT NULL,
          status             TEXT NOT NULL,
          current_period_end BIGINT NOT NULL,
          created_at         BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS purchases (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_id    TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, item_id)
        );

        -- Per-day AI tutor message counter (free tier is rate-limited; Pro is unlimited).
        CREATE TABLE IF NOT EXISTS tutor_usage (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          day     TEXT NOT NULL,
          count   INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, day)
        );

        -- Issued course-completion certificates, verifiable by id.
        CREATE TABLE IF NOT EXISTS certificates (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id    TEXT NOT NULL DEFAULT '',
          course_title TEXT NOT NULL,
          recipient    TEXT NOT NULL,
          score        INTEGER NOT NULL,
          total        INTEGER NOT NULL,
          issued_at    BIGINT NOT NULL
        );

        -- Instructor mode --------------------------------------------------
        -- A user is a 'student' by default; 'instructor' requires an access code at sign-up.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student';
        -- "Just me" and "Student" both signed up as role='student', so a personal
        -- learner was indistinguishable from someone enrolled at a university —
        -- which is why personal accounts were shown Messages, a feature that can
        -- only ever be empty for them. Role stays 'student' so every existing
        -- permission check keeps working; this says which *kind* of student.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'institutional';

        -- A class = a course an instructor published for students to join by code.
        CREATE TABLE IF NOT EXISTS classes (
          id            TEXT PRIMARY KEY,
          instructor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          join_code     TEXT UNIQUE NOT NULL,
          title         TEXT NOT NULL,
          subtitle      TEXT NOT NULL DEFAULT '',
          level         TEXT NOT NULL DEFAULT '',
          data          TEXT NOT NULL,                 -- full EnrichedCourse JSON
          lesson_count  INTEGER NOT NULL DEFAULT 0,
          exam_open     BOOLEAN NOT NULL DEFAULT FALSE, -- final exam is professor-unlocked
          created_at    BIGINT NOT NULL
        );

        -- A student's enrollment in a class, plus their final-exam result.
        CREATE TABLE IF NOT EXISTS enrollments (
          class_id     TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          enrolled_at  BIGINT NOT NULL,
          completed_at BIGINT,
          exam_score   INTEGER,
          exam_total   INTEGER,
          PRIMARY KEY (class_id, student_id)
        );

        -- Messaging -----------------------------------------------------------
        -- One table serves both shapes: a direct message has a recipient, a class
        -- announcement has a class_id and no recipient. Keeping them together means
        -- one inbox query rather than a union of two.
        CREATE TABLE IF NOT EXISTS messages (
          id           TEXT PRIMARY KEY,
          class_id     TEXT REFERENCES classes(id) ON DELETE CASCADE,
          sender_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          body         TEXT NOT NULL,
          created_at   BIGINT NOT NULL,
          read_at      BIGINT
        );

        CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS messages_class_idx ON messages (class_id, created_at DESC);

        -- Discussions ---------------------------------------------------------
        -- A flat thread model: a post with no parent starts a topic, a post with a
        -- parent is a reply to it. One level of nesting is deliberate — deeper
        -- trees are harder to follow and rarely used in a class setting.
        -- lesson_key optionally pins a discussion to a specific lesson.
        CREATE TABLE IF NOT EXISTS discussions (
          id         TEXT PRIMARY KEY,
          class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          parent_id  TEXT REFERENCES discussions(id) ON DELETE CASCADE,
          author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lesson_key TEXT,
          title      TEXT NOT NULL DEFAULT '',
          body       TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          -- Pinned topics sort first; instructors set this.
          pinned     BOOLEAN NOT NULL DEFAULT FALSE
        );

        CREATE INDEX IF NOT EXISTS discussions_class_idx ON discussions (class_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS discussions_parent_idx ON discussions (parent_id, created_at ASC);

        -- Class materials ------------------------------------------------------
        -- Files a professor shares with a class (slides, readings, the source PDF).
        -- Stored as a data URL like assignment submissions, so there is no external
        -- object store to configure for a self-hosted deployment.
        CREATE TABLE IF NOT EXISTS class_materials (
          id          TEXT PRIMARY KEY,
          class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          mime_type   TEXT NOT NULL DEFAULT '',
          size_bytes  INTEGER NOT NULL DEFAULT 0,
          data_url    TEXT NOT NULL,
          created_at  BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS class_materials_class_idx ON class_materials (class_id, created_at DESC);

        -- Per-student lesson completion within a class.
        CREATE TABLE IF NOT EXISTS class_progress (
          class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lesson_key TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (class_id, student_id, lesson_key)
        );

        -- Multi-tenant: universities (each has one admin), professor invite codes, and
        -- a university_id stamped on users + classes. role gains an 'admin' value (no DDL).
        ALTER TABLE users ADD COLUMN IF NOT EXISTS university_id TEXT;
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS university_id TEXT;

        -- Join codes are short-lived: a code is only valid until this timestamp, so
        -- a leaked/shared code can't be reused. The professor regenerates on demand.
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS join_code_expires_at BIGINT;

        -- Profiles: display name, avatar (base64 data URL, size-capped), headline, bio.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS headline TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

        -- The rest of a person. Every column is optional and every one is
        -- nullable: a profile form that demands a phone number and a birthday
        -- before it will save is a form people abandon. Date of birth is stored
        -- as a plain ISO date string rather than a timestamp — nobody was born
        -- at a time zone, and BIGINT epochs shift the date across the world.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone      TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT;   -- YYYY-MM-DD
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns   TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS location   TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone   TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS website    TEXT;
        -- Role-specific, but on one table: a professor's department and a
        -- student's programme are the same shape, and splitting them into two
        -- tables would double every read for no gain.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id TEXT;

        -- JobPilot ------------------------------------------------------------
        -- Career tooling for learners. Professors and admins never see this:
        -- an institution's staff have no business being shown their students'
        -- job search, and the feature is gated on role at every entry point.

        -- The Candidate Digital Twin (spec section 11). One row per learner.
        -- Skills and evidence are JSON rather than side tables because they are
        -- always read as a whole document and never queried across users.
        CREATE TABLE IF NOT EXISTS candidate_profiles (
          user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          career_stage TEXT NOT NULL DEFAULT '',      -- college_senior, new_grad, ...
          target_roles TEXT NOT NULL DEFAULT '[]',    -- JSON string[]
          locations    TEXT NOT NULL DEFAULT '[]',    -- JSON string[]
          tracks       TEXT NOT NULL DEFAULT '[]',    -- JSON {type,weight}[]
          skills       TEXT NOT NULL DEFAULT '[]',    -- JSON {name,evidence}[]
          min_comp     INTEGER,
          resume_text  TEXT NOT NULL DEFAULT '',      -- extracted, never rendered raw
          resume_name  TEXT NOT NULL DEFAULT '',
          updated_at   BIGINT NOT NULL
        );

        -- When the candidate finished the setup wizard.
        --
        -- Completion used to be inferred: "has target roles, or has resume
        -- text". The wizard collects neither -- it asks about address, work
        -- eligibility and preferences -- so pressing "Finish setup" saved
        -- everything, returned 200, and dropped the candidate back on step one
        -- of the same wizard, permanently. Nobody could reach the product.
        --
        -- Recorded as a fact rather than derived from unrelated fields.
        ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS onboarded_at BIGINT NOT NULL DEFAULT 0;

        -- The company registry: the foundation of discovery.
        --
        -- Coverage used to be a hardcoded array of fourteen board tokens in
        -- jobs-ingest-ats.ts. That is a fine way to prove the collectors work
        -- and a hopeless way to reach the tens of thousands of employers a real
        -- job search has to see. The insight it was missing is that companies
        -- are not the unit of engineering work -- applicant tracking systems
        -- are. Thousands of employers run Greenhouse; one Greenhouse collector
        -- serves all of them, given a list of tenants.
        --
        -- So this table is the list. One row per employer, carrying which
        -- platform they run and the identifier that platform knows them by.
        -- Growing coverage becomes data entry, not engineering.
        CREATE TABLE IF NOT EXISTS companies (
          id             TEXT PRIMARY KEY,
          name           TEXT NOT NULL,
          -- The employer's own careers page, which is what a person would find.
          career_url     TEXT NOT NULL DEFAULT '',
          -- greenhouse | lever | ashby | workday | smartrecruiters | icims |
          -- successfactors | taleo | custom | unknown
          ats_type       TEXT NOT NULL DEFAULT 'unknown',
          -- The tenant handle: a Greenhouse board token, a Workday subdomain.
          -- Empty when detection has not run or could not find one.
          ats_identifier TEXT NOT NULL DEFAULT '',
          country        TEXT NOT NULL DEFAULT '',
          -- Scheduling state. last_scanned drives the queue: oldest first.
          last_scanned   BIGINT NOT NULL DEFAULT 0,
          scan_status    TEXT NOT NULL DEFAULT 'pending',  -- pending|ok|empty|failed|unsupported
          scan_note      TEXT NOT NULL DEFAULT '',
          job_count      INTEGER NOT NULL DEFAULT 0,
          -- Consecutive failures. Drives exponential backoff, so a company that
          -- has left its vendor stops costing a request every cycle.
          failure_count  INTEGER NOT NULL DEFAULT 0,
          created_at     BIGINT NOT NULL,
          updated_at     BIGINT NOT NULL
        );

        -- The company's own domain, kept separate from the careers URL.
        --
        -- A bulk import gives us a website and nothing else. That is enough to
        -- probe the vendor APIs directly, which is cheaper and more decisive
        -- than guessing a careers path and reading whatever comes back.
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT '';

        -- Where this row came from, and how hard it is worth working.
        -- A|B|C, set by the source list from industry and headcount.
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'B';
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'seed';
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT '';

        -- Detection walks the registry priority-first, so the index has to
        -- carry the same order the queue reads in.
        CREATE INDEX IF NOT EXISTS companies_detect_idx ON companies (priority, failure_count, updated_at);

        -- The collector queue is "oldest scan first, skip what is backing off",
        -- so those two columns are what it sorts and filters on.
        CREATE INDEX IF NOT EXISTS companies_due_idx ON companies (last_scanned);
        CREATE INDEX IF NOT EXISTS companies_ats_idx ON companies (ats_type);
        -- One row per employer per platform identity.
        CREATE UNIQUE INDEX IF NOT EXISTS companies_identity_idx
          ON companies (ats_type, ats_identifier)
          WHERE ats_identifier <> '';

        -- Canonical jobs. Deduplicated on (company, normalized title, location)
        -- per spec section 13, so the same posting from two sources is one row.
        CREATE TABLE IF NOT EXISTS jobs (
          id           TEXT PRIMARY KEY,
          company      TEXT NOT NULL,
          title        TEXT NOT NULL,
          norm_title   TEXT NOT NULL,
          location     TEXT NOT NULL DEFAULT '',
          remote       BOOLEAN NOT NULL DEFAULT FALSE,
          track        TEXT NOT NULL DEFAULT 'entry_level',
          description  TEXT NOT NULL DEFAULT '',
          skills       TEXT NOT NULL DEFAULT '[]',    -- JSON string[] required skills
          min_comp     INTEGER,
          url          TEXT NOT NULL DEFAULT '',
          source       TEXT NOT NULL DEFAULT 'seed',
          posted_at    BIGINT,
          detected_at  BIGINT NOT NULL,
          last_seen_at BIGINT NOT NULL,
          status       TEXT NOT NULL DEFAULT 'open'
        );
        CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_idx ON jobs (company, norm_title, location);

        -- Fields the job card shows. Each is nullable: a posting that omits one
        -- renders without that row rather than with an invented value.
        -- How a posting was discovered, so "How did you hear about this job?"
        -- has a true answer instead of a guess.
        --
        -- A posting read from an employer's own Greenhouse board was found on
        -- their careers site, and saying so is a fact. Claiming a referral we
        -- cannot evidence would be a lie an employer acts on -- referrals are
        -- routed differently and sometimes paid for -- so REFERRAL is only ever
        -- set from an explicit record, never inferred.
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT '';
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';

        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_blurb TEXT NOT NULL DEFAULT '';
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS seniority     TEXT NOT NULL DEFAULT '';
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS years_exp     TEXT NOT NULL DEFAULT '';
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS employment    TEXT NOT NULL DEFAULT '';
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_mode     TEXT NOT NULL DEFAULT '';
        -- Applicant count when the source reports one. Null means unknown, and
        -- unknown is rendered as nothing: a fabricated "100+ applicants" would
        -- change whether someone bothers to apply.
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applicants    INTEGER;

        -- One application per (user, job) — the duplicate-prevention rule from
        -- spec section 16, enforced by the primary key rather than by a check
        -- that a retry could race past.
        CREATE TABLE IF NOT EXISTS job_applications (
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          state        TEXT NOT NULL DEFAULT 'MATCHED',
          score        INTEGER NOT NULL DEFAULT 0,
          score_parts  TEXT NOT NULL DEFAULT '{}',    -- JSON, so a score is explainable
          resume_note  TEXT NOT NULL DEFAULT '',
          gaps         TEXT NOT NULL DEFAULT '[]',    -- JSON string[] unmet requirements
          created_at   BIGINT NOT NULL,
          updated_at   BIGINT NOT NULL,
          PRIMARY KEY (user_id, job_id)
        );
        CREATE INDEX IF NOT EXISTS job_apps_user_idx ON job_applications (user_id, updated_at DESC);

        -- Career Autopilot ----------------------------------------------------

        -- What the user permits Autopilot to do on their behalf. One row per
        -- learner; absent means Autopilot has never been configured, which is
        -- treated as OFF rather than as defaults.
        CREATE TABLE IF NOT EXISTS autopilot_policies (
          user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          mode             TEXT NOT NULL DEFAULT 'MANUAL',   -- MANUAL | SMART | FULL
          min_score        INTEGER NOT NULL DEFAULT 88,
          tracks           TEXT NOT NULL DEFAULT '[]',       -- JSON Track[]
          min_comp         INTEGER,
          locations        TEXT NOT NULL DEFAULT '[]',       -- JSON string[]
          max_job_age_hrs  INTEGER NOT NULL DEFAULT 168,
          allow_staffing   BOOLEAN NOT NULL DEFAULT FALSE,
          allow_contract   BOOLEAN NOT NULL DEFAULT FALSE,
          allow_clearance  BOOLEAN NOT NULL DEFAULT FALSE,
          max_per_day      INTEGER NOT NULL DEFAULT 20,
          max_per_company  INTEGER NOT NULL DEFAULT 2,
          max_active       INTEGER NOT NULL DEFAULT 150,
          updated_at       BIGINT NOT NULL
        );

        -- The Answer Vault. Keyed by canonical intent, not by question wording,
        -- so "Will you require sponsorship?" and "Do you need immigration
        -- sponsorship?" resolve to the same verified answer.
        CREATE TABLE IF NOT EXISTS answer_vault (
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          intent       TEXT NOT NULL,                        -- e.g. WORK_AUTH.SPONSORSHIP
          value        TEXT NOT NULL,
          provenance   TEXT NOT NULL,                        -- USER_VERIFIED | PROFILE_DERIVED | RESUME_EVIDENCE
          verified     BOOLEAN NOT NULL DEFAULT FALSE,
          sensitivity  TEXT NOT NULL DEFAULT 'NORMAL_FACT',  -- see QuestionClass
          -- Whether Autopilot may use this without asking again. A legal
          -- attestation is stored but never marked autopilot-safe.
          autopilot_ok BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at   BIGINT NOT NULL,
          PRIMARY KEY (user_id, intent)
        );

        -- The question as the employer worded it.
        --
        -- Canonical intents do not need this: WORK_AUTH.SPONSORSHIP means the
        -- same thing whoever asked. A learned answer does — it exists precisely
        -- because no intent recognised the question, so the wording is the only
        -- thing that identifies it, both for matching it again and for showing
        -- the candidate what they are editing.
        ALTER TABLE answer_vault ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';

        -- Durable per-application workflow state. Separate from job_applications
        -- (which is the learner's own tracker) because this is machine state
        -- with an idempotency key and a retry count, and conflating the two is
        -- how a UI click ends up able to move a worker's state.
        CREATE TABLE IF NOT EXISTS autopilot_runs (
          id              TEXT PRIMARY KEY,
          user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          state           TEXT NOT NULL DEFAULT 'DISCOVERED',
          -- Stable across retries: a worker that times out and is replayed must
          -- resume the same run rather than start a second one.
          idempotency_key TEXT NOT NULL UNIQUE,
          execution_policy TEXT NOT NULL DEFAULT 'UNREVIEWED',
          score           INTEGER NOT NULL DEFAULT 0,
          verifier        TEXT NOT NULL DEFAULT '{}',        -- JSON VerifierResult
          receipt         TEXT NOT NULL DEFAULT '{}',        -- JSON ApplicationReceipt
          blocked_reason  TEXT NOT NULL DEFAULT '',
          attempts        INTEGER NOT NULL DEFAULT 0,
          created_at      BIGINT NOT NULL,
          updated_at      BIGINT NOT NULL,
          -- The duplicate-prevention rule: one run per candidate per job, ever.
          UNIQUE (user_id, job_id)
        );
        -- The role this run applied for, independent of which job row it used.
        --
        -- idempotency_key above is per (user, job) and stops a replayed worker
        -- starting a second run. This is per (user, company, normalised title)
        -- and stops something the other cannot see: the same posting ingested
        -- twice under two ids, which produces two runs that each believe they
        -- are the first.
        ALTER TABLE autopilot_runs ADD COLUMN IF NOT EXISTS application_key TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS autopilot_runs_appkey_idx ON autopilot_runs (user_id, application_key);

        -- Every value that was put on an application, and where it came from.
        --
        -- The receipt already shows this to the candidate, but a receipt is one
        -- JSON blob on one run: it cannot answer "what have we ever told an
        -- employer about my work authorisation", and it is rewritten when a run
        -- is re-prepared. This is append-only, so the answer to "what exactly
        -- did we submit, and on what basis" survives.
        CREATE TABLE IF NOT EXISTS application_audit (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          run_id      TEXT NOT NULL,
          job_id      TEXT NOT NULL,
          field       TEXT NOT NULL,        -- the form's own field id
          question    TEXT NOT NULL,        -- the employer's wording
          answer      TEXT NOT NULL,
          source      TEXT NOT NULL,        -- profile | vault | resume | file | generated
          -- 0..100. Never the thing that authorises submission on its own, but
          -- the thing that explains a decision after the fact.
          confidence  INTEGER NOT NULL DEFAULT 0,
          submitted   BOOLEAN NOT NULL DEFAULT FALSE,
          created_at  BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS application_audit_run_idx ON application_audit (run_id);
        CREATE INDEX IF NOT EXISTS application_audit_user_idx ON application_audit (user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS autopilot_runs_user_idx ON autopilot_runs (user_id, updated_at DESC);

        -- Append-only activity log. This is what the live Autopilot feed reads,
        -- and what answers "why did it apply to that?" months later.
        CREATE TABLE IF NOT EXISTS autopilot_events (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          run_id     TEXT,
          kind       TEXT NOT NULL,
          summary    TEXT NOT NULL,
          detail     TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS autopilot_events_user_idx ON autopilot_events (user_id, created_at DESC);

        -- JobPilot settings. One row per learner, created lazily on first save.
        CREATE TABLE IF NOT EXISTS job_settings (
          user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          -- off | honest | aggressive. Governs how far a tailored resume may
          -- stray from the uploaded one; the verifier still blocks unsupported
          -- claims regardless of this setting.
          optimization      TEXT NOT NULL DEFAULT 'honest',
          auto_approve      BOOLEAN NOT NULL DEFAULT FALSE,
          review_before     BOOLEAN NOT NULL DEFAULT TRUE,
          public_portfolio  BOOLEAN NOT NULL DEFAULT FALSE,
          -- A dedicated address used only on applications, so recruiter mail and
          -- ATS verification codes never mix with personal email. The local part
          -- is generated once and never reissued.
          apply_alias       TEXT UNIQUE,
          email_recs        BOOLEAN NOT NULL DEFAULT TRUE,
          email_product     BOOLEAN NOT NULL DEFAULT TRUE,
          email_paused_until BIGINT,
          timezone          TEXT NOT NULL DEFAULT '',
          referral_code     TEXT UNIQUE,
          updated_at        BIGINT NOT NULL
        );
        -- Send applications without asking each time.
        --
        -- Off by default and never flipped on implicitly. This is the switch
        -- that turns a prepared application into one an employer receives, so
        -- it is stored per user rather than inferred from other settings.
        ALTER TABLE job_settings ADD COLUMN IF NOT EXISTS auto_submit BOOLEAN NOT NULL DEFAULT FALSE;

        -- Secret for the subscribable calendar feed.
        --
        -- Calendar clients poll a URL without cookies, so the URL itself has to
        -- carry the authorisation. Unguessable and revocable by regenerating,
        -- which is how every private ICS address works.
        -- Uniqueness as an index rather than a column constraint: SQLite
        -- cannot add a UNIQUE column to an existing table, and Postgres
        -- implements the constraint as an index regardless. Partial, so the
        -- many rows with no token yet do not collide with each other.
        ALTER TABLE job_settings ADD COLUMN IF NOT EXISTS calendar_token TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS job_settings_calendar_token_idx
          ON job_settings (calendar_token) WHERE calendar_token IS NOT NULL AND calendar_token <> '';

        -- The browser extension authenticates with this rather than a cookie.
        -- A separate, revocable credential: the extension runs on employer
        -- pages, and a session cookie shared with arbitrary origins is a much
        -- larger thing to hand out than a token that only reads a profile.
        ALTER TABLE job_settings ADD COLUMN IF NOT EXISTS extension_token TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS job_settings_extension_token_idx
          ON job_settings (extension_token) WHERE extension_token IS NOT NULL AND extension_token <> '';

        -- Autonomous mode. The worker process picks up every account with
        -- this set, so the pipeline keeps running with the site closed --
        -- which is the whole promise, and was not true while the batch only
        -- ever ran inside an HTTP request.
        ALTER TABLE job_settings ADD COLUMN IF NOT EXISTS autonomous BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE job_settings ADD COLUMN IF NOT EXISTS autonomous_last_run_at BIGINT NOT NULL DEFAULT 0;

        -- What the reliability harness last observed per ATS. The half of the
        -- registry that cannot be written by hand: a row saying an ATS is
        -- supported is a claim from whenever someone typed it, and employers
        -- change their forms constantly.
        CREATE TABLE IF NOT EXISTS ats_health (
          vendor     TEXT PRIMARY KEY,
          attempted  INTEGER NOT NULL DEFAULT 0,
          complete   INTEGER NOT NULL DEFAULT 0,
          checked_at BIGINT  NOT NULL DEFAULT 0
        );

        -- Covering indexes for the foreign keys every page filters on.
        --
        -- Primary and unique keys were already indexed, so lookups by id or
        -- email were fine. These are the other half: "everything belonging to
        -- this user", which is the shape of almost every read in the app and
        -- was a sequential scan on each one.
        CREATE INDEX IF NOT EXISTS courses_user_idx        ON courses (user_id);
        CREATE INDEX IF NOT EXISTS sessions_user_idx       ON sessions (user_id);
        -- Consent the candidate has explicitly given.
        --
        -- Separate from the answer vault because facts and permissions behave
        -- differently in every way that matters: a permission can be revoked,
        -- can expire, and is bound to text the other party may rewrite. One
        -- shared "verified" flag standing for both "this is my phone number"
        -- and "I agree to binding arbitration" is one relaxation away from
        -- disaster.
        --
        -- Nothing writes here except an explicit act by the person.
        CREATE TABLE IF NOT EXISTS authorizations (
          id                      TEXT PRIMARY KEY,
          user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          authorization_type      TEXT NOT NULL,      -- POLICY | ACKNOWLEDGEMENT | ...
          scope                   TEXT NOT NULL,      -- an employer, or * for a class
          authorized_by_user      BOOLEAN NOT NULL DEFAULT FALSE,
          authorized_at           BIGINT NOT NULL,
          allowed_for_auto_submit BOOLEAN NOT NULL DEFAULT FALSE,
          policy_url              TEXT NOT NULL DEFAULT '',
          policy_hash             TEXT NOT NULL DEFAULT '',
          -- Of the exact wording consent was given against. When an employer
          -- rewrites the checkbox, this stops matching and the run stops --
          -- consent to a document is not consent to its successor.
          text_hash               TEXT NOT NULL DEFAULT '',
          expires_at              BIGINT,
          revoked_at              BIGINT,
          notes                   TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS authorizations_user_idx ON authorizations (user_id, authorization_type);

        -- How one employer's wording maps to a question we know.
        --
        -- Every intent used to be a hand-written pattern, and every new phrasing
        -- broke one -- ten were repaired by hand in a single session, each
        -- covering exactly one wording. Matching phrasing is a language problem;
        -- a model does it once per novel wording and the answer is cached here,
        -- after which it is deterministic and free.
        --
        -- An empty intent is a remembered refusal, so an unanswerable question
        -- is not re-asked on every form.
        CREATE TABLE IF NOT EXISTS question_routes (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          route_key  TEXT NOT NULL,
          question   TEXT NOT NULL DEFAULT '',
          intent     TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, route_key)
        );

        -- Never stop to ask; move to the next posting instead.
        --
        -- The candidate's promise is "you have my résumé, handle it". Parking an
        -- application because one employer asked something unusual breaks that
        -- promise and leaves a queue nobody works through. With a thousand open
        -- postings, losing a few to odd questions costs nothing.
        --
        -- This never widens what may be answered. It changes what happens when
        -- nothing can answer: skip rather than interrupt.
        -- Whether an ageing posting has to score higher to qualify.
        --
        -- Defaults on, which is the conservative reading: an old posting has
        -- more applicants and is a worse bet. A candidate whose reachable
        -- boards are all older than a week turns it off, and their own fit
        -- floor becomes the whole test.
        ALTER TABLE autopilot_policies ADD COLUMN IF NOT EXISTS age_escalation BOOLEAN NOT NULL DEFAULT TRUE;

        ALTER TABLE autopilot_policies ADD COLUMN IF NOT EXISTS never_ask BOOLEAN NOT NULL DEFAULT FALSE;

        CREATE INDEX IF NOT EXISTS answer_vault_user_idx   ON answer_vault (user_id);
        CREATE INDEX IF NOT EXISTS enrollments_student_idx ON enrollments (student_id);
        CREATE INDEX IF NOT EXISTS enrollments_class_idx   ON enrollments (class_id);
        CREATE INDEX IF NOT EXISTS classes_instructor_idx  ON classes (instructor_id);
        CREATE INDEX IF NOT EXISTS progress_user_idx       ON course_progress (user_id, course_id);
        CREATE INDEX IF NOT EXISTS notifications_user_idx  ON notifications (user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS certificates_user_idx   ON certificates (user_id);
        CREATE INDEX IF NOT EXISTS autopilot_events_user_idx ON autopilot_events (user_id, created_at DESC);
        -- Session cleanup scans by expiry rather than by user.
        CREATE INDEX IF NOT EXISTS sessions_expiry_idx     ON sessions (expires_at);

        -- Named résumé and cover-letter variants.
        --
        -- One résumé is wrong for anyone applying to two kinds of role. The
        -- candidate_profiles row keeps whichever is active, so matching and
        -- tailoring are unaffected; this table is the set to choose from.
        CREATE TABLE IF NOT EXISTS documents (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          -- 'resume' | 'cover_letter'
          kind       TEXT NOT NULL DEFAULT 'resume',
          name       TEXT NOT NULL,
          body       TEXT NOT NULL DEFAULT '',
          file_name  TEXT NOT NULL DEFAULT '',
          -- Presentation, stored per document so a template choice survives.
          template   TEXT NOT NULL DEFAULT 'standard',
          font       TEXT NOT NULL DEFAULT 'sans',
          font_size  REAL NOT NULL DEFAULT 10.5,
          -- Exactly one resume per user is the active one. Enforced in code
          -- rather than by constraint: a partial unique index would make
          -- switching a two-statement operation that can fail halfway.
          is_active  BOOLEAN NOT NULL DEFAULT FALSE,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id, kind, updated_at DESC);
        -- The résumé as structured JSON: contact, sections, entries, bullets.
        -- The body column stays as the flattened text, because matching,
        -- tailoring and the evidence check all read plain text and should not
        -- each learn the document shape.
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS structured TEXT NOT NULL DEFAULT '';
        -- The text exactly as it was extracted from the upload, written once
        -- and never rewritten. The body column is regenerated from the
        -- structured document on every save, so without this a section the
        -- parser failed to recognise would be lost the first time the
        -- candidate pressed Save.
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_text TEXT NOT NULL DEFAULT '';
        -- Which build of the parser produced the structured document.
        -- Without it a résumé parsed badly by an older parser keeps that
        -- result forever, because the backfill only looked for documents with
        -- no structure at all — so a fix to the parser reached new uploads
        -- and nobody who had already imported.
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS parser_version INTEGER NOT NULL DEFAULT 0;

        -- Outbound mail the candidate sent from their application address.
        CREATE TABLE IF NOT EXISTS outbound_mail (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_addr    TEXT NOT NULL,
          subject    TEXT NOT NULL DEFAULT '',
          body       TEXT NOT NULL DEFAULT '',
          -- Set when this is a reply, so a thread can be reconstructed.
          reply_to_id TEXT,
          -- 'sent' | 'failed'. Failures are kept: a message the candidate
          -- believes went out and did not is the worst outcome here.
          status     TEXT NOT NULL DEFAULT 'sent',
          error      TEXT NOT NULL DEFAULT '',
          sent_at    BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS outbound_mail_user_idx ON outbound_mail (user_id, sent_at DESC);

        -- Monthly application allowance for the free plan.
        CREATE TABLE IF NOT EXISTS usage_counters (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          -- 'YYYY-MM', so a month rolls over without a scheduled job.
          period     TEXT NOT NULL,
          kind       TEXT NOT NULL,
          count      INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, period, kind)
        );

        -- A run that cleared every check and is waiting only on the candidate
        -- pressing send. Stored rather than derived so the approval queue
        -- survives a page refresh and cannot disagree with what the run did.
        ALTER TABLE autopilot_runs ADD COLUMN IF NOT EXISTS awaiting_approval BOOLEAN NOT NULL DEFAULT FALSE;

        -- Mail received at a user's apply alias.
        --
        -- The address is a catch-all on a domain we own; an inbound webhook
        -- posts each message here. Storing it is what makes the alias useful
        -- rather than decorative: verification codes reach the application
        -- flow, and recruiter replies can be forwarded to the personal inbox.
        CREATE TABLE IF NOT EXISTS inbound_mail (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          -- Local part the message was addressed to, kept so a message can be
          -- traced back even if the alias is later reassigned.
          alias        TEXT NOT NULL,
          from_addr    TEXT NOT NULL DEFAULT '',
          from_name    TEXT NOT NULL DEFAULT '',
          subject      TEXT NOT NULL DEFAULT '',
          body         TEXT NOT NULL DEFAULT '',
          -- A one-time code found in the message, when one is clearly present.
          otp          TEXT NOT NULL DEFAULT '',
          -- Best guess at which employer sent it, for threading onto a run.
          company      TEXT NOT NULL DEFAULT '',
          received_at  BIGINT NOT NULL,
          -- When the copy to the user's personal inbox went out. Null until it
          -- does, so a forwarding outage is visible rather than silent.
          forwarded_at BIGINT,
          read_at      BIGINT
        );
        CREATE INDEX IF NOT EXISTS inbound_mail_user_idx ON inbound_mail (user_id, received_at DESC);
        -- What kind of message this is: VERIFICATION, REJECTION, INTERVIEW,
        -- ASSESSMENT, REMINDER, OFFER, APPLIED, OTHER. Classified on arrival so
        -- the inbox can be filtered without re-reading every body.
        ALTER TABLE inbound_mail ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'OTHER';
        -- Job this message relates to, when it could be matched confidently.
        ALTER TABLE inbound_mail ADD COLUMN IF NOT EXISTS job_id TEXT;

        -- What was actually sent, frozen at the moment of sending.
        --
        -- Postings are edited and taken down, and a tailored resume is
        -- regenerated per application. Without a snapshot, "what did I send
        -- them?" becomes unanswerable within a week — which is exactly when an
        -- interview call arrives and the candidate needs to reread it.
        CREATE TABLE IF NOT EXISTS application_archive (
          id             TEXT PRIMARY KEY,
          user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          job_id         TEXT NOT NULL,
          company        TEXT NOT NULL DEFAULT '',
          title          TEXT NOT NULL DEFAULT '',
          job_url        TEXT NOT NULL DEFAULT '',
          -- The posting as it read when we applied, not as it reads today.
          jd_snapshot    TEXT NOT NULL DEFAULT '',
          resume_summary TEXT NOT NULL DEFAULT '',
          resume_bullets TEXT NOT NULL DEFAULT '[]',
          cover_letter   TEXT NOT NULL DEFAULT '',
          answers        TEXT NOT NULL DEFAULT '[]',
          ats            TEXT NOT NULL DEFAULT '',
          mode           TEXT NOT NULL DEFAULT 'DRY_RUN',
          reference      TEXT NOT NULL DEFAULT '',
          submitted_at   BIGINT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS application_archive_uniq ON application_archive (user_id, job_id, submitted_at);
        CREATE INDEX IF NOT EXISTS application_archive_user_idx ON application_archive (user_id, submitted_at DESC);

        -- Interviews and other scheduled events.
        --
        -- Detected from inbound mail, but always editable: a parser reading a
        -- date out of prose will sometimes be wrong, and a wrong interview time
        -- is worse than no interview time. Everything here can be corrected,
        -- and the source column records whether a human or the parser set it.
        CREATE TABLE IF NOT EXISTS interviews (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          job_id       TEXT,
          company      TEXT NOT NULL DEFAULT '',
          title        TEXT NOT NULL DEFAULT '',
          -- INTERVIEW | ASSESSMENT | CALL | OTHER
          kind         TEXT NOT NULL DEFAULT 'INTERVIEW',
          starts_at    BIGINT,
          duration_min INTEGER NOT NULL DEFAULT 60,
          location     TEXT NOT NULL DEFAULT '',
          notes        TEXT NOT NULL DEFAULT '',
          -- 'detected' when a parser found it, 'user' once a person confirms.
          source       TEXT NOT NULL DEFAULT 'user',
          confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
          mail_id      TEXT,
          created_at   BIGINT NOT NULL,
          updated_at   BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS interviews_user_idx ON interviews (user_id, starts_at);
        -- Providers retry on non-2xx, so the same message can arrive twice.
        -- The provider's own id is the dedupe key.
        CREATE UNIQUE INDEX IF NOT EXISTS inbound_mail_provider_idx ON inbound_mail (id);

        -- Assessment gating --------------------------------------------------
        -- A professor controls when each assessment opens. classes.exam_open
        -- already covered the final exam for the whole class; this covers module
        -- quizzes too, and adds per-student overrides for the cases that
        -- actually come up: an accommodation, a make-up, or a retake for one
        -- person without reopening the assessment for everyone.
        --
        -- Absent row means "follow the class default", so switching a class
        -- open or shut does not have to touch every learner.
        CREATE TABLE IF NOT EXISTS assessment_gates (
          class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          -- exam, or quiz:N for module N
          gate_key   TEXT NOT NULL,
          open       BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (class_id, gate_key)
        );

        CREATE TABLE IF NOT EXISTS assessment_overrides (
          class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          gate_key   TEXT NOT NULL,
          -- TRUE opens it for this learner even when the class is shut;
          -- FALSE shuts it for them even when the class is open.
          open       BOOLEAN NOT NULL,
          reason     TEXT NOT NULL DEFAULT '',
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (class_id, student_id, gate_key)
        );

        CREATE TABLE IF NOT EXISTS universities (
          id         TEXT PRIMARY KEY,
          slug       TEXT UNIQUE NOT NULL,
          name       TEXT NOT NULL,
          logo_url   TEXT,
          admin_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL
        );

        -- Single sign-on ------------------------------------------------------
        -- Per-university OIDC. A university with an issuer configured can sign its
        -- people in with their institutional account instead of a password.
        -- The client secret is stored as given; treat the database as sensitive.
        ALTER TABLE universities ADD COLUMN IF NOT EXISTS sso_issuer TEXT;
        ALTER TABLE universities ADD COLUMN IF NOT EXISTS sso_client_id TEXT;
        ALTER TABLE universities ADD COLUMN IF NOT EXISTS sso_client_secret TEXT;
        -- Comma-separated email domains this IdP is allowed to assert. Without it
        -- a misconfigured or hostile IdP could claim any address, including one
        -- that already belongs to another university's user.
        ALTER TABLE universities ADD COLUMN IF NOT EXISTS sso_domains TEXT;

        -- Short-lived per-attempt state: PKCE verifier, CSRF state, replay nonce.
        CREATE TABLE IF NOT EXISTS sso_attempts (
          state         TEXT PRIMARY KEY,
          university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
          code_verifier TEXT NOT NULL,
          nonce         TEXT NOT NULL,
          created_at    BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS professor_codes (
          code          TEXT PRIMARY KEY,
          university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
          label         TEXT NOT NULL DEFAULT '',
          used_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
          used_at       BIGINT,
          created_at    BIGINT NOT NULL
        );

        -- Assignments a professor sets on a class, and student submissions (graded by the professor).
        CREATE TABLE IF NOT EXISTS assignments (
          id           TEXT PRIMARY KEY,
          class_id     TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          title        TEXT NOT NULL,
          instructions TEXT NOT NULL DEFAULT '',
          rubric       TEXT NOT NULL DEFAULT '',
          points       INTEGER NOT NULL DEFAULT 100,
          due_at       BIGINT,
          created_at   BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS submissions (
          assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
          student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text          TEXT NOT NULL DEFAULT '',
          link          TEXT NOT NULL DEFAULT '',
          file_name     TEXT,
          file_data     TEXT,                       -- data URL (size-capped) or null
          submitted_at  BIGINT NOT NULL,
          grade         INTEGER,                     -- points awarded, null until graded
          feedback      TEXT,
          graded_at     BIGINT,
          PRIMARY KEY (assignment_id, student_id)
        );

        -- Per-question responses. Until now only the aggregate score was kept,
        -- which cannot answer "is question 4 broken?" — the most useful thing a
        -- professor can learn from an assessment. One row per answered question.
        -- quiz_key is 'exam' or 'module:<n>' so both surfaces share a table.
        CREATE TABLE IF NOT EXISTS quiz_responses (
          class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          quiz_key    TEXT NOT NULL,
          q_index     INTEGER NOT NULL,
          prompt      TEXT NOT NULL DEFAULT '',
          chosen      INTEGER NOT NULL,
          correct_idx INTEGER NOT NULL,
          answered_at BIGINT NOT NULL,
          -- One row per student per question: a retake overwrites rather than
          -- double-counting the same learner in the difficulty statistics.
          PRIMARY KEY (class_id, student_id, quiz_key, q_index)
        );

        -- Reading an individual student's record is a FERPA-relevant act, so it
        -- leaves a trail. Append-only: nothing in the app updates or deletes.
        CREATE TABLE IF NOT EXISTS audit_log (
          id         TEXT PRIMARY KEY,
          actor_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action     TEXT NOT NULL,
          subject    TEXT NOT NULL DEFAULT '',
          detail     TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);

        -- Pacing: how many weeks the class is meant to take. "Behind" is
        -- meaningless without a schedule to be behind, and comparing a learner
        -- only against peers hides a cohort that is uniformly late.
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS pace_weeks INTEGER NOT NULL DEFAULT 12;
        -- Term label for cohort comparison; blank until an admin sets one.
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT '';

        -- Career identity: the links that make up a candidate's professional
        -- presence. Kept beside the other profile columns because they are
        -- facts about the person, not about any one application.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS github_url    TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url  TEXT;
        -- Where the generated portfolio is published. Empty until the person
        -- publishes it themselves; no build ever writes this.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_url TEXT;

        -- The last GitHub read, cached. GitHub rate-limits unauthenticated
        -- reads at 60 an hour, which one portfolio rebuild can exhaust on its
        -- own, and repositories do not change between page loads.
        CREATE TABLE IF NOT EXISTS github_snapshots (
          user_id    TEXT PRIMARY KEY,
          username   TEXT   NOT NULL DEFAULT '',
          repos      TEXT   NOT NULL DEFAULT '',
          fetched_at BIGINT NOT NULL DEFAULT 0,
          error      TEXT   NOT NULL DEFAULT ''
        );

        -- Generated portfolios. One canonical site plus any number of
        -- role-specific variants, which are the same verified projects in a
        -- different order -- never different claims.
        CREATE TABLE IF NOT EXISTS portfolios (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL,
          slug       TEXT NOT NULL DEFAULT '',
          title      TEXT NOT NULL DEFAULT '',
          html       TEXT NOT NULL DEFAULT '',
          projects   TEXT NOT NULL DEFAULT '',
          updated_at BIGINT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS portfolios_user_slug ON portfolios (user_id, slug);

        -- The careers a learner is working toward.
        --
        -- Many per learner, because someone exploring "civil engineer" and
        -- "architect" at once is the normal case, not an edge one — and the
        -- earlier single-goal table forced them to overwrite one to consider
        -- the other.
        --
        -- Only the goal is stored. The skills that make it up are recomputed
        -- from finished courses on every read, so the picture cannot drift
        -- when a course is deleted, a lesson is un-ticked, or the skill
        -- vocabulary grows.
        --
        -- The typed sentence is kept beside the role it resolved to. The role
        -- drives the gap analysis; the sentence is what the learner recognises
        -- when they come back, and replacing their words with our label for
        -- them would lose that.
        CREATE TABLE IF NOT EXISTS goals (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          goal_text  TEXT NOT NULL DEFAULT '',
          -- Empty when the wording matched several careers and the learner has
          -- not chosen between them yet.
          role_id    TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS goals_user_idx ON goals (user_id, created_at DESC);

        -- Which course was generated for which skill of which goal.
        --
        -- Without this, a learner who generates a course from a goal card has
        -- no way back: the course exists, and nothing records that it was
        -- meant to close a particular gap. This is what lets a goal say
        -- "started" rather than only "held" or "missing", and what stops a
        -- second click generating the same course twice.
        CREATE TABLE IF NOT EXISTS goal_courses (
          goal_id    TEXT NOT NULL,
          skill      TEXT NOT NULL,
          course_id  TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (goal_id, skill)
        );
        CREATE INDEX IF NOT EXISTS goal_courses_course_idx ON goal_courses (course_id);

        -- Superseded by the goals table within the same development session,
        -- before either shipped. Dropped rather than left behind: a table
        -- nothing reads is a question for whoever finds it next.
        DROP TABLE IF EXISTS learner_goals;

        -- A user's own API keys and model choice.
        --
        -- The key column holds ciphertext from secret-box, never the key
        -- itself: this table is in a file that gets copied, and a plain-text
        -- column would put someone's Anthropic billing in every backup.
        --
        -- last4 is stored separately and in the clear on purpose. The settings
        -- page has to show which key is saved without decrypting anything, and
        -- four characters identify a key to its owner without being worth
        -- stealing.
        CREATE TABLE IF NOT EXISTS user_credentials (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          -- 'anthropic' or 'serpapi'.
          provider   TEXT NOT NULL,
          secret     TEXT NOT NULL DEFAULT '',
          last4      TEXT NOT NULL DEFAULT '',
          -- Only meaningful for a provider that has models to choose between.
          model      TEXT NOT NULL DEFAULT '',
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, provider)
        );
`;
