# Admin View — Design

Implementation plan: `docs/superpowers/plans/2026-10-30-admin-view.md`

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

