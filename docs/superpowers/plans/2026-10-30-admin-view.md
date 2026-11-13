# Admin View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site admin one place to see every scenario run (free practice and every teacher's classes) plus usage stats.

**Architecture:**
- Admin is an ordinary teacher account whose email is in `ADMIN_EMAILS` and which is Google-verified.
- A new `/api/admin` router reads all sessions through a read-only `adminRepo`. A pure `adminStats` module aggregates them, reusing the dashboard's audited scoring.
- The React app adds `/admin` (stats), `/admin/runs` (list) and `/admin/runs/:id` (the existing `RunDetail`, pointed at the admin API).

**Tech Stack:** Express, better-sqlite3, React 19 with shadcn/ui, and the custom test runner with supertest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-30-admin-view-design.md`

---

## Design

**Why:** today a run is visible only on the device that created it, or to the teacher who owns its class. The user wants one admin view of every run, plus usage stats: total runs, runs in the past day and week, runs per class, and anything else useful.

**Decided with the user**
- **Include free practice.** Update the notices that currently promise "Free practice — not shared with any teacher." New wording: free practice still isn't shared with teachers, but the site administrator may review scenario transcripts and grades to improve the trainer; no name or email is attached.
- **Who is admin:** a teacher account whose email is in the `ADMIN_EMAILS` env var (comma-separated).
- **Scope:** read-only. No editing or deleting runs.

**My calls**
- **Admin must be Google-verified (`google_sub` set).** Password signup doesn't verify email, so an allow-list alone would let someone who signs up first with the admin's address become admin. If a squatter does that, the real owner signing in with Google links the account, clears the password and signs out the squatter's sessions (existing behavior). This means Google sign-in must be configured on Render for admin to work in production.
- **Non-admins get 404** on admin routes, matching the existing "another teacher's resource → 404" rule. Signed-out requests get 401.
- **Scores** use the dashboard's audited rubric percentage (`parseRun` in `services/classStats.js`), never the grader's own `overall.score`.
- **Stats:**
  - totals for all time, 24 h, 7 days and 30 days; class vs practice; completion rate;
  - average score for all time and 7 days; score bands;
  - 30-day runs per day in the viewer's timezone;
  - active students in the last 7 days;
  - per-class table (plus a free-practice row);
  - per-scenario table;
  - weakest rubric criteria (trauma and medical separately);
  - median student messages per run; abandoned rate;
  - database size vs the 1 GB disk; AI tokens used today vs the daily budget.
- **Chart:** an inline SVG with no new dependency.
- **Weight:**
  - The admin pages are lazy-loaded, so the student bundle doesn't grow.
  - Stats are cached for 60 s on the server, so refreshing doesn't re-scan every run.
  - No AI calls and no new tables.

## Global Constraints

- Node ≥ 20, CommonJS on the backend; frontend is ESM with the `@/` alias.
- No new npm dependencies.
- Admin routes are GET only, mounted at `/api/admin`.
- Free-practice runs in admin responses have `student: null` and `classRun: null`.
- System messages never leave the server, matching the teacher run detail.
- Dashboard score display: `fmtScore` → `NN%`, `—` when null.
- The disk size constant is `1_000_000_000` bytes, from `render.yaml` `sizeGB: 1`.
- Every admin page works at phone width, in light and dark.

## Review Focus

1. **`ADMIN_EMAILS` with different case or spaces** (`" Admin@X.edu , b@y.edu"`) still matches `admin@x.edu`. Test in Task 2.
2. **`ADMIN_EMAILS` unset or empty** means nobody is admin and nothing crashes. Test in Task 2.
3. **Malformed query params** (`kind=foo`, `limit=abc`, `-5` or `1000`, `before=xyz`, `tzOffset=abc`) fall back to defaults, not 500. Tests in Tasks 3 and 5.
4. **Corrupt or partial session state** (unparseable JSON, a grade with no valid rubric rows) is listed as `in_progress` and never produces NaN in stats. Tests in Tasks 3 and 4.
5. **A run whose assignment was deleted** (`assignment_id` NULL) is still listed under its class with `late: false`. Test in Task 3.

## File Structure

| File | Responsibility |
|---|---|
| `services/teacherAuth.js` (modify) | `isAdmin`, `requireAdmin` |
| `routes/teacher.js` (modify) | `isAdmin` flag on teacher responses |
| `services/adminRepo.js` (new) | read-only SQL over all sessions |
| `services/classStats.js` (modify) | export `parseRun`, `addCriteria` |
| `services/adminStats.js` (new) | pure stats aggregation |
| `routes/admin.js` (new) | `/api/admin/runs`, `/runs/:id`, `/stats` |
| `server.js` (modify) | mount router, accept `tokenMeter` |
| `src/pages/teacher/RunDetail.jsx` (modify) | `endpoint` prop, free-practice heading |
| `src/components/AdminGate.jsx` (new) | non-admin → not found |
| `src/pages/admin/AdminRuns.jsx`, `AdminStats.jsx` (new) | admin pages |
| `src/App.jsx`, `src/components/Header.jsx` (modify) | routes, Admin link |
| `src/pages/SelectionScreen.jsx:58`, `src/pages/About.jsx:20` (modify) | privacy copy |
| `test/adminAuth.test.js`, `test/adminRoutes.test.js`, `test/adminStats.test.js` (new) | tests |

Test helper used throughout (put it at the top of each admin route test file):

```js
// Google-verified teacher + session cookie, without going through Google.
function signIn(email, { google = true } = {}) {
  const t = repo.createTeacher({ email, name: 'Admin', googleSub: google ? `g-${email}` : null, passwordHash: google ? null : 'h' });
  return { teacher: t, cookie: `emt_teacher=${makeTeacherAuth().createSession(t.id)}` };
}
```

---

### Task 1: Branch and save the design

- [ ] **Step 1:** `git checkout -b feat/admin-view` from up-to-date `main`.
- [ ] **Step 2:** Save the Design, Global Constraints and Review Focus sections to `docs/superpowers/specs/2026-10-30-admin-view-design.md`, and this whole plan to `docs/superpowers/plans/2026-10-30-admin-view.md`.
- [ ] **Step 3:** Commit: `git add docs/superpowers && git commit -m "docs: admin view design and plan"`.

### Task 2: Admin identity

**Files:** Modify `services/teacherAuth.js`, `routes/teacher.js`, `test/teacherRoutes.test.js`, `.env.example`, `render.yaml`. Create `test/adminAuth.test.js`.

**Interfaces — Produces:**
- `teacherAuth.isAdmin(teacher) → boolean`
- `teacherAuth.requireAdmin(req, res, next)`: sets `req.teacher`; responds 401 when signed out and 404 `{ error: 'not found' }` when not an admin.
- Teacher JSON gains `isAdmin: boolean`.

- [ ] **Step 1: Write failing tests** in `test/adminAuth.test.js`. Set `process.env.ADMIN_EMAILS` per test and restore it in `finally`.
  - `isAdmin true for Google-verified listed email, case/space-insensitive`: with `ADMIN_EMAILS=' Admin@X.edu , b@y.edu'`, a teacher `{ email: 'admin@x.edu', google_sub: 'g' }` → `true`.
  - `isAdmin false without google_sub`: same email with `google_sub: null` → `false`.
  - `isAdmin false for unlisted email` → `false`.
  - `isAdmin false when ADMIN_EMAILS unset or empty`: `delete process.env.ADMIN_EMAILS`, then `''` → `false`, no throw.
  - `/api/teacher/me reports isAdmin`: via the `signIn` helper; listed → `isAdmin === true`, unlisted → `false`.
- [ ] **Step 2:** Run `npm test`. Expected: the new tests fail (`isAdmin is not a function`).
- [ ] **Step 3: Implement.**
  - In `makeTeacherAuth`, add `isAdmin`: split `process.env.ADMIN_EMAILS || ''` on commas, `normalizeEmail` each entry (from `services/classRepo.js`), drop empty ones, and match `normalizeEmail(teacher.email)` with `!!teacher.google_sub`. Read the env var on every call.
  - Add `requireAdmin`, mirroring `requireTeacher`.
  - In `routes/teacher.js`, `publicTeacher(t)` returns `{ id, email, name, isAdmin: teacherAuth.isAdmin(t) }`. Move it inside `createTeacherRouter` so it can reach `teacherAuth`.
  - In `test/teacherRoutes.test.js`, the signup key-list assertion becomes `['email', 'id', 'isAdmin', 'name']`.
  - Add a commented `# ADMIN_EMAILS=` block to `.env.example` saying admin requires Google sign-in. Add `- key: ADMIN_EMAILS\n  sync: false` to `render.yaml`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(auth): ADMIN_EMAILS admins (Google-verified only)`.

### Task 3: Admin runs API

**Files:** Create `services/adminRepo.js`, `routes/admin.js`, `test/adminRoutes.test.js`. Modify `server.js`.

**Interfaces**
- **Consumes:** `requireAdmin` (Task 2); `summarizeRun(run, assignment)` from `services/classStats.js`; `sessionManager.getSession`, `sessionManager.getHistory`.
- **Produces:**
  - `adminRepo.listRuns({ kind, classId, before, limit }) → Row[]`. Rows come from `sessions s LEFT JOIN class_runs r LEFT JOIN classes c LEFT JOIN teachers t LEFT JOIN students st LEFT JOIN assignments a`, `WHERE s.state IS NOT NULL`, ordered `s.created_at DESC, s.rowid DESC`. Fields: `session_id, created_at, state, class_id, class_name, class_code, teacher_name, student_id, student_name, student_email, assignment_id, due_at, user_messages` (count of `role='user'` messages).
  - `adminRepo.getRun(sessionId) → Row | null` (same fields).
  - `createAdminRouter({ teacherAuth, tokenMeter }) → express.Router`.
  - `createApp({ ..., tokenMeter })`; `start()` passes the meter it already builds.
  - **Run item JSON:** `{ ...summarizeRun(row, { due_at: row.due_at }), messageCount, classRun: { classId, className, code, teacherName } | null, student: { name, email } | null }`. `code` is formatted with `formatCode`.

- [ ] **Step 1: Write failing tests** in `test/adminRoutes.test.js`. Seed data with `sm.createSession` + `sm.setScenario`, link class runs with `repo.createClass`/`upsertStudent`/`recordClassRun`, and set times with `UPDATE sessions SET created_at=?`.
  - `admin routes: 401 signed out, 404 ordinary teacher, 404 listed password-only account, 200 admin`.
  - `lists free practice and both teachers' class runs, newest first`: one practice run, plus one class run each for teachers A and B → 3 items, sorted by `createdAt` descending. The practice item has `classRun === null && student === null`; a class item has `classRun.teacherName` and `student.email`.
  - `kind filter and classId filter`: `kind=practice` → 1, `kind=class` → 2, `classId=<A's class>` → 1.
  - `pagination`: `limit=2` → 2 items and a `nextBefore`; fetching with `before=nextBefore` → 1 item and `nextBefore: null`.
  - `bad params fall back to defaults`: `kind=foo&limit=abc&before=xyz` → 200 with all 3. `limit=-5` and `limit=1000` also → 200 with all 3 (default 50, cap 100).
  - `sessions without a scenario are excluded`: a bare `sm.createSession()` is not listed.
  - `corrupt state is listed as in_progress`: `UPDATE sessions SET state='{bad'` → item `status === 'in_progress'`, `score === null`.
  - `deleted assignment keeps class, late false`: after `repo.deleteAssignment`, the item has `classRun` set and `late === false`.
  - `detail: practice run`: `GET /api/admin/runs/:id` → `student === null`, `classRun === null`, no `system` role in `messages`, `grade` present when graded.
  - `detail: class run includes class and teacher; unknown id → 404`.
- [ ] **Step 2:** Run `npm test`. Expected: the new tests fail (404 on `/api/admin/...`).
- [ ] **Step 3: Implement** `adminRepo`, `routes/admin.js` and the server mount.
  - **`kind`:** `all | class | practice`; anything else → `all`.
  - **`limit`:** an integer in 1–100, else 50.
  - **`before`:** a finite number, else ignored. `nextBefore` = the last item's `createdAt` when `items.length === limit`, else `null`.
  - **Router:** reuse the `handle()` try/catch pattern from `routes/teacher.js`.
  - **Detail response:** `{ run, student: { id, name, email } | null, classRun | null, scenario, grade, messages }`, split from state the same way `/api/teacher/runs/:id` does.
  - **Mount:** `app.use('/api/admin', createAdminRouter({ teacherAuth, tokenMeter }))` after the teacher router.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(api): admin run list and detail`.

### Task 4: Stats aggregation (pure)

**Files:** Create `services/adminStats.js`, `test/adminStats.test.js`. Modify `services/classStats.js` (export only).

**Interfaces**
- **Consumes:** `parseRun(row) → { type, subtype, graded, score, rubric }` and `addCriteria(map, rubric)`, now exported from `classStats.js`.
- **Produces:**
  - `computeAdminStats({ runs, classes, now, tzOffsetMin }) → Stats`.
  - `runs` items: `{ created_at, state, class_id, student_id, user_messages }`.
  - `classes` items: `{ id, name, code, teacher_name, students }`.

```
Stats = {
  totals: { all, last24h, last7d, last30d, class, practice, graded, completionRate },   // completionRate int % | null
  scores: { avgAll, avg7d, bands: { lt50, from50, from70, from85 } },                 // bands: <50, 50–69, 70–84, ≥85
  daily: [{ date: 'YYYY-MM-DD', started, graded }],                                   // 30 entries, oldest first, ends today
  activeStudents7d,
  perClass: [{ classId, name, teacher, code, students, runs, graded, avgScore, lastActivity }], // + { classId: null, name: 'Free practice', ... } ; runs desc; includes classes with 0 runs
  perScenario: [{ type, subtype, runs, completionRate, avgScore }],                    // runs desc
  criteria: { trauma: [{ criterion, avg }], medical: [...] },                         // avg 0–3, 2 dp, lowest first
  engagement: { medianUserMessages, abandonedRate },
}
```

**Rules:**
- **Time windows:** a run is "within 24 h" when `created_at > now - 86_400_000` (7 and 30 days likewise).
- **Day key:** `new Date(ms - tzOffsetMin * 60_000).toISOString().slice(0, 10)`. `tzOffsetMin` follows JS `getTimezoneOffset()` semantics.
- **Abandoned:** not graded, `user_messages < 3`, and started more than 24 h before `now`. `abandonedRate` = abandoned ÷ runs started more than 24 h ago, as an int %, or `null`.
- **Criteria grouping:** criteria are grouped by the run's `state.expectedAssessment` (`trauma` | `medical`).
- **Empty data:** averages and rates are `null`, never NaN.

- [ ] **Step 1: Write failing tests** with a fixed `now = Date.UTC(2026, 9, 30, 12)`.
  - `windows count boundaries`: runs at `now-1h`, `now-25h`, `now-8d` and `now-31d` → `last24h 1`, `last7d 2`, `last30d 3`, `all 4`.
  - `daily buckets honor tzOffset`: a run at `Date.UTC(2026,9,30,3)` with `tzOffsetMin 420` (PDT) lands in `'2026-10-29'`. `daily.length === 30` and the last date is `'2026-10-30'` with offset 0.
  - `scores use audited percent, ignore overall.score`: rubric scores `[3,3,0]` with `overall.score 99` → `avgAll === 67`, in `bands.from50`.
  - `completion and abandoned`: of 4 runs started more than 24 h ago, 1 is graded and 2 are ungraded with 1 user message → `completionRate 25`, `abandonedRate 50`.
  - `perClass includes zero-run classes and a Free practice row`.
  - `perScenario groups by type and subtype`.
  - `criteria lowest first, split trauma/medical`.
  - `corrupt state counts as a run, never NaN`.
  - `empty input`: `computeAdminStats({ runs: [], classes: [], now, tzOffsetMin: 0 })` → `totals.all === 0`, `completionRate === null`, `avgAll === null`, `abandonedRate === null`, `medianUserMessages === null`, and no value anywhere is `NaN` (walk the object recursively with `Number.isNaN`).
- [ ] **Step 2:** Run `npm test`. Expected: fails (module not found).
- [ ] **Step 3: Implement** `computeAdminStats` and export `parseRun` and `addCriteria`. Update the `classStats.js` header comment to say admin stats live in `adminStats.js`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(stats): admin usage aggregation`.

### Task 5: Stats endpoint

**Files:** Modify `services/adminRepo.js`, `routes/admin.js`, `test/adminRoutes.test.js`.

**Interfaces**
- **Consumes:** `computeAdminStats` (Task 4); `tokenMeter.snapshot() → { date, tokens, budget }`.
- **Produces:**
  - `adminRepo.listStatsRows()`, `adminRepo.listClassesWithTeachers()`, `adminRepo.dbSizeBytes()` (via `PRAGMA page_count` × `page_size`).
  - `GET /api/admin/stats?tzOffset=` → `{ ...Stats, storage: { bytes, diskBytes: 1_000_000_000 }, aiToday?: { date, tokens, budget } }`.

- [ ] **Step 1: Write failing tests:**
  - `stats 404 for non-admin`.
  - `stats shape for admin`: has `totals`, `daily` (length 30), `perClass`, and `storage.bytes > 0`.
  - `aiToday present only with tokenMeter`: `createApp({ tokenMeter: makeTokenMeter() })` → `aiToday.budget === 1_500_000`; plain `createApp()` → `aiToday === undefined`.
  - `bad tzOffset → 200`: `tzOffset=abc` gives the same `daily` dates as `0`. Values are clamped to ±840.
- [ ] **Step 2:** Run `npm test`. Expected: fails (404).
- [ ] **Step 3: Implement.** `now = Date.now()`. Include `aiToday` only when `tokenMeter` is provided. Cache the computed `Stats` for 60 s per `tzOffset` in the router's closure (`createAdminRouter({ teacherAuth, tokenMeter, statsTtlMs = 60_000 })`) and add `generatedAt` to the response. This means refreshing the page doesn't re-scan the database; `aiToday` and `storage` stay live. Add a test: two calls in a row return the same `generatedAt`, and with `statsTtlMs: 0` they don't.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(api): admin stats endpoint`.

### Task 6: Admin runs UI and privacy copy

**Files:**
- Create: `src/components/AdminGate.jsx`, `src/pages/admin/AdminRuns.jsx`.
- Modify: `src/pages/teacher/RunDetail.jsx`, `src/App.jsx`, `src/components/Header.jsx`, `src/pages/SelectionScreen.jsx`, `src/pages/About.jsx`.

**Interfaces — Consumes:** the Task 3 JSON; `useTeacher()` → `teacher.isAdmin`; `apiFetch`, `fmtDate`, `fmtScore`.

- [ ] **Step 1: `RunDetail`.**
  - Add `RunDetail({ endpoint = '/api/teacher/runs' })`.
  - Heading: `student?.name ?? 'Free practice'`.
  - When `data.classRun` is present, show `Class: {className} · {teacherName}` under the heading.
  - Back fallback: `/admin/runs` when `endpoint` starts with `/api/admin`.
- [ ] **Step 2: `AdminGate` and routes.**
  - `AdminGate` wraps its children in `TeacherGate`. Signed in but not admin → `<p className="mt-6 text-sm text-muted-foreground">Page not found.</p>`.
  - Routes in `App.jsx`: `/admin` → `AdminStats` (a placeholder until Task 7); `/admin/runs` → `AdminRuns`; `/admin/runs/:sessionId` → `<RunDetail endpoint="/api/admin/runs" />`, all wrapped in `AdminGate`.
  - Header: `<NavItem to="/admin" end={false}>Admin</NavItem>` when `teacher?.isAdmin`.
  - Load `AdminStats` and `AdminRuns` with `React.lazy` + `<Suspense fallback={<Skeleton className="h-24 mt-6" />}>`, so students and teachers never download admin code. After `npm run build`, confirm the main bundle's gzip size is within 1 KB of the current 107 KB, with the admin pages in separate chunks.
- [ ] **Step 3: `AdminRuns`.**
  - Filter tabs All · Class · Free practice, synced to the `?kind=` query param; also respects `?classId=` and shows the class name with a clear link.
  - Rows link to `/admin/runs/:id` and show: date, `type · subtype`, class + teacher or a "Free practice" badge, student name, score or "In progress", message count.
  - "Load more" uses `nextBefore`; a 401 calls `setTeacher(null)`.
  - Follow the `ClassOverview.jsx` table and card styles, with cards on narrow screens and a table from `sm:` up.
- [ ] **Step 4: Privacy copy.**
  - `SelectionScreen.jsx:58`: `Free practice — not shared with any teacher. The site admin may review transcripts (no name or email) to improve the trainer.`
  - `About.jsx:20`: after "Free practice is not shared with any teacher.", add the same admin sentence.
- [ ] **Step 5:** Run `npm run lint && npm run build`. Expected: no errors.
- [ ] **Step 6: Browser check.** Set up the local admin first, as described in Task 8 Step 1; Task 7 reuses it. `/admin/runs` lists local runs, the filters and Load more work, and a run opens with its transcript.
- [ ] **Step 7:** Commit: `feat(ui): admin runs list and detail`.

### Task 7: Admin stats UI

**Files:** Create `src/pages/admin/AdminStats.jsx`.

**Interfaces — Consumes:** Task 5 JSON (`GET /api/admin/stats?tzOffset=${new Date().getTimezoneOffset()}`).

- [ ] **Step 1:** Load the `dataviz` skill before writing chart code.
- [ ] **Step 2: Implement the page.**
  - **Header** with tabs **Stats** (here) and **Runs** (link to `/admin/runs`).
  - **Stat tiles:** last 24 h, last 7 days, all runs, completion rate, average score (7 days / all), active students (7 days), AI tokens today (`tokens / budget` as %), and storage (`bytes / diskBytes`, shown in MB).
  - **30-day chart:** inline SVG bars, started vs graded, with a date label every 7 days, colors from CSS tokens so it works in both themes, and a `<title>` tooltip per bar.
  - **Per-class table:** rows link to `/admin/runs?classId=…` (the free-practice row links to `?kind=practice`).
  - **Per-scenario table**, sorted by runs. Flag average score < 70 with the `warn` color.
  - **Weakest skills:** trauma and medical lists showing average out of 3, with bars colored like `ClassOverview`'s `barColor`.
  - **Engagement line:** median messages and abandoned %.
  - **Empty state** when `totals.all === 0`.
- [ ] **Step 3:** Run `npm run lint && npm run build`. Expected: no errors.
- [ ] **Step 4:** Browser check: the numbers match a direct SQLite count of `database/emt.db`; check light, dark and the mobile preset.
- [ ] **Step 5:** Commit: `feat(ui): admin stats page`.

### Task 8: End-to-end verification and docs

- [ ] **Step 1: Local admin.**
  - Add `ADMIN_EMAILS=admin@local.test` to `.env` and restart the `app` preview.
  - Create the admin with a scratchpad script: `repo.createTeacher({ email: 'admin@local.test', name: 'Local admin', googleSub: 'local-admin' })` and `makeTeacherAuth().createSession(id)`.
  - In the browser pane, set the cookie with `document.cookie = 'emt_teacher=<token>; path=/'`.
  - Record the email in `.env` only; never paste the token in chat.
- [ ] **Step 2: Walk through.**
  - Signed in as admin, the header shows Admin, and `/admin` and `/admin/runs` work.
  - With a normal password teacher (sign up in a second tab after clearing the cookie), the Admin link is hidden and `/admin` shows "Page not found."
  - Take screenshots as proof.
- [ ] **Step 3: Update `CLAUDE.md`.**
  - Add an **Admin** section: who qualifies, the Google requirement, 404 for non-admins, the routes, what stats exist, the privacy wording, and the 60-second stats cache.
  - Add the new files to Architecture, add `ADMIN_EMAILS` to Operating, and update the test count.
- [ ] **Step 4:** Run `npm test`. Expected: all pass. Commit: `docs: admin view in CLAUDE.md`.
- [ ] **Step 5: Production steps (user):** configure Google sign-in on Render if it isn't already, set `ADMIN_EMAILS`, redeploy, then sign in with Google.
