const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');
const repo = require('../services/classRepo');

function setup() { resetForTests(); getDb(':memory:'); }

const fakeScenario = {
  type: 'trauma', subtype: 'MVC', dispatch: 'd',
  patientProfile: { name: 'X', age: 30, sex: 'male', chiefComplaint: 'c', vitals: { hr: 80, bp: '120/80', rr: 16, spo2: 99, gcs: 15 } },
  environment: { location: 'l', weather: 'w', lighting: 'l', hazards: [] },
  bystanders: [],
  physicalFindings: { general: 'g', head: 'h', face: 'f', neck: 'n', chest: 'c', abdomen: 'a', pelvis: 'p', back: 'b', extremities: 'e', skin: 's', neuro: 'n' },
  expectedAssessment: 'trauma',
};

function fakeChatService() {
  return { handleMessage: async () => ({ sessionId: 'x', reply: 'x' }) };
}

function fakeScenarioGen() {
  return { generate: async () => fakeScenario };
}

exports.tests = [
  {
    name: 'GET /api/scenario-types returns the catalog',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService(), scenarioGenerator: fakeScenarioGen() });
      const res = await request(app).get('/api/scenario-types');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.trauma.includes('MVC'));
      assert.ok(res.body.medical.includes('Cardiac'));
    },
  },
  {
    name: 'POST /api/scenarios creates session, persists scenario, seeds system message',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService(), scenarioGenerator: fakeScenarioGen() });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'MVC' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.sessionId);
      assert.strictEqual(res.body.scenario.subtype, 'MVC');
      const row = sm.getSession(res.body.sessionId);
      assert.strictEqual(row.scenario_type, 'trauma');
      assert.ok(row.state && JSON.parse(row.state).subtype === 'MVC');
      const history = sm.getHistory(res.body.sessionId);
      assert.strictEqual(history[0].role, 'system');
    },
  },
  {
    name: 'POST /api/scenarios rejects invalid subtype',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService(), scenarioGenerator: fakeScenarioGen() });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'Nope' });
      assert.strictEqual(res.status, 400);
    },
  },
  {
    name: 'POST /api/scenarios returns 503 when tokenGuard rejects',
    fn: async () => {
      setup();
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({
        chatService: fakeChatService(),
        scenarioGenerator: fakeScenarioGen(),
        tokenGuard,
      });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'MVC' });
      assert.strictEqual(res.status, 503);
      assert.match(res.body.error, /quota/);
    },
  },
  {
    name: 'GET /api/scenario-types is NOT gated by tokenGuard',
    fn: async () => {
      setup();
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({
        chatService: fakeChatService(),
        scenarioGenerator: fakeScenarioGen(),
        tokenGuard,
      });
      const res = await request(app).get('/api/scenario-types');
      assert.strictEqual(res.status, 200);
    },
  },
];

function mkClass() {
  const t = repo.createTeacher({ email: 't@x.com', name: 'T', passwordHash: 'h' });
  return repo.createClass(t.id, 'Period 1');
}
function appWithGen(gen) {
  return createApp({ chatService: fakeChatService(), scenarioGenerator: gen });
}
const throwingGen = { generate: async () => { throw new Error('generator must not be called'); } };
const stu = { studentName: 'Ann Lee', studentEmail: 'Ann@X.com' };

const classTests = [
  {
    name: 'POST /api/scenarios without class fields creates no class_run',
    fn: async () => {
      setup();
      const res = await request(appWithGen(fakeScenarioGen())).post('/api/scenarios').send({ type: 'trauma', subtype: 'MVC' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(repo.getClassRun(res.body.sessionId), null);
      assert.strictEqual(res.body.classRun, null);
    },
  },
  {
    name: 'POST /api/scenarios with classCode links the run',
    fn: async () => {
      setup();
      const c = mkClass();
      const lower = repo.formatCode(c.code).toLowerCase();
      const res = await request(appWithGen(fakeScenarioGen())).post('/api/scenarios')
        .send({ type: 'trauma', subtype: 'MVC', classCode: lower, ...stu });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(repo.listClassRuns(c.id).length, 1);
      assert.deepStrictEqual(res.body.classRun, { className: 'Period 1', classCode: repo.formatCode(c.code), assignmentId: null });
      assert.ok(!JSON.stringify(res.body).includes('ann@x.com'));
    },
  },
  {
    name: "assignment run uses the assignment's subtype",
    fn: async () => {
      setup();
      const c = mkClass();
      const a = repo.createAssignment(c.id, { type: 'medical', subtype: 'Cardiac', title: 'HW' });
      const calls = [];
      const gen = { generate: async (t, s) => { calls.push([t, s]); return fakeScenario; } };
      const res = await request(appWithGen(gen)).post('/api/scenarios')
        .send({ type: 'trauma', subtype: 'MVC', assignmentId: a.id, ...stu });
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(calls, [['medical', 'Cardiac']]);
      assert.strictEqual(res.body.classRun.assignmentId, a.id);
      assert.strictEqual(repo.getClassRun(res.body.sessionId).assignment_id, a.id);
    },
  },
  {
    name: 'bad class code returns 400 and never calls the generator',
    fn: async () => {
      setup();
      const res = await request(appWithGen(throwingGen)).post('/api/scenarios')
        .send({ type: 'trauma', subtype: 'MVC', classCode: 'ZZZ-ZZZ', ...stu });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, "We couldn't find that class code. Check it with your teacher.");
    },
  },
  {
    name: 'missing email with classCode returns 400',
    fn: async () => {
      setup();
      const c = mkClass();
      for (const body of [
        { studentName: 'Ann' },
        { studentName: 'Ann', studentEmail: 'nope' },
        { studentName: '   ', studentEmail: 'a@b.com' },
      ]) {
        const res = await request(appWithGen(throwingGen)).post('/api/scenarios')
          .send({ type: 'trauma', subtype: 'MVC', classCode: c.code, ...body });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.error, 'Enter your name and email.');
      }
    },
  },
  {
    name: 'deleted assignment returns 404 with readable message',
    fn: async () => {
      setup();
      const c = mkClass();
      const a = repo.createAssignment(c.id, { type: 'medical', subtype: 'Cardiac', title: 'HW' });
      repo.deleteAssignment(a.id);
      const res = await request(appWithGen(throwingGen)).post('/api/scenarios')
        .send({ assignmentId: a.id, ...stu });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error, 'This assignment no longer exists. Ask your teacher for a new link.');
    },
  },
  {
    name: 'GET /api/assignments/:id and /api/classes/:code are public and minimal',
    fn: async () => {
      setup();
      const c = mkClass();
      const a = repo.createAssignment(c.id, { type: 'medical', subtype: 'Cardiac', title: 'HW', dueAt: 123 });
      const guard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({ chatService: fakeChatService(), scenarioGenerator: fakeScenarioGen(), tokenGuard: guard });
      const r1 = await request(app).get(`/api/assignments/${a.id}`);
      assert.strictEqual(r1.status, 200);
      assert.deepStrictEqual(r1.body, { id: a.id, title: 'HW', type: 'medical', subtype: 'Cardiac', dueAt: 123, className: 'Period 1' });
      const r2 = await request(app).get(`/api/classes/${c.code.toLowerCase()}`);
      assert.strictEqual(r2.status, 200);
      assert.deepStrictEqual(r2.body, { name: 'Period 1', code: repo.formatCode(c.code) });
      assert.strictEqual((await request(app).get('/api/classes/NOPE22')).status, 404);
      repo.deleteAssignment(a.id);
      assert.strictEqual((await request(app).get(`/api/assignments/${a.id}`)).status, 404);
    },
  },
];
exports.tests.push(...classTests);
