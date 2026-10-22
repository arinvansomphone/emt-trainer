const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');
const repo = require('../services/classRepo');

function setup() { resetForTests(); getDb(':memory:'); }

exports.tests = [
  {
    name: 'GET /api/sessions/:id is NOT gated by tokenGuard',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      sm.setScenario(sid, 'trauma', JSON.stringify({
        type: 'trauma', subtype: 'MVC', dispatch: 'd',
        patientProfile: { name: 'X', age: 30, sex: 'male', chiefComplaint: 'c', vitals: { hr: 80, bp: '120/80', rr: 16, spo2: 99, gcs: 15 } },
        environment: { location: 'l', weather: 'w', lighting: 'l', hazards: [] },
        bystanders: [],
        physicalFindings: { general: 'g', head: 'h', face: 'f', neck: 'n', chest: 'c', abdomen: 'a', pelvis: 'p', back: 'b', extremities: 'e', skin: 's', neuro: 'n' },
        expectedAssessment: 'trauma',
        currentVitals: { hr: 80 },
      }));
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({ tokenGuard });
      const res = await request(app).get(`/api/sessions/${sid}`);
      assert.strictEqual(res.status, 200);
    },
  },
  {
    name: 'POST /api/sessions/:id/grade returns 503 when tokenGuard rejects',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      sm.setScenario(sid, 'trauma', JSON.stringify({
        type: 'trauma', subtype: 'MVC', dispatch: 'd',
        patientProfile: { name: 'X', age: 30, sex: 'male', chiefComplaint: 'c', vitals: {} },
        currentVitals: {},
        expectedAssessment: 'trauma',
      }));
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({ gradingService: { gradeSession: async () => ({}) }, tokenGuard });
      const res = await request(app).post(`/api/sessions/${sid}/grade`);
      assert.strictEqual(res.status, 503);
    },
  },
];

exports.tests.push({
  name: 'GET /api/sessions/:id includes classRun without student identity',
  fn: async () => {
    setup();
    const t = repo.createTeacher({ email: 't@x.com', name: 'T', passwordHash: 'h' });
    const c = repo.createClass(t.id, 'Period 1');
    const st = repo.upsertStudent(c.id, 'Zelda Quux', 'zelda@quux.com');
    const sid = sm.createSession();
    sm.setScenario(sid, 'trauma', JSON.stringify({ type: 'trauma', subtype: 'MVC', patientProfile: { vitals: {} } }));
    repo.recordClassRun({ sessionId: sid, classId: c.id, studentId: st.id });
    const res = await request(createApp({})).get(`/api/sessions/${sid}`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.classRun, { className: 'Period 1', classCode: repo.formatCode(c.code), assignmentId: null });
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('Zelda') && !text.includes('quux.com') && !text.includes(st.id));
    const free = sm.createSession();
    sm.setScenario(free, 'trauma', JSON.stringify({ type: 'trauma', subtype: 'MVC' }));
    const r2 = await request(createApp({})).get(`/api/sessions/${free}`);
    assert.strictEqual(r2.body.classRun, null);
  },
});
