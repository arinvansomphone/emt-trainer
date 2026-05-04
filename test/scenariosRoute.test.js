const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');

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
];
