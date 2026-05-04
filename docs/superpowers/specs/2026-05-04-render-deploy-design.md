# Render Free Deployment — Design Spec

Sub-project: deploy the EMT Scenario Trainer to a public URL so a small class of students can use it for training. See `CLAUDE.md` for product context and earlier sub-projects.

## Prerequisites

The project is not currently under version control. Render auto-deploys from a Git remote (GitHub, GitLab, or Bitbucket), so initializing git and pushing to a remote is a hard prerequisite for any of this work. The implementation plan will include this as the first step.

## Goal

Get the existing rebuild — frontend + backend + SQLite — running on a single Render free-tier Web Service at `https://<name>.onrender.com`. Students hit the URL, pick scenarios, run sessions, and receive graded feedback. No per-student auth, no per-student tracking, no PDFs. Instructor pays for OpenAI usage via a single shared API key set as a Render env var.

## Constraints (from brainstorming)

| Decision | Choice |
|---|---|
| OpenAI cost model | **A** — instructor provides one shared key. Students never see it. |
| Per-student tracking | **C** — none. Grade history lives in each student's browser sessionStorage. |
| Hosting platform | **A** — Render free tier for v1. Upgrade path to Render starter ($7/mo) preserved. |
| Access gate | **D** — none. Public URL, rely on rate limiting + global circuit breakers + OpenAI hard cap. |
| PDF / RAG | Out of scope. Rely on the model's training knowledge plus existing prompt templates. |

## Scope

**In scope**
- Single Render Web Service serving both API and built React app from the same origin
- `render.yaml` for infrastructure-as-code
- `server.js` updated to serve the production React build (`dist/`) as static assets with SPA fallback
- `package.json` updated with Node engine, build step, production-ready start script
- Three abuse-mitigation guards (see §Abuse Mitigation): hard cap in OpenAI dashboard (manual), in-process daily token meter, kill switch env var
- One-line "first request after idle takes ~30s" notice on `SelectionScreen` to set student expectations during cold starts
- README/CLAUDE.md update documenting the deploy procedure and env vars

**Out of scope (deferred or won't-do)**
- Per-student authentication of any kind (class code, magic links, SSO)
- Per-student tracking, instructor dashboard, grade export
- PDF / RAG knowledge grounding
- Custom domain (works if user adds one later — no code changes needed)
- Persistent disk for SQLite continuity across redeploys (would require Render starter + $1/mo disk)
- Conversation summarizer leak fix (separate bug noted in earlier debugging — not a deploy blocker)
- Speech-to-text, gh-pages — both pre-existing CLAUDE.md gaps
- CI/CD beyond Render's auto-deploy-on-push

## Architecture

```
[Browser] ──HTTPS──► [Render Web Service]                    [api.openai.com]
                       emt-trainer.onrender.com                       ▲
                       │                                              │
                       ├─ Express on $PORT                            │
                       │   ├─ middleware:                             │
                       │   │   ├─ helmet, cors, express-rate-limit    │
                       │   │   ├─ NEW: kill-switch guard              │
                       │   │   └─ NEW: daily-token-meter guard        │
                       │   ├─ /api/chat        ──► chatService ───────┤
                       │   ├─ /api/scenarios   ──► scenarioGen ───────┤
                       │   ├─ /api/sessions/:id/grade ──► grade ──────┘
                       │   └─ /*               ──► dist/index.html (SPA)
                       │
                       └─ database/emt.db (ephemeral; container is destroyed
                          when free-tier service spins down after 15 min idle)
```

Sessions are short-lived during use. Ephemeral DB is acceptable because no persistent per-student data exists by design (constraint Q2=C). If a container sleeps mid-session, students re-pick a scenario; we accept this UX cost in exchange for $0/mo hosting.

## Code changes required

| File | Change |
|---|---|
| `server.js` | Add `express.static('dist')`. Add SPA fallback `app.get('*', ...)` that returns `dist/index.html` for non-`/api` routes. Wire in the kill-switch and token-meter middleware. |
| `package.json` | Add `"engines": { "node": ">=20" }`. Add `"build"` script (already provided by Vite). Confirm `"start": "node server.js"` is suitable for production. |
| `render.yaml` (new) | Service type `web`, runtime `node`, build command `npm ci && npm run build`, start command `npm start`, env var slots for `OPENAI_API_KEY`, `SERVICE_DISABLED`, `DAILY_TOKEN_BUDGET`. |
| `services/abuseGuards.js` (new) | Two pieces of middleware: `killSwitch` (returns 503 when `SERVICE_DISABLED=true`) and `dailyTokenMeter` (in-memory counter, resets at UTC midnight, rejects when budget exceeded). |
| `src/pages/SelectionScreen.jsx` | One-line notice about cold-start delay on first scenario load. |
| `CLAUDE.md` | Append a "Deployment" section documenting Render setup steps, env vars, and the upgrade path. |
| `.gitignore` | Verify `dist/` and `.env` already excluded (they are). |

The earlier port-mismatch fix (`server.js` defaults to 3001, vite proxy points to 3001) remains correct in production: Render injects `$PORT` and the existing `Number(process.env.PORT) || 3001` reads it correctly.

## Abuse mitigation

Three layers, all global (no per-student state). Each is independently effective:

**1. OpenAI dashboard hard monthly cap (manual, before deploy).** Set a usage limit in the OpenAI billing dashboard (suggested: $25/month). When hit, OpenAI returns 429 to all calls; our backend's existing error handling reports a server error to the student. This is the ultimate backstop — even if everything else fails, your bill cannot exceed this.

**2. Daily global token meter (`services/abuseGuards.js`).** Tracks combined prompt + completion tokens across all `/api/chat` and `/api/sessions/:id/grade` calls. Counter resets at UTC midnight. When `tokensToday > DAILY_TOKEN_BUDGET` (default `200_000`), all `/api/chat` and `/api/sessions/:id/grade` requests return 503 with `{ error: 'daily quota reached, try again tomorrow' }`. ~30 LOC. State is in-memory and resets on container restart, which is acceptable.

**3. Kill switch (`SERVICE_DISABLED` env var).** When set to `true`, all `/api/*` routes return 503. Toggling the env var in Render and redeploying takes ~90 seconds — usable as an emergency stop if abuse is detected.

The existing `express-rate-limit` (60 req/min per IP) stays in place but is not the primary defense — it's per-IP and trivially bypassed.

## Operational notes

- **Cold start**: 30–60s on free tier after 15 min idle. The SelectionScreen notice manages student expectations. If unacceptable, upgrade Render plan (no code change).
- **Logs**: Render dashboard log tail. Existing `console.error` calls from chat/scenario/grade routes are sufficient for diagnostics.
- **Deploys**: Render auto-deploys on push to the connected branch (typically `main`). A failing build leaves the previous version live.
- **Env vars** (set in Render dashboard, not committed):
  - `OPENAI_API_KEY` — required, instructor's key
  - `SERVICE_DISABLED` — optional, `true`/`false` (default false)
  - `DAILY_TOKEN_BUDGET` — optional integer, defaults to `200_000`
- **Tests**: existing 28-test suite must continue to pass. New abuse-guard module gets its own tests (token meter rollover at UTC midnight, kill switch on/off, budget exceeded behavior).

## Migration path to paid (later)

Documented but not implemented in v1:
- Upgrade Render plan to starter ($7/mo) — eliminates sleep, no code changes.
- Add a persistent disk add-on ($1/mo) and point SQLite at it — gives DB continuity across redeploys. Requires updating the `databaseManager` file path via env var.
- If/when class size grows or curriculum-specific grounding is needed, revisit auth (a class code is the natural next step) and PDF/RAG (a separate sub-project with its own spec).

## Acceptance criteria

The deployment is done when:
1. `https://<name>.onrender.com` serves the SelectionScreen.
2. A student can complete a full session: pick a scenario, run a chat, see vitals update, end and grade, see feedback.
3. Setting `SERVICE_DISABLED=true` in Render env and redeploying causes `/api/*` to return 503 within ~90s.
4. Sending more than `DAILY_TOKEN_BUDGET` worth of token usage causes subsequent `/api/chat` calls to return 503 until UTC midnight.
5. The existing `npm test` suite passes (28 prior + new abuse-guard tests).
6. CLAUDE.md contains a "Deployment" section another developer could follow to redeploy.

## Open questions

None as of this writing. All forks were resolved during brainstorming.
