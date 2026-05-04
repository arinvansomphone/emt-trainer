# EMT Scenario Trainer — Rebuild

A faithful rebuild of [arinvansomphone/emt-scenario-trainer](https://github.com/arinvansomphone/emt-scenario-trainer): an AI-powered EMT training platform that generates dynamic trauma and medical scenarios, simulates the patient + bystanders + moderator, tracks vitals across interventions, and grades the EMT's run against a rubric.

## Stack

- **Backend**: Node.js + Express (`server.js` on `:3001`), helmet, cors, express-rate-limit, dotenv.
- **Frontend**: React 19 + Vite (`:5173`), Tailwind CSS v4, shadcn/ui (button, card, input, badge, tabs, scroll-area, separator, skeleton), lucide-react, react-router-dom 7.
- **Database**: SQLite via better-sqlite3, schema in `database/schema.sql`. Sessions hold a JSON blob with `currentVitals`, `bystanders`, `physicalFindings`, and (after grading) `grade`.
- **AI**: OpenAI SDK; `gpt-4o-mini` by default. Scenario generation + grading use `response_format: { type: 'json_object' }`.
- **Testing**: custom runner at `test/test-runner.js`; supertest for routes.

## Run

```bash
cp .env.example .env       # add OPENAI_API_KEY
npm install
npm run dev:all            # backend :3001, frontend :5173
npm test                   # 18 tests
```

Note: backend listens on `:3001` (not 3000) to avoid clashing with another local Next.js dev server.

## Architecture

```
config/openai.js              # OpenAI client (fails fast on missing key)
database/
  schema.sql                  # sessions, messages
  databaseManager.js          # lazy single-instance better-sqlite3
routes/
  chat.js                     # POST /api/chat
  scenarios.js                # GET /api/scenario-types, POST /api/scenarios
  sessions.js                 # GET /api/sessions/:id, POST /api/sessions/:id/grade
services/
  sessionManager.js           # session + message persistence; setScenario, replaceHistory
  chatService.js              # orchestrates chat; parses [Vitals: ...] markers; runs summarizer
  scenarioTypes.js            # static catalog (trauma + medical)
  templateGenerator.js        # per-subtype clinical hints
  scenarioGenerator.js        # OpenAI → JSON scenario (patient, env, bystanders, physicalFindings)
  conversationSummarizer.js   # collapses old history when > 30 messages, keeps last 8
  gradingService.js           # OpenAI → JSON rubric scoring (Stanford-style criteria)
src/
  components/Header.jsx       # top bar (shadcn Badge + Separator)
  components/ui/              # shadcn primitives
  pages/SelectionScreen.jsx   # tabs (Trauma/Medical) + subtype card grid
  pages/ScenarioRunner.jsx    # dispatch + patient + env + bystanders + chat + End-and-Grade
  pages/FeedbackDisplay.jsx   # rubric scores + strengths + improvements
  pages/TestConnection.jsx    # bare /test chat smoke
  lib/utils.js                # cn() helper
```

## How a session works

1. **SelectionScreen** posts `/api/scenarios { type, subtype }`. Backend calls `scenarioGenerator` → JSON scenario, then creates a session and seeds a `system` message that defines the LLM's three roles (patient / bystander / moderator) and the `[Vitals: ...]` update marker.
2. **ScenarioRunner** sends user messages to `/api/chat`. The assistant replies in mixed voices:
   - Patient lines (default) — first person, in character.
   - `[<Bystander Name>] …` lines when the EMT addresses a bystander.
   - `[Moderator] …` lines for physical assessment findings or intervention outcomes, drawn from `physicalFindings`.
   - Trailing `[Vitals: hr=…, spo2=…]` line when an intervention or progression should change vitals.
3. **chatService** parses the `[Vitals: …]` marker and updates `sessions.state.currentVitals`. The frontend strips the marker from display and re-fetches `/api/sessions/:id` to refresh the vitals tile.
4. **End Scenario & Grade** posts `/api/sessions/:id/grade`. `gradingService` runs the full transcript + scenario against a 9-criterion rubric (separate trauma vs medical) and returns `{ overall, rubric[], strengths[], improvements[] }`. FeedbackDisplay renders it.
5. **conversationSummarizer** kicks in once history exceeds 30 messages: collapses the head into a dense ledger system message and keeps the last 8 turns verbatim.

## Catalog

```
trauma:  MVC, Fall, Assault, Sport Injury, Stabbing, GSW, Burn
medical: Cardiac, Respiratory, Neurological, Metabolic, Obstetric, Pediatric, Overdose
```

## Specs and plans

- `docs/superpowers/specs/2026-04-25-foundation-design.md`
- `docs/superpowers/plans/2026-04-25-foundation.md`
- `docs/superpowers/specs/2026-04-25-scenario-generation-design.md`
- `docs/superpowers/plans/2026-04-25-scenario-generation.md`

## Known gaps vs original (intentional)

- **PDF / RAG**: not implemented. The original loaded EMT reference PDFs via `pdf-parse`. We didn't have PDFs to ingest; reintroduce when needed.
- **Speech-to-text**: not implemented. Add via Web Speech API or Whisper later.
- **gh-pages deploy**: not wired. Add `gh-pages` script + GH Pages config when you want a live demo.
- **Per-bystander avatar / explicit chat actor switcher**: bystanders surface as named lines in chat, not as a separate UI lane.

## Deployment (Render free tier)

The app deploys as a single Render Web Service that serves both `/api/*` and the built React app from one origin. Configuration lives in `render.yaml`.

### One-time setup

1. **Cap OpenAI spend.** In your OpenAI billing dashboard, set a hard monthly usage limit (suggested: $25). This is the ultimate budget backstop.
2. **Push to a Git remote.** Create a GitHub (or GitLab/Bitbucket) repo, then `git remote add origin <url> && git push -u origin main`.
3. **Connect Render.** Sign in at render.com → New → Blueprint → connect the repo → Render reads `render.yaml` and creates the service.
4. **Set the OpenAI key** in Render → service → Environment → add `OPENAI_API_KEY` with your real key.
5. **First deploy** runs automatically. Visit the `*.onrender.com` URL Render assigns.

### Operating

- **Logs:** Render dashboard → service → Logs (tail in real time).
- **Kill switch:** set `SERVICE_DISABLED=true` in Environment + redeploy. All `/api/*` returns 503 within ~90s.
- **Adjust daily budget:** change `DAILY_TOKEN_BUDGET` in Environment + redeploy.
- **Cold starts:** free tier sleeps after 15 min idle; first request after sleep takes ~30s. Upgrade to starter ($7/mo) to eliminate.

### Upgrade path

Render dashboard → service → Settings → Plan → Starter. No code changes. For SQLite continuity across redeploys, also add a persistent disk ($1/mo) and set `DB_PATH` to a path on the disk (small `databaseManager` change required at that time).

### Caveats

- **Daily token meter is process-local.** The counter lives in memory in a single Node process. If you ever scale horizontally (multiple instances on a paid Render plan), each instance has its own counter and the effective daily cap becomes `instances × DAILY_TOKEN_BUDGET`. Free tier is single-instance so this is fine for v1; revisit when you go multi-instance.
- **Rate limit is global on Render.** With `app.set('trust proxy', 1)`, `express-rate-limit` reads the real client IP from `X-Forwarded-For` and applies the 60-req/min limit per IP. Without trust-proxy, all requests would have looked like one IP and the limit would have been service-wide. Both are valid abuse postures; we chose per-IP. If you want service-wide instead, remove the `trust proxy` line.
