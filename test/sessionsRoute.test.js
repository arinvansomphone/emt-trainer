const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');

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
