# Teacher dashboard — design

## Context

The trainer is used in EMT classes, but today every run is anonymous: no accounts, and a run is reachable only by its session UUID. Teachers have no way to see how their students are doing. The user wants teachers to see their students' scores, rubric breakdowns, the grader's strengths/improvements, and the scenario transcript — mainly to learn **what the class (and each student) needs to work on and how the class is doing overall**. Runs are practice/participation, not real course grades.

Students use the trainer both for **assigned homework** and **in-class practice**. They also need a **free practice mode** whose runs are never visible to a teacher, so they can practice without fear of being watched.

## Goals

- Teachers sign themselves up, create classes, and create assignments.
- Students attach a run to a class with **name + email only** (no student accounts, no passwords).
- Class overview answers "what does the class need to work on?" first: per-criterion rubric averages, weakest first.
- Teacher can drill into any student and any run: score, rubric rows (0–3 + feedback), strengths, improvements, full transcript.
- Free practice is the existing anonymous flow, never linked to a class.

## Non-goals (v1)

- Student accounts / student login, student "my history" page.
- Password reset or any email sending.
- Gradebook/LMS export, CSV export, editing grades, re-grading.
- Multiple teachers co-owning one class.

## Anti-goals (would make it a failure even if it works)

- A free-practice run ever appearing on a teacher dashboard, in any form (not even a count).
- One student's data visible to another student, or to a teacher of a different class.
- Starting an assigned run becoming slow or annoying (more than one short form, once per device).
- Breaking existing anonymous use or existing production data on the Render disk.

## Decided with the user

- **Student identity:** class code or assignment link, then name + email typed once per device (remembered in `localStorage`). No verification — acceptable because runs are low-stakes; impersonation can only *add* runs, never read anyone's data.
- **Assignments:** teachers create assignments (one specific scenario type/subtype + due date) and share a link. The **class code** is the fallback: a student enters it to run *any* scenario as class practice, not tied to an assignment.
- **Teacher login:** **Sign in with Google** as the primary button (free; Google Cloud OAuth client, scopes `openid email profile`), plus **email + password** fallback. No password reset in v1.
- **Teacher view:** as in the approved mockup — class header with code; metric cards (graded runs, class avg, trauma avg, medical avg); "what the class needs to work on" ranked criteria bars; assignments table (due, done X/N, avg); students table (runs, avg, weakest criterion, "missing <assignment>" flag); run detail (score, rubric rows, strengths, improvements, "view full transcript").
- **Free practice:** stays exactly as today's home-screen flow; nothing asked, nothing linked.
- **No roster in v1:** students appear on the dashboard when they first submit. "Missing <assignment>" only flags students known to the class (≥1 run of any kind) who have no graded run on that assignment; the UI says "N students have joined" rather than implying a full roster.
- **Due dates — allow, mark late:** assignment links keep working after `due_at`. Late graded runs count toward "done" and the assignment average, and are labeled "late" in the teacher's views (assignment table shows e.g. "18/24 · 3 late").

## Settled by Claude after the builder check
- **Retries stay in the class:** `ScenarioRunner` "Restart" and FeedbackDisplay "Start a new scenario" on a class run automatically re-post the same class code / assignment. `GET /api/sessions/:id` adds `classRun: { className, assignmentId, classCode } | null` (no student name/email) so the runner can do this and show the "Shared with <class>" badge.
- **Public run links stay public:** `GET /api/sessions/:id` remains ungated by UUID, as today, and never returns student name or email — identity lives only in teacher-only tables, so a leaked feedback link exposes a transcript without identity.
- **Class-code practice never counts toward an assignment,** even for the same subtype; only runs started from the assignment link do.

## Design (builder's calls marked *[call]*)

### Data model — new tables only, `sessions` untouched
Add to `database/schema.sql` (all `CREATE TABLE IF NOT EXISTS`, so the existing prod DB picks them up on boot with no migration):

- `teachers(id, email UNIQUE, name, password_hash NULL, google_sub UNIQUE NULL, created_at)` — a teacher may have either or both login methods; same email links them. *[call]*
- `teacher_sessions(token PRIMARY KEY, teacher_id, created_at, expires_at)` — opaque random token in an httpOnly, `SameSite=Lax`, `Secure` (prod) cookie; 30-day expiry. *[call]*
- `classes(id, teacher_id, name, code UNIQUE, created_at)` — code is 6 chars from an unambiguous alphabet (no 0/O/1/I), shown as `K7Q-2M`. *[call]*
- `assignments(id, class_id, type, subtype, title, due_at NULL, created_at)` — id is a random slug used in the share link.
- `students(id, class_id, email_normalized, name, created_at, UNIQUE(class_id, email_normalized))` — normalized = trimmed + lowercased; latest typed name wins.
- `class_runs(session_id PRIMARY KEY REFERENCES sessions, class_id, student_id, assignment_id NULL, created_at)` — the only link between a run and a teacher. Absence of a row = free practice.

### Backend
- **`POST /api/scenarios`** accepts optional `{ classCode | assignmentId, studentName, studentEmail }`. If present: validate the code/assignment (400 with a readable message if not found), upsert the student, create the session as today, insert `class_runs`. For an assignment, `type/subtype` come from the assignment, not the client. Without them, behavior is unchanged (free practice).
- **New `services/teacherAuth.js`** — bcrypt hashing (`bcryptjs`, pure JS, avoids another native build on Render) *[call]*; Google ID-token verification with `google-auth-library` against `GOOGLE_CLIENT_ID`; session create/lookup/delete; `requireTeacher` middleware reading the cookie.
- **New `routes/teacher.js`** mounted at `/api/teacher`:
  - `POST /signup`, `POST /login`, `POST /google`, `POST /logout`, `GET /me`
  - `GET/POST /classes`, `GET /classes/:id` (overview payload: metrics, criterion averages, assignments with completion, students with avg/weakest/missing)
  - `POST /classes/:id/assignments`, `DELETE /assignments/:id` *[call: allow deleting assignments; runs stay, become class practice]*
  - `GET /classes/:id/students/:studentId` (that student's runs)
  - `GET /runs/:sessionId` (grade + transcript; 404 unless the run belongs to one of this teacher's classes)
  - Every route checks ownership (teacher → class → run). Ownership failures return 404, not 403.
- **New `services/classStats.js`** — computes the overview from `class_runs` + `sessions.state.grade`. Only **graded** runs count toward averages; started-but-ungraded runs show as "in progress" in a student's run list. *[call]* Multiple attempts on one assignment all count; the assignment "done" column counts a student once if they have ≥1 graded run on it, and the assignment avg uses each student's **latest** graded attempt. *[call]* Per-criterion averages group by criterion name across trauma/medical rubrics (shared names like "BSI / PPE" merge; type-specific ones only average over that type). Compute in JS per request — class sizes are tiny. *[call]*
- Rate limiting already covers POSTs; add a stricter limit on `/api/teacher/login` and `/signup` (e.g. 10/min/IP) against password guessing. *[call]*
- New env vars: `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (frontend build). Add to `.env.example` and `render.yaml` (`sync: false`). If unset, hide the Google button and keep email/password working.

### Frontend
- **Home (`SelectionScreen`)**: keep as free practice; add a small "Joining a class? Enter class code" entry and a "Teacher sign in" link in the header. Label the current grid "Free practice — not shared with any teacher."
- **`/join/:code`** and **`/a/:assignmentId`**: name + email form (prefilled from `localStorage`), a one-line notice "Your name, email, scores, and transcript will be visible to your teacher." Join → class-practice scenario picker (same grid, posting with the class code). Assignment → starts that scenario directly.
- **`ScenarioRunner` / `FeedbackDisplay`**: show a small badge "Shared with <class name>" vs "Free practice" so students always know. Otherwise unchanged.
- **Teacher pages** under `/teacher`: sign in / sign up (Google button via Google Identity Services script + email/password form), class list, class overview (the mockup), student page, run page (reuse rubric/strengths rendering from `FeedbackDisplay` — extract a shared `GradeView` component — and `ChatBubbles` for the transcript).
- `apiFetch` (`src/lib/api.js`) gains `credentials: 'same-origin'` (default already sends cookies same-origin; confirm) and a 401 → "Please sign in again." message.
- The app container is `max-w-3xl`; teacher pages may widen to `max-w-5xl`. *[call]*

### Privacy & honesty
- Free-practice runs are still stored on the server anonymously, as today (the AI runs server-side). Copy says "not shared with any teacher," never "not uploaded." *[call — surfaced to user in the handoff]*
- Update `About.jsx` / `Disclaimer.jsx` to mention that class runs share name, email, scores, and transcripts with the teacher.

## Left to the builder
Component structure, exact copy, styling details within the existing shadcn/Tailwind look, test breakdown, file organization within the patterns above.

## Critical files
- Modify: `database/schema.sql`, `routes/scenarios.js`, `server.js`, `src/App.jsx`, `src/pages/SelectionScreen.jsx`, `src/pages/ScenarioRunner.jsx`, `src/pages/FeedbackDisplay.jsx`, `src/components/Header.jsx`, `src/lib/api.js`, `.env.example`, `render.yaml`, `CLAUDE.md`
- New: `services/teacherAuth.js`, `services/classStats.js`, `routes/teacher.js`, `src/pages/teacher/*`, `src/pages/JoinClass.jsx`, `src/components/GradeView.jsx`, tests `test/teacherAuth.test.js`, `test/teacherRoutes.test.js`, `test/classStats.test.js`
- Reuse: `sessionManager.getHistory` (transcript), `createApp` dependency injection for route tests with supertest, `databaseManager.resetForTests` with `:memory:`, `ChatBubbles`, `parseRoles`.

## Next steps after approval
1. Save this design to `docs/superpowers/specs/2026-10-21-teacher-dashboard-design.md` and commit it.
2. Invoke `superpowers:writing-plans` to produce the implementation plan (`docs/superpowers/plans/2026-10-21-teacher-dashboard.md`).
3. Execute the plan with TDD.

## Verification
- `npm test`: all existing 65 tests still pass, plus new tests for: auth (signup/login/google with mocked verifier, cookie session, logout), ownership (teacher B gets 404 on teacher A's class/run), `POST /api/scenarios` with class code/assignment creates `class_runs` and without it creates none, `classStats` aggregation (graded-only, latest attempt, criterion merge).
- Manual end-to-end via the preview browser: sign up as a teacher → create class + assignment → open assignment link in a second tab, enter name/email, run and grade a scenario → run a free-practice scenario → confirm the teacher dashboard shows the assigned run with rubric/transcript and shows no trace of the free-practice run.
- Boot against a copy of an existing `emt.db` to confirm new tables are created and old sessions still load.
