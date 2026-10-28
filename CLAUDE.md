# EMT Scenario Trainer — Rebuild

A faithful rebuild of [arinvansomphone/emt-scenario-trainer](https://github.com/arinvansomphone/emt-scenario-trainer): an AI-powered EMT training platform that generates dynamic trauma and medical scenarios, simulates the patient + bystanders + moderator, tracks vitals across interventions, and grades the EMT's run against a rubric.

## Stack

- **Backend**: Node.js + Express (`server.js` on `:3001`), helmet, cors, express-rate-limit, dotenv, bcryptjs (teacher passwords), google-auth-library (Google ID-token verification; pinned `^10` because v11 needs Node 22).
- **Frontend**: React 19 + Vite (`:5173`), Tailwind CSS v4, shadcn/ui (button, card, input, badge, tabs, scroll-area, separator, skeleton), lucide-react, react-router-dom 7.
- **Database**: SQLite via better-sqlite3, schema in `database/schema.sql`. Sessions hold a JSON blob with `currentVitals`, `bystanders`, `physicalFindings`, and (after grading) `grade`.
- **AI**: OpenAI SDK. `gpt-4o-mini` for scenario generation, chat, and summarization; `gpt-4o` for grading. Scenario generation + grading use `response_format: { type: 'json_object' }`.
- **Testing**: custom runner at `test/test-runner.js`; supertest for routes.

## Run

```bash
cp .env.example .env       # add OPENAI_API_KEY
npm install
npm run dev:all            # backend :3001, frontend :5173
npm test                   # 124 tests
```

Note: backend listens on `:3001` (not 3000) to avoid clashing with another local Next.js dev server.

## Architecture

```
config/openai.js              # OpenAI client (fails fast on missing key)
database/
  schema.sql                  # sessions, messages, summaries
  databaseManager.js          # lazy single-instance better-sqlite3
routes/
  chat.js                     # POST /api/chat (existing, ungraded scenario sessions only)
  scenarios.js                # GET /api/scenario-types, GET /api/assignments/:id, GET /api/classes/:code, POST /api/scenarios (optionally tied to a class/assignment)
  sessions.js                 # GET /api/sessions/:id (includes classRun, never student identity), POST /api/sessions/:id/grade
  teacher.js                  # /api/teacher/*: signup/login/google/logout/me + classes, assignments, students, runs (requireTeacher)
services/
  httpError.js                # httpError(status, msg) → exposable error shared by services/routes
  classRepo.js                # teachers, classes (join codes), assignments, students, class_runs persistence
  teacherAuth.js              # signup/login/Google verify + account linking, 30-day cookie sessions, requireTeacher
  classStats.js               # pure: per-run summary (late), class overview, per-assignment/student stats
  sessionManager.js           # session + message persistence; setScenario, getContext (model view), getHistory (full transcript)
  chatService.js              # orchestrates chat; parses [Vitals: ...] markers; runs summarizer
  scenarioTypes.js            # static catalog (trauma + medical)
  templateGenerator.js        # per-subtype clinical hints
  scenarioGenerator.js        # OpenAI → JSON scenario (patient, env, bystanders, physicalFindings)
  conversationSummarizer.js   # rolling summary once model context hits 30 messages; keeps last 8 verbatim
  abuseGuards.js              # SERVICE_DISABLED kill switch + in-memory daily token meter (default 1.5M tokens/day)
  aiErrors.js                 # maps OpenAI failures (quota, 429, 5xx, network) to 503 + readable message
  gradingService.js           # OpenAI → JSON rubric scoring; verbatim-quote audit zeroes unsupported scores; returns stored grade on repeat calls
  emtScope.js                 # California EMT-B scope of practice: moderator refuses ALS skills; grading caps out-of-scope interventions
src/
  components/Header.jsx       # top bar (shadcn Badge + Separator)
  components/ChatBubbles.jsx  # renders patient / bystander / moderator segments
  components/Disclaimer.jsx   # footer: educational-use + OpenAI data notice; feedback link if VITE_FEEDBACK_URL set
  components/ui/              # shadcn primitives
  pages/SelectionScreen.jsx   # tabs (Trauma/Medical) + subtype card grid
  pages/ScenarioRunner.jsx    # dispatch + patient + env + bystanders + chat + End-and-Grade
  pages/FeedbackDisplay.jsx   # rubric scores + strengths + improvements
  pages/About.jsx             # /about
  lib/utils.js                # cn() helper
  lib/api.js                  # apiFetch(): all API calls; turns failures into user-readable messages
  lib/parseRoles.js           # strips [Vitals: …], splits replies into role segments
  lib/useSpeech.js            # Web Speech API speech-to-text hook (mic button in ScenarioRunner)
  components/CopyButton.jsx   # copy-to-clipboard button (join/assignment links)
  components/GoogleSignInButton.jsx # Google Identity Services button; hidden when VITE_GOOGLE_CLIENT_ID unset
  components/GradeView.jsx    # shared rubric/strengths/improvements view (student feedback + teacher run detail)
  components/RunBadge.jsx     # "Shared with <class>" vs "Free practice" badge
  components/ScenarioGrid.jsx # subtype card grid shared by selection + assignment creation
  components/StudentForm.jsx  # name/email form for joining a class or starting an assignment
  components/TeacherGate.jsx  # wraps /teacher/* pages; shows sign-in when signed out
  pages/JoinClass.jsx         # /join/:code — enter name/email, then pick a scenario
  pages/AssignmentStart.jsx   # /a/:assignmentId — name/email, then starts the assigned scenario
  pages/teacher/              # TeacherSignIn, TeacherClasses, ClassOverview, StudentRuns, RunDetail (/teacher/*)
  lib/student.js              # remembers student name/email in localStorage
  lib/teacherFormat.js        # score/date formatters + join/assignment link builders
  lib/useTeacher.js           # shared signed-in-teacher store (/api/teacher/me, login, logout)
  lib/useTheme.js             # light/dark theme toggle
```

## How a session works

1. **Class link (optional).** Students arrive via a class code (`/join/:code`) or an assignment link (`/a/:id`), enter name + email (remembered in localStorage), and `POST /api/scenarios` carries `classCode` or `assignmentId` plus `studentName`/`studentEmail`. An assignment fixes the type/subtype. Backend upserts the student (by normalized email, per class) and writes a `class_runs` row for the session. **No `class_runs` row = free practice.** Unknown code → 400, unknown assignment → 404.
2. **SelectionScreen** posts `/api/scenarios { type, subtype }`. Backend calls `scenarioGenerator` → JSON scenario, then creates a session and seeds a `system` message that defines the LLM's three roles (patient / bystander / moderator) and the `[Vitals: ...]` update marker.
3. **ScenarioRunner** sends user messages to `/api/chat`. The assistant replies in mixed voices:
   - Patient lines (default) — first person, in character.
   - `[<Bystander Name>] …` lines when the EMT addresses a bystander.
   - `[Moderator] …` lines for physical assessment findings or intervention outcomes, drawn from `physicalFindings`.
   - Trailing `[Vitals: hr=…, spo2=…]` line when an intervention or progression should change vitals.
4. **chatService** only accepts a `sessionId` created by `/api/scenarios`: unknown → 404, no scenario → 400, already graded → 409. It never creates sessions, so `/api/chat` can't be used as a free general-purpose chatbot. It parses the `[Vitals: …]` marker and updates `sessions.state.currentVitals`. The frontend strips the marker from display and re-fetches `/api/sessions/:id` to refresh the vitals tile.
5. **End Scenario & Grade** posts `/api/sessions/:id/grade`. `gradingService` returns the stored grade if the session was already graded (no second OpenAI call); otherwise it runs the full transcript + scenario against a 9-criterion rubric (separate trauma vs medical) and returns `{ overall, rubric[], strengths[], improvements[] }`. FeedbackDisplay renders it, falling back to `GET /api/sessions/:id` (which includes `grade`) on refresh or a shared link.
6. **conversationSummarizer** kicks in once the model context reaches 30 messages: it folds older turns (plus any prior summary) into one rolling ledger stored in the `summaries` table, keeping the last 8 turns verbatim. **Messages are never deleted** — `chatService` sends `getContext()` (system + summary + recent turns) to the model, while grading and `GET /api/sessions/:id` read the full transcript via `getHistory()`, so early actions like scene size-up and BSI stay gradeable.

## Catalog

```
trauma:  MVC, Fall, Assault, Sport Injury, Stabbing, GSW, Burn
medical: Cardiac, Respiratory, Neurological, Metabolic, Obstetric, Pediatric, Overdose
```

## Teachers

Optional teacher dashboard; students never need an account.

- **Auth**: email + password (bcrypt, min 8 chars) or Google sign-in. Cookie `emt_teacher` (httpOnly, sameSite lax, secure in production), 30-day server-side sessions in `teacher_sessions`. `signup`/`login`/`google` share a 10/min rate limit.
- **Account linking**: Google proves email ownership. Signing in with Google on an existing password account links it, clears the password, and signs out its other sessions. Password signup on a Google-only email is refused (409). Unverified Google emails are rejected.
- **Routes** (`/api/teacher`): `signup, login, google, logout, me`; `GET/POST classes`, `GET classes/:id` (overview + metrics), `POST classes/:id/assignments`, `DELETE assignments/:id`, `GET classes/:id/students/:studentId`, `GET runs/:sessionId` (grade, scenario, full transcript). All behind `requireTeacher`; resources owned by another teacher return 404 (not 403).
- **Privacy**: free practice never reaches teachers (only `class_runs` sessions are listed). `GET /api/sessions/:id` returns only `classRun` (class name/code, assignment id) and never student name/email.
- **Stats** (`classStats.js`): a run's score is the audited rubric percentage (`sum(valid row scores) / (rows × 3) × 100`, rounded); the grader's own `overall.score` is ignored because the audit doesn't adjust it. A grade counts as graded with ≥1 valid rubric row. Per-run `late` = graded and started after the due date (`class_runs.created_at > due_at`). Per-assignment average uses each student's latest graded attempt; per-assignment `late` counts students with a graded run but none on time (any graded run at or before the due date clears them). All dashboard scores show with a `%` suffix.
- **No roster**: students appear only after their first run in the class (identified by normalized email).
- **No password reset in v1**: Google sign-in is the recovery path.
- **Google env vars**: `GOOGLE_CLIENT_ID` (server verifies ID token audience) and `VITE_GOOGLE_CLIENT_ID` (same value, baked in at build). Unset: button hidden and `POST /api/teacher/google` → 501. Setup: Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID, type **Web application**; add the Render URL and `http://localhost:5173` under Authorized JavaScript origins; set both env vars (Render + local `.env`); redeploy, since the `VITE_` one is build-time.

## Specs and plans

- `docs/superpowers/specs/2026-04-25-foundation-design.md`
- `docs/superpowers/plans/2026-04-25-foundation.md`
- `docs/superpowers/specs/2026-04-25-scenario-generation-design.md`
- `docs/superpowers/plans/2026-04-25-scenario-generation.md`
- `docs/superpowers/specs/2026-05-04-render-deploy-design.md`
- `docs/superpowers/plans/2026-05-04-render-deploy.md`
- `docs/superpowers/specs/2026-10-21-teacher-dashboard-design.md`
- `docs/superpowers/plans/2026-10-21-teacher-dashboard.md`

## Known gaps vs original (intentional)

- **PDF / RAG**: not implemented. The original loaded EMT reference PDFs via `pdf-parse`. We didn't have PDFs to ingest; reintroduce when needed.
- **Speech-to-text**: browser-only via the Web Speech API (`src/lib/useSpeech.js`); unsupported browsers (e.g. Firefox) just hide the mic. No server-side Whisper.
- **gh-pages deploy**: not wired. Add `gh-pages` script + GH Pages config when you want a live demo.
- **Per-bystander avatar / explicit chat actor switcher**: bystanders surface as named lines in chat, not as a separate UI lane.

- **Teacher dashboard v1**: no password reset or email sending, no class roster (students appear after first run), no per-student history page for students, no CSV export.

## Deployment (Render free tier)

The app deploys as a single Render Web Service (Starter plan, always on) that serves both `/api/*` and the built React app from one origin. Configuration lives in `render.yaml`. A 1 GB persistent disk is mounted at `/var/data`, and `DB_PATH=/var/data/emt.db` keeps SQLite sessions and grades across restarts and deploys.

### One-time setup

1. **Cap OpenAI spend.** In your OpenAI billing dashboard, set a hard monthly usage limit (suggested: $25). This is the ultimate budget backstop.
2. **Push to a Git remote.** Create a GitHub (or GitLab/Bitbucket) repo, then `git remote add origin <url> && git push -u origin main`.
3. **Connect Render.** Sign in at render.com → New → Blueprint → connect the repo → Render reads `render.yaml` and creates the service.
4. **Set the OpenAI key** in Render → service → Environment → add `OPENAI_API_KEY` with your real key.
5. **First deploy** runs automatically. Visit the `*.onrender.com` URL Render assigns.

### Operating

- **Logs:** Render dashboard → service → Logs (tail in real time).
- **Kill switch:** set `SERVICE_DISABLED=true` in Environment + redeploy. All `/api/*` returns 503 within ~90s.
- **Adjust daily budget:** change `DAILY_TOKEN_BUDGET` in Environment + redeploy (default 1,500,000 ≈ 350 sessions/day).
- **Adjust rate limit:** change `RATE_LIMIT_PER_MIN` (default 300, POST requests only).
- **Google sign-in:** set `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` (same OAuth Web client ID) and redeploy; the `VITE_` one is baked in at build time. Unset = no Google button, `/api/teacher/google` → 501.
- **Feedback link:** set `VITE_FEEDBACK_URL` (e.g. a Google Form) and redeploy; it's baked in at build time. Unset = no link.
- **Deploys:** services with a disk can't do zero-downtime deploys, so each deploy has a few seconds of downtime. Deploy outside class hours.

### Upgrade path

Need more headroom? Change `plan` in `render.yaml` (e.g. `standard` / `1c-2g`) and sync the Blueprint. The disk can grow (`sizeGB`) but never shrink.

### Caveats

- **Daily token meter is process-local.** The counter lives in memory in a single Node process. If you ever scale horizontally (multiple instances on a paid Render plan), each instance has its own counter and the effective daily cap becomes `instances × DAILY_TOKEN_BUDGET`. A disk-backed service is single-instance, so this is fine; revisit when you go multi-instance.
- **Rate limit is global on Render.** With `app.set('trust proxy', 1)`, `express-rate-limit` reads the real client IP from `X-Forwarded-For` and applies the per-IP limit (`RATE_LIMIT_PER_MIN`, default 300/min) to POSTs only — GETs are free and don't touch OpenAI. It's generous because a classroom shares one NAT IP; the daily token meter is the real spend cap. Without trust-proxy, all requests would have looked like one IP and the limit would have been service-wide. Both are valid abuse postures; we chose per-IP. If you want service-wide instead, remove the `trust proxy` line.
