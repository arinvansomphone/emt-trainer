# Teacher Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers sign up, create classes and assignments, and see their students' scores, rubric breakdowns, strengths/improvements, and transcripts, while free practice stays private.

**Architecture:** New SQLite tables (teachers, sessions-for-teachers, classes, assignments, students, class_runs) link a scenario session to a class without touching the existing `sessions` table. `POST /api/scenarios` optionally records that link. A cookie-authenticated `/api/teacher` router serves dashboards computed by a pure `classStats` function. The React app gains student join pages and a `/teacher` section.

**Tech Stack:** Node 20 + Express 4, better-sqlite3, bcryptjs, google-auth-library, React 19 + react-router 7 + shadcn/ui, supertest + `test/test-runner.js`.

**Spec:** `docs/superpowers/specs/2026-10-21-teacher-dashboard-design.md`

## Global Constraints

- Never `ALTER` or recreate `sessions` / `messages` / `summaries`; new tables use `CREATE TABLE IF NOT EXISTS` in `database/schema.sql` (prod DB on the Render disk must boot unchanged).
- A session with no `class_runs` row is free practice and must never appear in any `/api/teacher/*` response, not even as a count.
- `GET /api/sessions/:id` must never return student name or email.
- Teacher ownership failures (wrong class/run/assignment/student) return **404**, never 403.
- Teacher cookie: name `emt_teacher`, `httpOnly`, `sameSite: 'lax'`, `secure` only when `NODE_ENV === 'production'`, 30-day expiry.
- Class code: 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, stored without dash, displayed as `XXX-XXX`; input normalized by uppercasing and stripping every non-alphanumeric char.
- Student email normalized: `trim().toLowerCase()`. Latest typed name wins.
- Passwords: minimum 8 chars, hashed with `bcryptjs` (cost 10).
- Stricter rate limit: 10 requests/min/IP on `POST /api/teacher/login`, `/signup`, `/google`.
- Env: `GOOGLE_CLIENT_ID` (server), `VITE_GOOGLE_CLIENT_ID` (build). If unset, the Google button is hidden and `POST /api/teacher/google` returns 501.
- Student copy on join forms: "Your name, email, scores, and transcript will be visible to your teacher." Free-practice label: "Free practice — not shared with any teacher." Never say "not uploaded".
- Tests follow the existing pattern: `exports.tests = [{ name, fn }]`, `resetForTests(); getDb(':memory:')`, `createApp({...})` with injected fakes.

## Review Focus

1. Class code typed as `k7q 2m`, `K7Q2M`, or `k7q-2m` must all join the same class (pinned in Task 1).
2. The same student typing `Sam@School.edu ` and `sam@school.edu` must be one student, not two (pinned in Task 1).
3. Grades that are null, missing `rubric`, or contain null rows / non-numeric scores must be skipped without crashing the dashboard (pinned in Task 5).
4. A teacher who signed up with email and later uses Google with the same email (or the reverse) gets one account, not two (pinned in Task 2).
5. Deleting an assignment after runs exist keeps the runs as class practice, and its old link returns a readable 404 (pinned in Tasks 1 and 4).

---

### Task 1: Schema and class repository

**Files:**
- Modify: `database/schema.sql`
- Create: `services/classRepo.js`
- Test: `test/classRepo.test.js`

**Interfaces:**
- Produces (all synchronous, using `getDb()`):
  - `normalizeCode(input: string) -> string`, `formatCode(code: string) -> string` (`'K7Q2MX'` → `'K7Q-2MX'`), `normalizeEmail(s) -> string`
  - `createTeacher({ email, name, passwordHash = null, googleSub = null }) -> teacher`; `getTeacherById(id)`, `getTeacherByEmail(email)`, `getTeacherByGoogleSub(sub)` → row or `null`; `setTeacherGoogleSub(id, sub)`, `setTeacherPassword(id, hash)`
  - `createClass(teacherId, name) -> { id, teacher_id, name, code, created_at }` (retries on code collision); `listClasses(teacherId) -> class[]`; `getClassForTeacher(classId, teacherId) -> class | null`; `getClassByCode(input) -> class | null` (normalizes input)
  - `createAssignment(classId, { type, subtype, title, dueAt = null }) -> assignment` (id = `crypto.randomBytes(9).toString('base64url')`); `getAssignment(id) -> (assignment & { class_name, class_code }) | null`; `listAssignments(classId)`; `deleteAssignment(id)`
  - `upsertStudent(classId, name, email) -> student`; `listStudents(classId)`; `getStudent(classId, studentId) -> student | null`
  - `recordClassRun({ sessionId, classId, studentId, assignmentId = null })`; `getClassRun(sessionId) -> (row & { class_name, class_code }) | null`; `listClassRuns(classId) -> Array<{ session_id, student_id, assignment_id, created_at, state }>` (joins `sessions.state`)
- IDs for teachers/classes/students: `crypto.randomUUID()`. Timestamps: `Date.now()` ms, matching `sessions.created_at`.

- [ ] **Step 1: Write failing tests** in `test/classRepo.test.js`:
  - `normalizeCode accepts dashes, spaces, lowercase`: `normalizeCode('k7q 2-mx') === 'K7Q2MX'`; `formatCode('K7Q2MX') === 'K7Q-2MX'`.
  - `createClass makes a 6-char code from the safe alphabet`: matches `/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/`; `getClassByCode(formatCode(c.code).toLowerCase()).id === c.id`.
  - `getClassForTeacher hides other teachers' classes`: returns `null` for teacher B.
  - `upsertStudent merges by normalized email`: `upsertStudent(cid,'Sam','Sam@School.edu ')` then `upsertStudent(cid,'Sam P','sam@school.edu')` → same `id`, `name === 'Sam P'`, `listStudents(cid).length === 1`.
  - `same email in two classes is two students`.
  - `deleteAssignment keeps the run as class practice`: after recording a run with `assignmentId`, `deleteAssignment(aid)` → `getClassRun(sid).assignment_id === null`, `getAssignment(aid) === null`.
  - `schema applies cleanly over a pre-existing database`: create a temp file DB, create a session with the old schema via `getDb(file)`, `resetForTests()`, reopen with `getDb(file)` → old session still readable and `classes` table exists.
- [ ] **Step 2: Run** `npm test` — Expected: the new tests FAIL (`Cannot find module '../services/classRepo'`).
- [ ] **Step 3: Add tables** to `database/schema.sql` as in the spec's Data model, with `REFERENCES ... ON DELETE CASCADE` from classes→teachers, assignments/students/class_runs→classes, class_runs→sessions, and `class_runs.assignment_id REFERENCES assignments(id) ON DELETE SET NULL`. Add `idx_class_runs_class ON class_runs(class_id)`.
- [ ] **Step 4: Implement `services/classRepo.js`** with the signatures above.
- [ ] **Step 5: Run** `npm test` — Expected: all tests pass (65 existing + new).
- [ ] **Step 6: Commit** `feat(db): class, assignment, student, and run-link tables`.

### Task 2: Teacher auth service

**Files:**
- Modify: `package.json` (add `bcryptjs`, `google-auth-library`)
- Create: `services/teacherAuth.js`
- Test: `test/teacherAuth.test.js`

**Interfaces:**
- Consumes: `classRepo` teacher functions (Task 1).
- Produces: `makeTeacherAuth({ googleVerifier = defaultGoogleVerifier } = {})` returning:
  - `async signup({ email, name, password }) -> teacher` — throws `httpError(400)` for invalid email or password < 8, `httpError(409, 'An account with that email already exists.')` if the email has a password already; if the email exists via Google only, sets the password and returns that teacher.
  - `async login({ email, password }) -> teacher` — throws `httpError(401, 'Email or password is incorrect.')`.
  - `async googleLogin(credential) -> teacher` — `googleVerifier(credential)` resolves `{ sub, email, name, email_verified }`; reject unverified email with 401; find by sub, else by email (then link sub), else create.
  - `createSession(teacherId) -> token` (32 random bytes hex, stored in `teacher_sessions`, 30-day `expires_at`); `getTeacherForToken(token) -> teacher | null` (null if expired); `deleteSession(token)`.
  - `requireTeacher(req, res, next)` — reads cookie `emt_teacher` (parse `req.headers.cookie` by hand; no new dependency), sets `req.teacher` or responds `401 { error: 'Please sign in again.' }`.
  - `setCookie(res, token)`, `clearCookie(res)` — per Global Constraints.
- `defaultGoogleVerifier(credential)` uses `OAuth2Client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })` and returns `ticket.getPayload()`.
- Reuse the `httpError(status, message)` shape from `services/chatService.js` (`err.status`, `err.expose = true`); move it to `services/httpError.js` and import it in both places.

- [ ] **Step 1: Write failing tests**:
  - `signup then login returns the same teacher`; `login with wrong password throws 401`; `signup rejects 7-char password with 400`; `duplicate signup throws 409`.
  - `email casing is normalized`: signup `Ms.Lee@School.edu`, login `ms.lee@school.edu` works.
  - `googleLogin links to an existing email account`: signup with email, then `googleLogin` with a fake verifier returning same email → same `id`, `google_sub` set.
  - `signup after Google-only account sets a password on the same teacher`.
  - `googleLogin rejects email_verified=false with 401`.
  - `expired session returns null`: insert a session with `expires_at = Date.now() - 1` → `getTeacherForToken` is `null`.
- [ ] **Step 2: Run** `npm test` — Expected: new tests FAIL.
- [ ] **Step 3:** `npm install bcryptjs google-auth-library`; create `services/httpError.js`; implement `services/teacherAuth.js`.
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(auth): teacher signup, login, Google sign-in, cookie sessions`.

### Task 3: Teacher auth routes and server wiring

**Files:**
- Create: `routes/teacher.js` (auth endpoints only in this task)
- Modify: `server.js`, `.env.example`, `render.yaml`
- Test: `test/teacherRoutes.test.js`

**Interfaces:**
- Consumes: `makeTeacherAuth` (Task 2).
- Produces: `createTeacherRouter({ teacherAuth })` mounted at `/api/teacher`. `createApp` gains `teacherAuth` (default `makeTeacherAuth()` when omitted, so existing tests keep working).
  - `POST /signup {email,name,password}` → 200 `{ teacher: { id, email, name } }` + cookie
  - `POST /login {email,password}` → same shape + cookie
  - `POST /google {credential}` → same shape + cookie; 501 `{ error: 'Google sign-in is not configured.' }` when `GOOGLE_CLIENT_ID` is unset
  - `POST /logout` → 200 `{ ok: true }`, clears cookie, deletes session
  - `GET /me` → `{ teacher }` or 401
  - Errors with `err.expose` respond `err.status` + `{ error: err.message }`.
- `server.js`: add an `authLimiter` (`rateLimit`, 10/min) applied to `/api/teacher/login`, `/signup`, `/google` before the router. Configure `helmet` so Google Identity Services works: `crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }` and CSP directives adding `https://accounts.google.com` to `script-src`, `frame-src`, `connect-src`, and `https://accounts.google.com/gsi/style` to `style-src` (keep the rest of helmet's defaults).
- `.env.example`: add commented `GOOGLE_CLIENT_ID=` and `VITE_GOOGLE_CLIENT_ID=` with a one-line note. `render.yaml`: add both with `sync: false`.

- [ ] **Step 1: Write failing tests** (supertest `agent` to keep cookies):
  - `signup sets an httpOnly emt_teacher cookie and /me returns the teacher`.
  - `logout makes /me return 401`.
  - `POST /google returns 501 when GOOGLE_CLIENT_ID is unset`.
  - `POST /google with a fake verifier signs in` (inject `teacherAuth: makeTeacherAuth({ googleVerifier: async () => ({ sub:'g1', email:'t@x.edu', name:'T', email_verified:true }) })`, set `process.env.GOOGLE_CLIENT_ID='test'` inside the test and restore after).
  - `eleventh login attempt in a minute gets 429`.
  - `responses allow Google popups`: `res.headers['cross-origin-opener-policy'] === 'same-origin-allow-popups'` and `content-security-policy` contains `accounts.google.com`.
- [ ] **Step 2: Run** `npm test` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** the router, server wiring, env and render config.
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): teacher auth routes`.

### Task 4: Class-linked scenarios and session class info

**Files:**
- Modify: `routes/scenarios.js`, `routes/sessions.js`
- Test: `test/scenariosRoute.test.js`, `test/sessionsRoute.test.js`

**Interfaces:**
- Consumes: `classRepo.getClassByCode`, `getAssignment`, `upsertStudent`, `recordClassRun`, `getClassRun`.
- Produces:
  - `POST /api/scenarios` accepts `{ type, subtype, classCode?, assignmentId?, studentName?, studentEmail? }`. When `assignmentId` is given, `type/subtype` come from the assignment (body values ignored). When either class field is given, `studentName` and `studentEmail` are required (400 `'Enter your name and email.'`; email must contain `@`). Unknown code → 400 `"We couldn't find that class code. Check it with your teacher."`; unknown assignment → 404 `'This assignment no longer exists. Ask your teacher for a new link.'`. Validate **before** calling `scenarioGenerator.generate` (no OpenAI spend on bad input). Response adds `classRun: { className, classCode, assignmentId } | null`.
  - `GET /api/assignments/:id` (public, on the scenarios router) → `{ id, title, type, subtype, dueAt, className }` or 404 with the message above.
  - `GET /api/classes/:code` (public) → `{ name, code }` (formatted) or 404 — used by the join page to show the class name.
  - `GET /api/sessions/:id` adds `classRun: { className, classCode, assignmentId } | null` — no student fields.

- [ ] **Step 1: Write failing tests**:
  - `POST /api/scenarios without class fields creates no class_run` (`getClassRun(sid) === null`, `body.classRun === null`).
  - `POST /api/scenarios with classCode links the run`: lowercase/dashed code works; `listClassRuns(cid).length === 1`.
  - `assignment run uses the assignment's subtype`: body says `MVC`, assignment says `Cardiac` → generator called with `('medical','Cardiac')`.
  - `bad class code returns 400 and never calls the generator` (generator fake throws if called).
  - `missing email with classCode returns 400`.
  - `deleted assignment returns 404 with readable message`.
  - `GET /api/sessions/:id includes classRun without student identity`: `JSON.stringify(body)` contains neither the student's name nor email.
- [ ] **Step 2: Run** `npm test` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): link scenario runs to classes and assignments`.

### Task 5: Class statistics

**Files:**
- Create: `services/classStats.js`
- Test: `test/classStats.test.js`

**Interfaces:**
- Produces: `computeClassOverview({ runs, students, assignments }) -> Overview`, a pure function. `runs` are `listClassRuns` rows (with `state` JSON string); `students`/`assignments` are repo rows.
  ```
  Overview = {
    metrics: { gradedRuns, studentsJoined, classAvg, traumaAvg, medicalAvg },   // avgs: rounded int or null
    criteria: [{ criterion, avg, count }],                                      // avg 1 decimal, ascending
    assignments: [{ id, title, type, subtype, dueAt, done, late, avg, missing: [studentId] }],
    students: [{ id, name, email, runs, gradedRuns, avg, weakest, missingAssignmentIds: [] }],
  }
  ```
  Also `summarizeRun(run) -> { sessionId, type, subtype, createdAt, assignmentId, status: 'graded'|'in_progress', score, late }` for the student page.
- Rules (from the spec): only runs whose parsed state has `grade.overall.score` (number) and a `grade.rubric` array count as graded; averages use `grade.overall.score`; criterion averages group by `criterion` name across types and use numeric `score`s only; an assignment's `done` = distinct students with ≥1 graded run on it, `avg` = mean of each such student's **latest** graded attempt, `late` = students whose latest graded attempt's `created_at > due_at`; `missing` = joined students with no graded run on it; `weakest` = the student's lowest-average criterion (ties → first in rubric order).

- [ ] **Step 1: Write failing tests** with small hand-built fixtures:
  - `ungraded runs are excluded from averages but counted in student runs`.
  - `assignment avg uses each student's latest graded attempt`: scores 40 then 80 for one student → `avg === 80`, `done === 1`.
  - `late is counted when graded after due date`.
  - `shared criteria merge across trauma and medical`: `BSI / PPE` appears once with `count === 2`.
  - `criteria are sorted weakest first`.
  - `missing lists joined students without a graded run on that assignment`.
  - `malformed grades are skipped`: runs with `state` null, `grade: null`, `rubric: [null, { criterion:'X', score:'3' }]` → no throw; non-numeric scores ignored.
  - `empty class returns zeroed metrics and null averages`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(stats): class overview aggregation`.

### Task 6: Teacher class, assignment, student, and run routes

**Files:**
- Modify: `routes/teacher.js`
- Test: `test/teacherRoutes.test.js`

**Interfaces:**
- Consumes: `requireTeacher` (Task 2), `classRepo` (Task 1), `computeClassOverview`, `summarizeRun` (Task 5), `sessionManager.getHistory`.
- Produces (all behind `requireTeacher`):
  - `GET /classes` → `[{ id, name, code (formatted), studentsJoined, gradedRuns }]`
  - `POST /classes {name}` → class (400 if name blank)
  - `GET /classes/:id` → `{ class: { id, name, code }, ...Overview }`
  - `POST /classes/:id/assignments {type, subtype, title?, dueAt?}` → assignment (validate with `scenarioTypes.isValid`; default title `"<Type> · <Subtype>"`; `dueAt` ISO date string → ms or null)
  - `DELETE /assignments/:id` → `{ ok: true }`
  - `GET /classes/:id/students/:studentId` → `{ student, runs: summarizeRun[] }` newest first
  - `GET /runs/:sessionId` → `{ run: summarizeRun, student: { id, name }, scenario, grade, messages }` where `messages` excludes `system` role
  - Each looks up via the teacher's own classes; anything not owned → 404 `{ error: 'not found' }`.

- [ ] **Step 1: Write failing tests**:
  - `routes require sign-in`: `GET /api/teacher/classes` without cookie → 401.
  - `teacher B gets 404 on teacher A's class, student, run, and assignment delete` (four assertions).
  - `free-practice runs never appear`: create one class run and one free run → `GET /classes/:id` has `metrics.gradedRuns === 1` and `GET /runs/<freeSid>` → 404.
  - `run detail omits system messages and includes grade`.
  - `creating an assignment with an invalid subtype returns 400`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): teacher dashboard routes`.

### Task 7: Student-facing frontend

**Files:**
- Modify: `src/lib/api.js`, `src/App.jsx`, `src/pages/SelectionScreen.jsx`, `src/pages/ScenarioRunner.jsx`, `src/pages/FeedbackDisplay.jsx`, `src/pages/About.jsx`, `src/components/Disclaimer.jsx`
- Create: `src/lib/student.js`, `src/components/GradeView.jsx`, `src/components/ScenarioGrid.jsx`, `src/components/StudentForm.jsx`, `src/pages/JoinClass.jsx`, `src/pages/AssignmentStart.jsx`

**Interfaces:**
- `src/lib/student.js`: `getStudent() -> { name, email } | null`, `saveStudent({ name, email })` — `localStorage` key `emt:student`, wrapped in try/catch.
- `apiFetch`: add a 401 entry `'Please sign in again.'` to `STATUS_MESSAGES` and `credentials: 'same-origin'`.
- `GradeView({ grade })`: the summary/rubric/strengths/improvements cards moved out of `FeedbackDisplay` unchanged (including `scoreColor`).
- `ScenarioGrid({ catalog, busy, onPick(type, subtype) })`: the Tabs + card grid moved out of `SelectionScreen`.
- `StudentForm({ onSubmit({ name, email }), submitLabel })`: prefilled from `getStudent()`, shows the Global Constraints notice, validates non-empty name and an `@` in email inline.
- Routes: `/join/:code` → `JoinClass` (fetch `/api/classes/:code`, form, then `ScenarioGrid` posting `{ type, subtype, classCode, studentName, studentEmail }`); `/a/:assignmentId` → `AssignmentStart` (fetch `/api/assignments/:id`, show title/class/due date and "late" note if past due, form, then post `{ assignmentId, studentName, studentEmail }`).
- `SelectionScreen`: label the grid with the free-practice copy; add a "Joining a class?" input + button that navigates to `/join/<normalized code>`.
- `ScenarioRunner`: switch `refreshState` to `apiFetch`; read `classRun` from `/api/sessions/:id`; show a badge "Shared with <className>" or "Free practice"; `restart()` re-posts with `classCode`/`assignmentId` and `getStudent()` when `classRun` is set (if `getStudent()` is null, navigate to `/join/<code>` or `/a/<id>` instead).
- `FeedbackDisplay`: render `<GradeView grade={grade} />`; same badge; "Start a new scenario" goes to `/a/<id>` or `/join/<code>` for class runs, `/` otherwise.
- `About` / `Disclaimer`: one sentence each that class runs share name, email, scores, and transcripts with the teacher; free practice does not.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `npm run lint && npm run build && npm test` — Expected: no lint errors, build succeeds, all tests pass.
- [ ] **Step 3: Verify in the browser** (preview `npm run dev:all`): with a class and assignment created via `curl` against the teacher API, open `/join/<code>` and `/a/<id>`, submit the form, confirm the run page shows "Shared with <class>", and the home grid shows the free-practice label. Use a stubbed or real `OPENAI_API_KEY` from `.env`.
- [ ] **Step 4: Commit** `feat(ui): class join and assignment flows for students`.

### Task 8: Teacher frontend

**Files:**
- Modify: `src/App.jsx`, `src/components/Header.jsx`
- Create: `src/lib/useTeacher.js`, `src/components/GoogleSignInButton.jsx`, `src/pages/teacher/TeacherSignIn.jsx`, `src/pages/teacher/TeacherClasses.jsx`, `src/pages/teacher/ClassOverview.jsx`, `src/pages/teacher/StudentRuns.jsx`, `src/pages/teacher/RunDetail.jsx`

**Interfaces:**
- `useTeacher() -> { teacher, loading, refresh, logout }` — calls `GET /api/teacher/me`; 401 → `teacher = null`.
- `GoogleSignInButton({ onCredential(credential) })` — renders nothing when `import.meta.env.VITE_GOOGLE_CLIENT_ID` is unset; otherwise loads `https://accounts.google.com/gsi/client` once, `google.accounts.id.initialize({ client_id, callback })`, `renderButton`.
- Routes: `/teacher` (sign in/up if signed out, else class list + "New class"), `/teacher/classes/:id` (the approved mockup: header with formatted code and copyable join link `<origin>/join/<code>`, metric cards, "What the class needs to work on" bars weakest-first colored by avg <1.5 danger / <2.25 warning / else success, assignments table with "done/joined · N late", new-assignment form with subtype select + optional due date + copyable `<origin>/a/<id>`, students table with weakest and "Missing <title>" badges), `/teacher/classes/:id/students/:studentId`, `/teacher/runs/:sessionId` (`GradeView` + transcript via existing `ChatBubbles`).
- Teacher routes render inside a `max-w-5xl` container; student routes keep `max-w-3xl`.
- `Header`: add a "Teachers" `NavItem` to `/teacher`; show "Sign out" when signed in.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Run** `npm run lint && npm run build && npm test` — Expected: clean.
- [ ] **Step 3: Verify in the browser**: sign up with email/password, create a class and assignment, copy both links; at mobile width (375px) the class overview has no horizontal page scroll (tables may scroll inside their card).
- [ ] **Step 4: Commit** `feat(ui): teacher dashboard pages`.

### Task 9: End-to-end check and docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: End-to-end in the browser** with a real `OPENAI_API_KEY`: teacher signs up → creates class + assignment → second tab opens assignment link, enters name/email, runs and grades a scenario → same tab runs a free-practice scenario and grades it → teacher dashboard shows exactly one graded run, its rubric and transcript, and no trace of the free-practice run.
- [ ] **Step 2: Boot against a copy of an existing DB**: `cp database/emt.db "$SCRATCH/emt-copy.db"` (skip if no local DB) and start the server with `DB_PATH` pointing at it; an old session's `/session/:id/feedback` still loads.
- [ ] **Step 3: Update `CLAUDE.md`**: architecture tree (new files), "How a session works" (class link step), a "Teachers" section (auth, routes, privacy rule that free practice never reaches teachers), env vars, Google Cloud OAuth setup steps (create OAuth client of type Web, add the Render URL and `http://localhost:5173` as authorized JavaScript origins, set both env vars), and test count.
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `docs: teacher dashboard in CLAUDE.md`.
