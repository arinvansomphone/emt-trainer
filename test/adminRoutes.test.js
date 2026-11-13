const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const { makeTeacherAuth } = require('../services/teacherAuth');
const repo = require('../services/classRepo');
const sm = require('../services/sessionManager');

function setup() { resetForTests(); getDb(':memory:'); }

// Google-verified teacher + session cookie, without going through Google.
function signIn(email, { google = true } = {}) {
  const t = repo.createTeacher({ email, name: email.split('@')[0], googleSub: google ? `g-${email}` : null, passwordHash: google ? null : 'h' });
  return { teacher: t, cookie: `emt_teacher=${makeTeacherAuth().createSession(t.id)}` };
}

const ADMIN = 'admin@x.edu';
async function asAdmin(fn) {
  const prev = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = ADMIN;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prev;
  }
}

const graded = {
  overall: { score: 99, summary: 's' },
  rubric: [{ criterion: 'BSI / PPE', score: 3, quotes: [], feedback: 'f' }, { criterion: 'SAMPLE history', score: 0, quotes: [], feedback: 'f' }],
  strengths: [], improvements: [],
};

function seedRun({ at, type = 'medical', subtype = 'Cardiac', grade = null }) {
  const sid = sm.createSession();
  sm.setScenario(sid, type, JSON.stringify({ type, subtype, expectedAssessment: type, patientProfile: { name: 'P' }, ...(grade ? { grade } : {}) }));
  sm.appendMessage(sid, 'system', 'secret prompt');
  sm.appendMessage(sid, 'user', 'scene safe, BSI on');
  sm.appendMessage(sid, 'assistant', 'Help me');
  getDb().prepare('UPDATE sessions SET created_at = ? WHERE id = ?').run(at, sid);
  return sid;
}

function linkToClass(sid, cls, email, assignmentId = null) {
  const st = repo.upsertStudent(cls.id, 'Student ' + email, email);
  repo.recordClassRun({ sessionId: sid, classId: cls.id, studentId: st.id, assignmentId });
}

// One free-practice run (newest), plus one class run each for two teachers.
function seedWorld() {
  const admin = signIn(ADMIN);
  const a = signIn('a@x.edu');
  const b = signIn('b@x.edu');
  const clsA = repo.createClass(a.teacher.id, 'Period A');
  const clsB = repo.createClass(b.teacher.id, 'Period B');
  const practice = seedRun({ at: 3000, grade: graded });
  const runA = seedRun({ at: 2000 });
  linkToClass(runA, clsA, 's1@x.edu');
  const runB = seedRun({ at: 1000, type: 'trauma', subtype: 'MVC' });
  linkToClass(runB, clsB, 's2@x.edu');
  return { admin, a, clsA, clsB, practice, runA, runB };
}

const get = (app, path, cookie) => request(app).get(path).set('Cookie', cookie || '');

exports.tests = [
  {
    name: 'stats 404 for non-admin',
    fn: () => asAdmin(async () => {
      setup();
      const { a } = seedWorld();
      assert.strictEqual((await get(createApp(), '/api/admin/stats', a.cookie)).status, 404);
    }),
  },
  {
    name: 'stats shape for admin',
    fn: () => asAdmin(async () => {
      setup();
      const { admin } = seedWorld();
      const res = await get(createApp(), '/api/admin/stats', admin.cookie);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.totals.all, 3);
      assert.strictEqual(res.body.totals.practice, 1);
      assert.strictEqual(res.body.daily.length, 30);
      const periodA = res.body.perClass.find((c) => c.name === 'Period A');
      assert.strictEqual(periodA.teacher, 'a');
      assert.strictEqual(periodA.students, 1);
      assert.match(periodA.code, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      assert.ok(res.body.storage.bytes > 0);
      assert.strictEqual(res.body.storage.diskBytes, 1_000_000_000);
      assert.strictEqual(typeof res.body.generatedAt, 'number');
    }),
  },
  {
    name: 'aiToday present only with tokenMeter',
    fn: () => asAdmin(async () => {
      setup();
      const { admin } = seedWorld();
      const { makeTokenMeter } = require('../services/abuseGuards');
      const withMeter = await get(createApp({ tokenMeter: makeTokenMeter() }), '/api/admin/stats', admin.cookie);
      assert.strictEqual(withMeter.body.aiToday.budget, 1_500_000);
      assert.strictEqual(withMeter.body.aiToday.tokens, 0);
      const without = await get(createApp(), '/api/admin/stats', admin.cookie);
      assert.strictEqual(without.body.aiToday, undefined);
    }),
  },
  {
    name: 'bad tzOffset → 200 with UTC days',
    fn: () => asAdmin(async () => {
      setup();
      const { admin } = seedWorld();
      const app = createApp();
      const dates = async (q) => (await get(app, `/api/admin/stats?${q}`, admin.cookie)).body.daily.map((d) => d.date);
      const utc = await dates('tzOffset=0');
      assert.deepStrictEqual(await dates('tzOffset=abc'), utc);
      const clamped = await get(app, '/api/admin/stats?tzOffset=99999', admin.cookie);
      assert.strictEqual(clamped.status, 200);
    }),
  },
  {
    name: 'stats are cached for 60 s; statsTtlMs 0 disables the cache',
    fn: () => asAdmin(async () => {
      setup();
      const { admin } = seedWorld();
      const cached = createApp();
      const first = await get(cached, '/api/admin/stats', admin.cookie);
      seedRun({ at: 9000 });
      const second = await get(cached, '/api/admin/stats', admin.cookie);
      assert.strictEqual(second.body.generatedAt, first.body.generatedAt);
      assert.strictEqual(second.body.totals.all, 3);
      const fresh = await get(createApp({ adminStatsTtlMs: 0 }), '/api/admin/stats', admin.cookie);
      assert.strictEqual(fresh.body.totals.all, 4);
    }),
  },
  {
    name: 'admin routes: 401 signed out, 404 ordinary teacher, 404 listed password-only account, 200 admin',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, a } = seedWorld();
      assert.strictEqual((await get(app, '/api/admin/runs')).status, 401);
      assert.strictEqual((await get(app, '/api/admin/runs', a.cookie)).status, 404);
      getDb().prepare('DELETE FROM teachers WHERE email = ?').run(ADMIN);
      const squatter = signIn(ADMIN, { google: false });
      assert.strictEqual((await get(app, '/api/admin/runs', squatter.cookie)).status, 404);
      getDb().prepare('DELETE FROM teachers WHERE email = ?').run(ADMIN);
      const real = signIn(ADMIN);
      assert.strictEqual((await get(app, '/api/admin/runs', real.cookie)).status, 200);
      assert.ok(admin);
    }),
  },
  {
    name: "lists free practice and both teachers' class runs, newest first",
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, practice, runA, runB } = seedWorld();
      const res = await get(app, '/api/admin/runs', admin.cookie);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.runs.map((r) => r.sessionId), [practice, runA, runB]);
      const [p, ra] = res.body.runs;
      assert.strictEqual(p.classRun, null);
      assert.strictEqual(p.student, null);
      assert.strictEqual(p.status, 'graded');
      assert.strictEqual(p.score, 50);
      assert.strictEqual(p.messageCount, 1);
      assert.strictEqual(ra.classRun.className, 'Period A');
      assert.strictEqual(ra.classRun.teacherName, 'a');
      assert.match(ra.classRun.code, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      assert.deepStrictEqual(ra.student, { name: 'Student s1@x.edu', email: 's1@x.edu' });
      assert.strictEqual(res.body.nextBefore, null);
    }),
  },
  {
    name: 'kind filter and classId filter',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, clsA, practice, runA } = seedWorld();
      const ids = async (q) => (await get(app, `/api/admin/runs?${q}`, admin.cookie)).body.runs.map((r) => r.sessionId);
      assert.deepStrictEqual(await ids('kind=practice'), [practice]);
      assert.strictEqual((await ids('kind=class')).length, 2);
      assert.deepStrictEqual(await ids(`classId=${clsA.id}`), [runA]);
    }),
  },
  {
    name: 'pagination',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, runB } = seedWorld();
      const first = await get(app, '/api/admin/runs?limit=2', admin.cookie);
      assert.strictEqual(first.body.runs.length, 2);
      assert.strictEqual(first.body.nextBefore, 2000);
      const second = await get(app, `/api/admin/runs?limit=2&before=${first.body.nextBefore}`, admin.cookie);
      assert.deepStrictEqual(second.body.runs.map((r) => r.sessionId), [runB]);
      assert.strictEqual(second.body.nextBefore, null);
    }),
  },
  {
    name: 'bad params fall back to defaults',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin } = seedWorld();
      for (const q of ['kind=foo&limit=abc&before=xyz', 'limit=-5', 'limit=1000', 'limit=2.5', 'classId=']) {
        const res = await get(app, `/api/admin/runs?${q}`, admin.cookie);
        assert.strictEqual(res.status, 200, q);
        assert.strictEqual(res.body.runs.length, 3, q);
      }
    }),
  },
  {
    name: 'sessions without a scenario are excluded',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin } = seedWorld();
      sm.createSession();
      assert.strictEqual((await get(app, '/api/admin/runs', admin.cookie)).body.runs.length, 3);
    }),
  },
  {
    name: 'corrupt state is listed as in_progress',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, practice } = seedWorld();
      getDb().prepare("UPDATE sessions SET state = '{bad' WHERE id = ?").run(practice);
      const item = (await get(app, '/api/admin/runs', admin.cookie)).body.runs.find((r) => r.sessionId === practice);
      assert.strictEqual(item.status, 'in_progress');
      assert.strictEqual(item.score, null);
      const detail = await get(app, `/api/admin/runs/${practice}`, admin.cookie);
      assert.strictEqual(detail.status, 200);
      assert.strictEqual(detail.body.grade, null);
    }),
  },
  {
    name: 'deleted assignment keeps class, late false',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, clsA } = seedWorld();
      const asg = repo.createAssignment(clsA.id, { type: 'medical', subtype: 'Cardiac', title: 'T', dueAt: 1 });
      const sid = seedRun({ at: 5000, grade: graded });
      linkToClass(sid, clsA, 's3@x.edu', asg.id);
      const before = (await get(app, '/api/admin/runs', admin.cookie)).body.runs.find((r) => r.sessionId === sid);
      assert.strictEqual(before.late, true);
      repo.deleteAssignment(asg.id);
      const after = (await get(app, '/api/admin/runs', admin.cookie)).body.runs.find((r) => r.sessionId === sid);
      assert.strictEqual(after.classRun.className, 'Period A');
      assert.strictEqual(after.late, false);
    }),
  },
  {
    name: 'detail: practice run',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, practice } = seedWorld();
      const res = await get(app, `/api/admin/runs/${practice}`, admin.cookie);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.student, null);
      assert.strictEqual(res.body.classRun, null);
      assert.ok(res.body.messages.length > 0);
      assert.ok(res.body.messages.every((m) => m.role !== 'system'));
      assert.strictEqual(res.body.grade.overall.score, 99);
      assert.strictEqual(res.body.scenario.subtype, 'Cardiac');
      assert.strictEqual(res.body.scenario.grade, undefined);
      assert.strictEqual(res.body.run.score, 50);
    }),
  },
  {
    name: 'detail: class run includes class and teacher; unknown id → 404',
    fn: () => asAdmin(async () => {
      setup();
      const app = createApp();
      const { admin, a, runA } = seedWorld();
      const res = await get(app, `/api/admin/runs/${runA}`, admin.cookie);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.classRun.className, 'Period A');
      assert.strictEqual(res.body.classRun.teacherName, 'a');
      assert.strictEqual(res.body.student.email, 's1@x.edu');
      assert.strictEqual((await get(app, '/api/admin/runs/nope', admin.cookie)).status, 404);
      assert.strictEqual((await get(app, `/api/admin/runs/${runA}`, a.cookie)).status, 404);
    }),
  },
];
