# Deploying MeritFlow to Render

Three services and a database. `render.yaml` defines all of them, so the
fastest path is a Blueprint rather than creating services by hand.

---

## What runs where

| Service | Render type | Why |
|---|---|---|
| `courseai-web` | Web Service | The Next app. Has API routes and server rendering, so not a Static Site. |
| `courseai-backend` | **Private** Service | FastAPI + LangGraph. Writes the courses. |
| `courseai-db` | Postgres | Users, courses, goals, saved API keys. |

**The backend is private on purpose.** Its `/generate-course` endpoints have no
user accounts and spend the operator's Anthropic credit, so anything that can
reach them can spend money. If your plan has no private services, change
`type: pserv` to `type: web` in `render.yaml` — `BACKEND_SHARED_SECRET` is what
keeps it safe either way, and both services get the same value automatically.

---

## Deploying

1. Push this repository to GitHub.
2. Render → **New → Blueprint** → select the repository.
3. Render reads `render.yaml` and asks for the values marked `sync: false`:
   - `ANTHROPIC_API_KEY` — asked for twice, once per service. Same key.
   - `YOUTUBE_API_KEY`, `SERPAPI_API_KEY` — optional, see below.
4. Apply. The database is created first, then the backend, then the web app.

Everything else — `DATABASE_URL`, `PYTHON_BACKEND_URL`, `CREDENTIAL_SECRET`,
`BACKEND_SHARED_SECRET` — is generated and wired between services for you.

---

## The three things that will bite you

### 1. `CREDENTIAL_SECRET` must never change

It unwraps the API keys users save in Settings. Without it the app generates a
key file at runtime, that file dies with the container, and **every key every
user saved becomes permanently unreadable** — silently, on the next deploy.

`render.yaml` has Render generate it once. Do not rotate it unless you intend
to invalidate every stored key, and if you ever move the database to another
Render account, carry this value across with it.

### 2. The database is Postgres in production, SQLite locally

The application chooses its driver from `DATABASE_URL`:

- set → Postgres (`src/lib/db-postgres.ts`)
- unset → the local SQLite file (unchanged)

No query changed, because the SQL never stopped being Postgres dialect — the
local driver translates it *down* to SQLite. The schema applies cleanly under
Postgres semantics, which `src/lib/db-postgres.test.ts` checks on every run.

**Your local data does not come with you.** The deployed database starts empty:
new sign-ups, no courses. There is no migration path written for moving a
development SQLite file into Postgres, and you probably do not want one.

### 3. There is no persistent disk

Anything written to the filesystem is gone on the next deploy. Two features
touch it:

- **`chroma-data/`** — the vector index used for in-course search. It rebuilds
  from the `courses` table, so losing it degrades search until courses are
  re-indexed rather than losing anything.
- **`.credential-key`** — see (1). Superseded by `CREDENTIAL_SECRET`, which is
  why that variable exists.

---

## Environment variables

### `courseai-web`

| Variable | Set by | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | Render | yes | From the database. Never set by hand. |
| `CREDENTIAL_SECRET` | Render | **yes** | Never change it. See above. |
| `PYTHON_BACKEND_URL` | Render | yes | `host:port`, no scheme — normalised in `src/lib/backend-url.ts`. |
| `BACKEND_SHARED_SECRET` | Render | yes | Must match the backend's. |
| `ANTHROPIC_API_KEY` | you | no* | Fallback for users who save no key of their own. |
| `YOUTUBE_API_KEY` | you | no | Lesson videos. Without it, video search falls back to SerpAPI. |
| `SERPAPI_API_KEY` | you | no | Course cover art, and video search when there is no YouTube key. |
| `PGPOOL_MAX` | you | no | Postgres connections. Default 10. |
| `PGSSL_STRICT` | you | no | Set to `1` only where the certificate chain verifies. |

\* Not required in the sense that the app boots and runs without it — but no
one can generate a course unless they save their own key in Settings.

### `courseai-backend`

| Variable | Set by | Required | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | you | no* | Same key, same caveat. |
| `BACKEND_SHARED_SECRET` | Render | yes | Generated here, copied to the web service. |
| `COURSE_MODEL` | `render.yaml` | no | Default model. Users override per request. |
| `PYTHON_VERSION` | `render.yaml` | yes | 3.12. |

---

## After the first deploy

1. **Sign up.** The database is empty, so the first account you create is new.
2. **Check generation.** Create a course. If it fails, the message says which:
   - *"The Anthropic API key was rejected"* → the key is wrong.
   - *"The Anthropic account has no credit left"* → the account is empty.
   - *"Python backend is not reachable"* → the backend is down, or
     `PYTHON_BACKEND_URL` / `BACKEND_SHARED_SECRET` disagree between services.
3. **Try your own key.** Profile → Settings → Anthropic. It overrides the
   operator key per request and needs no restart.

---

## What is not covered here

- **Backups.** The free Postgres plan has none and expires after 90 days. Move
  to a paid instance before this holds anything real.
- **Free-tier spin-down.** A free web service sleeps when idle and takes ~50
  seconds to wake. Course generation already takes minutes, so the first
  request after a sleep can look like a hang.
- **Scaling past one instance.** Nothing here forbids it, but the vector index
  is per-instance and would be rebuilt separately on each.
- **A staging environment.** One blueprint, one environment. Render's preview
  environments would need a second database.
