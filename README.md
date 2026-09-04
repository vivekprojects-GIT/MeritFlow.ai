# MeritFlow

Turn any document — or a single sentence — into a course you can teach from, then
find out what it makes you qualified to become.

Type what you want to learn and MeritFlow writes a complete course: modules,
textbook-depth lessons, worked examples, quizzes, practice activities, and a
matching YouTube video wherever one helps. Finish courses and it builds a skill
file from what you actually completed, tells you which careers that points
toward, and turns the gap into the next course to take.

---

## What it does

**Generate a course.** Describe a topic. A LangGraph workflow plans the outline,
writes every module in parallel, and validates the result against a strict
schema. The outline appears while the modules are still being written.

**Learn from it.** A reader with a module rail, per-lesson progress, worked
examples, common-mistake callouts, exercises, an in-course assistant, and a
final examination that issues a verifiable certificate.

**Ask it anything, or change it.** Every saved course has an assistant that
answers questions grounded in the lessons, and can rewrite a lesson, add or
delete modules, rebuild a quiz, or change the level. Edits are written against
the same schemas that authored the course, saved immediately, and undoable.

**See where it leads.** Finishing courses builds a *skill file* from what you
completed — never from what you claim. From it MeritFlow shows:

- **Goals** — name a career ("I want to design bridges and roads"), and see
  every skill it needs split into *already covered*, *under way*, and *still to
  learn*. Build the course for any gap in one click.
- **What you could become** — careers your finished work already points at,
  each as a percentage with the missing pieces named.
- **Learning record** — CV-ready lines, each carrying the evidence behind it.
  Nothing is upgraded on the way out: it claims completion, never expertise.

**Teach with it.** Classes, rosters, assignments, a gradebook, and analytics for
instructors; enrolment by code for students.

---

## Architecture

Three processes, and the split matters.

```
┌──────────────────┐        ┌────────────────────────┐        ┌────────────┐
│  Next.js 16      │  HTTP  │  FastAPI + LangGraph   │  API   │  Anthropic │
│  app + API       │───────▶│  course generation     │───────▶│  Claude    │
│  :3000           │        │  :8000  (private)      │        └────────────┘
└────────┬─────────┘        └───────────┬────────────┘
         │                              │
         │ SQL                          │ embeddings
         ▼                              ▼
┌──────────────────┐        ┌────────────────────────┐
│ SQLite (local)   │        │  ChromaDB              │
│ Postgres (prod)  │        │  in-course search      │
└──────────────────┘        └────────────────────────┘
```

**Generation runs in Python, not Node.** The Next app never calls Claude for
course generation — it posts to the FastAPI backend and streams the result. The
backend has no user accounts and spends the operator's API credit, so in
production it runs as a *private* service behind a shared secret.

**The database is chosen at boot.** Set `DATABASE_URL` and it is Postgres; leave
it unset and it is a local SQLite file. Not one query differs: the SQL is
written in Postgres dialect and translated *down* to SQLite by
`src/lib/sql-compat.ts`.

**Users can bring their own API key.** Profile → Settings takes an Anthropic key
and a model choice, plus a SerpAPI key. Keys are encrypted with AES-256-GCM
before storage (`src/lib/secret-box.ts`), never returned to the browser, and
override the operator's key per request.

---

## Running it locally

You need Node 20+, Python 3.12+, and an Anthropic API key.

### 1. Install

```bash
npm install
python -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt   # Windows
# backend/.venv/bin/pip install -r backend/requirements.txt     # macOS / Linux
```

### 2. Configure

Copy `.env.example` to `.env.local` and fill in what you have:

```bash
ANTHROPIC_API_KEY=sk-ant-...          # required for generation
PYTHON_BACKEND_URL=http://127.0.0.1:8000
COURSE_MODEL=claude-haiku-4-5-20251001

YOUTUBE_API_KEY=                      # optional — lesson videos
SERPAPI_API_KEY=                      # optional — videos fallback + cover art
```

`.env.local` is git-ignored. Env vars load at boot, so restart after changing it.

| Key | Get one from | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) | No course generation, unless each user saves their own in Settings |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → enable *YouTube Data API v3* | Video search falls back to SerpAPI |
| `SERPAPI_API_KEY` | [serpapi.com](https://serpapi.com/) | No course cover art; no videos either if there is no YouTube key |

### 3. Run both processes

```bash
backend/.venv/Scripts/python -m uvicorn app.main:app --port 8000   # from backend/
npm run dev                                                        # from the root
```

Open http://localhost:3000.

### 4. Check it works

```bash
npm test          # 728 tests
npx tsc --noEmit
npm run lint
```

---

## Deploying

See **[DEPLOY.md](DEPLOY.md)**. `render.yaml` is a Render Blueprint that creates
the Postgres database, the private Python backend, and the web service, and
wires them together.

Three things it exists to get right:

1. **`CREDENTIAL_SECRET` must be set and must never change.** It unwraps the API
   keys users save in Settings. If it changes, every stored key becomes
   permanently unreadable — silently, on the next deploy.
2. **The backend must not be public.** Its generate endpoints have no
   authentication and spend real credit.
3. **The filesystem is ephemeral.** Hence Postgres, not the SQLite file.

---

## Project layout

```text
backend/app/
  main.py                     FastAPI routes: generation, vector index/search, health
  generator.py                LangGraph workflow; per-request API key and model
  schemas.py                  Pydantic schemas matching the frontend course contract
  vector_store.py             ChromaDB chunking, indexing, scoped similarity search
  guardrails.py               Screens a request before any content is written

src/lib/
  db.ts                       Schema, and the SQLite/Postgres driver choice
  db-postgres.ts              Postgres driver used when DATABASE_URL is set
  sql-compat.ts               Postgres dialect translated down to SQLite
  secret-box.ts               AES-256-GCM for user-supplied API keys
  credentials-store.ts        Saved keys: decrypted for the server, masked for the client
  generate-course.ts          Backend client, streaming and blocking
  finish-course.ts            Cover art, vector index and videos, shared by every route
  course-schema.ts            The course contract, as zod
  career/                     Skill file, role catalogue, goals, learning record
  video-enrichment.ts         Background video lookup and merge
  youtube.ts                  YouTube Data API and SerpAPI search, ranked

src/components/
  course-builder.tsx          The application shell and every learner view
  course-reader.tsx           The reading experience
  career-goals.tsx            Goals, skill cards, one-click course building
  api-key-settings.tsx        Profile → Settings
```

---

## Notes

- **Generation takes 6–10 minutes** for a full course and makes dozens of model
  calls. The streaming endpoint exists because a blocking request would hit
  Node's five-minute header timeout.
- **YouTube quota:** a Data API search costs 100 of the default 10,000 daily
  units, so a 15-video course uses ~1,500. Results are cached per query for the
  life of the process.
- **A failed provider call is not cached.** A rejected key or an exhausted
  account is a fact about right now, not about the query.
- **No video key?** Courses render fine without embedded video.

Built with Next.js 16 (App Router), React 19, Tailwind v4, LangGraph, Anthropic
Claude, ChromaDB, and zod v4.
