const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const { makeTeacherAuth } = require('../services/teacherAuth');

function setup() { resetForTests(); getDb(':memory:'); }
const creds = { email: 'a@x.edu', name: 'A', password: 'password123' };

exports.tests = [
  {
    name: 'signup sets an httpOnly emt_teacher cookie and /me returns the teacher',
    fn: async () => {
      setup();
      const agent = request.agent(createApp());
      const res = await agent.post('/api/teacher/signup').send(creds);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(Object.keys(res.body.teacher).sort(), ['email', 'id', 'name']);
      const cookie = [].concat(res.headers['set-cookie']).find((c) => c.startsWith('emt_teacher='));
      assert.ok(cookie, 'cookie set');
      assert.ok(/HttpOnly/i.test(cookie));
      assert.ok(/SameSite=Lax/i.test(cookie));
      const me = await agent.get('/api/teacher/me');
      assert.strictEqual(me.status, 200);
      assert.strictEqual(me.body.teacher.email, 'a@x.edu');
      assert.strictEqual(me.body.teacher.password_hash, undefined);
    },
  },
  {
    name: 'logout makes /me return 401',
    fn: async () => {
      setup();
      const agent = request.agent(createApp());
      await agent.post('/api/teacher/signup').send(creds);
      const out = await agent.post('/api/teacher/logout');
      assert.strictEqual(out.status, 200);
      assert.deepStrictEqual(out.body, { ok: true });
      assert.strictEqual((await agent.get('/api/teacher/me')).status, 401);
    },
  },
  {
    name: 'login works and bad password gives 401',
    fn: async () => {
      setup();
      const app = createApp();
      await request(app).post('/api/teacher/signup').send(creds);
      const ok = await request(app).post('/api/teacher/login').send({ email: creds.email, password: creds.password });
      assert.strictEqual(ok.status, 200);
      const bad = await request(app).post('/api/teacher/login').send({ email: creds.email, password: 'nope' });
      assert.strictEqual(bad.status, 401);
      assert.strictEqual(bad.body.error, 'Email or password is incorrect.');
    },
  },
  {
    name: 'POST /google returns 501 when GOOGLE_CLIENT_ID is unset',
    fn: async () => {
      setup();
      const prev = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;
      try {
        const res = await request(createApp()).post('/api/teacher/google').send({ credential: 'x' });
        assert.strictEqual(res.status, 501);
        assert.deepStrictEqual(res.body, { error: 'Google sign-in is not configured.' });
      } finally {
        if (prev === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = prev;
      }
    },
  },
  {
    name: 'POST /google with a fake verifier signs in',
    fn: async () => {
      setup();
      const prev = process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_ID = 'test';
      try {
        const teacherAuth = makeTeacherAuth({
          googleVerifier: async () => ({ sub: 'g1', email: 't@x.edu', name: 'T', email_verified: true }),
        });
        const agent = request.agent(createApp({ teacherAuth }));
        const res = await agent.post('/api/teacher/google').send({ credential: 'tok' });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(Object.keys(res.body.teacher).sort(), ['email', 'id', 'name']);
        assert.strictEqual(res.body.teacher.email, 't@x.edu');
        assert.strictEqual((await agent.get('/api/teacher/me')).status, 200);
      } finally {
        if (prev === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = prev;
      }
    },
  },
  {
    name: 'eleventh login attempt in a minute gets 429',
    fn: async () => {
      setup();
      const app = createApp();
      for (let i = 0; i < 10; i++) {
        const r = await request(app).post('/api/teacher/login').send({ email: 'n@x.edu', password: 'x' });
        assert.strictEqual(r.status, 401);
      }
      const res = await request(app).post('/api/teacher/login').send({ email: 'n@x.edu', password: 'x' });
      assert.strictEqual(res.status, 429);
    },
  },
  {
    name: 'responses allow Google popups',
    fn: async () => {
      setup();
      const res = await request(createApp()).get('/api/teacher/me');
      assert.strictEqual(res.headers['cross-origin-opener-policy'], 'same-origin-allow-popups');
      assert.ok(res.headers['content-security-policy'].includes('accounts.google.com'));
    },
  },
];

// --- Task 6: classes, assignments, students, runs ---
const repo = require('../services/classRepo');
const sm = require('../services/sessionManager');

async function signedIn(app, email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/teacher/signup').send({ email, name: 'T', password: 'password123' });
  assert.strictEqual(res.status, 200);
  return { agent, teacher: res.body.teacher };
}

function seedRun(classId, studentId, { assignmentId = null, grade = null } = {}) {
  const sid = sm.createSession();
  const state = { type: 'medical', subtype: 'Cardiac', patientProfile: { vitals: {} } };
  if (grade) state.grade = grade;
  sm.setScenario(sid, 'medical', JSON.stringify(state));
  sm.appendMessage(sid, 'system', 'SECRET SYSTEM PROMPT');
  sm.appendMessage(sid, 'user', 'I check scene safety');
  sm.appendMessage(sid, 'assistant', 'Scene is safe.');
  repo.recordClassRun({ sessionId: sid, classId, studentId, assignmentId });
  return sid;
}

const sampleGrade = {
  overall: { score: 80, summary: 'ok' },
  rubric: [{ criterion: 'Scene size-up', score: 80, maxScore: 100 }],
  strengths: [], improvements: [],
};

exports.tests.push(
  {
    name: 'routes require sign-in',
    fn: async () => {
      setup();
      const res = await request(createApp()).get('/api/teacher/classes');
      assert.strictEqual(res.status, 401);
    },
  },
  {
    name: 'teacher B gets 404 on teacher A\'s class, student, run, and assignment delete',
    fn: async () => {
      setup();
      const app = createApp();
      const a = await signedIn(app, 'a@x.edu');
      const b = await signedIn(app, 'b@x.edu');
      const cls = (await a.agent.post('/api/teacher/classes').send({ name: 'P1' })).body;
      const st = repo.upsertStudent(cls.id, 'Stu', 's@x.edu');
      const asg = repo.createAssignment(cls.id, { type: 'medical', subtype: 'Cardiac', title: 'T' });
      const sid = seedRun(cls.id, st.id, { assignmentId: asg.id });
      assert.strictEqual((await b.agent.get(`/api/teacher/classes/${cls.id}`)).status, 404);
      assert.strictEqual((await b.agent.get(`/api/teacher/classes/${cls.id}/students/${st.id}`)).status, 404);
      const run = await b.agent.get(`/api/teacher/runs/${sid}`);
      assert.strictEqual(run.status, 404);
      assert.deepStrictEqual(run.body, { error: 'not found' });
      assert.strictEqual((await b.agent.delete(`/api/teacher/assignments/${asg.id}`)).status, 404);
      assert.ok(repo.getAssignment(asg.id), 'assignment survives');
      assert.strictEqual((await b.agent.post(`/api/teacher/classes/${cls.id}/assignments`).send({ type: 'medical', subtype: 'Cardiac' })).status, 404);
    },
  },
  {
    name: 'free-practice runs never appear',
    fn: async () => {
      setup();
      const app = createApp();
      const a = await signedIn(app, 'a@x.edu');
      const cls = (await a.agent.post('/api/teacher/classes').send({ name: 'P1' })).body;
      const st = repo.upsertStudent(cls.id, 'Stu', 's@x.edu');
      seedRun(cls.id, st.id, { grade: sampleGrade });
      const free = sm.createSession();
      sm.setScenario(free, 'medical', JSON.stringify({ type: 'medical', subtype: 'Cardiac', grade: sampleGrade }));
      const res = await a.agent.get(`/api/teacher/classes/${cls.id}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.metrics.gradedRuns, 1);
      assert.deepStrictEqual(res.body.class, { id: cls.id, name: 'P1', code: cls.code });
      assert.strictEqual((await a.agent.get(`/api/teacher/runs/${free}`)).status, 404);
      const list = await a.agent.get('/api/teacher/classes');
      assert.strictEqual(list.body[0].gradedRuns, 1);
      assert.strictEqual(list.body[0].studentsJoined, 1);
      assert.ok(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(list.body[0].code));
    },
  },
  {
    name: 'run detail omits system messages and includes grade',
    fn: async () => {
      setup();
      const app = createApp();
      const a = await signedIn(app, 'a@x.edu');
      const cls = (await a.agent.post('/api/teacher/classes').send({ name: 'P1' })).body;
      const st = repo.upsertStudent(cls.id, 'Stu', 's@x.edu');
      const sid = seedRun(cls.id, st.id, { grade: sampleGrade });
      const res = await a.agent.get(`/api/teacher/runs/${sid}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.student, { id: st.id, name: 'Stu' });
      assert.deepStrictEqual(res.body.messages.map((m) => m.role), ['user', 'assistant']);
      assert.ok(!JSON.stringify(res.body).includes('SECRET SYSTEM PROMPT'));
      assert.ok(!JSON.stringify(res.body).includes('s@x.edu'));
      assert.strictEqual(res.body.grade.overall.score, 80);
      assert.strictEqual(res.body.scenario.grade, undefined);
      assert.strictEqual(res.body.scenario.subtype, 'Cardiac');
      assert.strictEqual(res.body.run.score, 80);
    },
  },
  {
    name: 'student detail lists runs newest first with email',
    fn: async () => {
      setup();
      const app = createApp();
      const a = await signedIn(app, 'a@x.edu');
      const cls = (await a.agent.post('/api/teacher/classes').send({ name: 'P1' })).body;
      const st = repo.upsertStudent(cls.id, 'Stu', 'S@x.edu');
      const s1 = seedRun(cls.id, st.id);
      const s2 = seedRun(cls.id, st.id);
      require('../database/databaseManager').getDb().prepare('UPDATE class_runs SET created_at = ? WHERE session_id = ?').run(1000, s1);
      require('../database/databaseManager').getDb().prepare('UPDATE class_runs SET created_at = ? WHERE session_id = ?').run(2000, s2);
      const res = await a.agent.get(`/api/teacher/classes/${cls.id}/students/${st.id}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.student, { id: st.id, name: 'Stu', email: 's@x.edu' });
      assert.deepStrictEqual(res.body.runs.map((r) => r.sessionId), [s2, s1]);
    },
  },
  {
    name: 'assignments: default title, dueAt parsing, delete, and validation',
    fn: async () => {
      setup();
      const app = createApp();
      const a = await signedIn(app, 'a@x.edu');
      const cls = (await a.agent.post('/api/teacher/classes').send({ name: 'P1' })).body;
      const url = `/api/teacher/classes/${cls.id}/assignments`;
      const ok = await a.agent.post(url).send({ type: 'medical', subtype: 'Cardiac', dueAt: '2026-11-01' });
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.body.title, 'Medical · Cardiac');
      assert.strictEqual(ok.body.dueAt, Date.parse('2026-11-01'));
      assert.deepStrictEqual(Object.keys(ok.body).sort(), ['dueAt', 'id', 'subtype', 'title', 'type']);
      const t = await a.agent.post(url).send({ type: 'trauma', subtype: 'MVC', title: '  Quiz  ', dueAt: '' });
      assert.strictEqual(t.body.title, 'Quiz');
      assert.strictEqual(t.body.dueAt, null);
      const bad = await a.agent.post(url).send({ type: 'medical', subtype: 'Nope' });
      assert.strictEqual(bad.status, 400);
      assert.strictEqual(bad.body.error, 'invalid type or subtype');
      const badDate = await a.agent.post(url).send({ type: 'medical', subtype: 'Cardiac', dueAt: 'garbage' });
      assert.strictEqual(badDate.status, 400);
      assert.strictEqual(badDate.body.error, 'Enter a valid due date.');
      const del = await a.agent.delete(`/api/teacher/assignments/${ok.body.id}`);
      assert.deepStrictEqual(del.body, { ok: true });
      assert.strictEqual(repo.getAssignment(ok.body.id), null);
    },
  },
  {
    name: 'POST /classes rejects a blank name and returns a formatted code',
    fn: async () => {
      setup();
      const a = await signedIn(createApp(), 'a@x.edu');
      const blank = await a.agent.post('/api/teacher/classes').send({ name: '   ' });
      assert.strictEqual(blank.status, 400);
      assert.strictEqual(blank.body.error, 'Enter a class name.');
      const ok = await a.agent.post('/api/teacher/classes').send({ name: ' Period 2 ' });
      assert.strictEqual(ok.body.name, 'Period 2');
      assert.ok(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(ok.body.code));
    },
  },
);

exports.tests.push({
  name: 'non-string assignment type or subtype returns 400, not 500',
  fn: async () => {
    setup();
    const a = await signedIn(createApp(), 'a@x.edu');
    const cls = (await a.agent.post('/api/teacher/classes').send({ name: 'P1' })).body;
    const url = `/api/teacher/classes/${cls.id}/assignments`;
    for (const body of [{ type: ['medical'], subtype: 'Cardiac' }, { type: 'medical', subtype: ['Cardiac'] }]) {
      const res = await a.agent.post(url).send(body);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'invalid type or subtype');
    }
  },
});
