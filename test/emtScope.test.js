const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');

function setup() { resetForTests(); getDb(':memory:'); }

const fakeScenario = {
  type: 'medical', subtype: 'Cardiac', dispatch: 'd',
  patientProfile: { name: 'X', age: 60, sex: 'male', chiefComplaint: 'chest pain', vitals: { hr: 90, bp: '140/90', rr: 18, spo2: 96, gcs: 15 } },
  environment: { location: 'l', weather: 'w', lighting: 'l', hazards: [] },
  bystanders: [],
  physicalFindings: { general: 'g', head: 'h', face: 'f', neck: 'n', chest: 'c', abdomen: 'a', pelvis: 'p', back: 'b', extremities: 'e', skin: 's', neuro: 'n' },
  expectedAssessment: 'medical',
};

async function seededSystemPrompt() {
  setup();
  const app = createApp({ scenarioGenerator: { generate: async () => fakeScenario } });
  const res = await request(app).post('/api/scenarios').send({ type: 'medical', subtype: 'Cardiac' });
  return sm.getHistory(res.body.sessionId)[0].content;
}

exports.tests = [
  {
    name: 'scenario system prompt enforces California EMT scope',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(prompt.includes('CALIFORNIA EMT SCOPE OF PRACTICE'));
      assert.ok(prompt.includes('outside the California EMT scope of practice'));
      for (const skill of ['IV', '12-lead', 'rhythm interpretation']) {
        assert.ok(prompt.includes(skill), `prompt should name ${skill} as out of scope`);
      }
    },
  },
  {
    name: 'scenario system prompt no longer offers ALS interventions as examples',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(!prompt.includes('"start IV"'));
      assert.ok(!prompt.includes('"give 0.4 mg nitro"'));
      assert.ok(!prompt.includes('"place on monitor"'));
    },
  },
  {
    name: 'grading prompt penalizes out-of-scope skills',
    fn: async () => {
      setup();
      const { makeGradingService } = require('../services/gradingService');
      const sid = sm.createSession();
      sm.setScenario(sid, 'medical', JSON.stringify({ ...fakeScenario, currentVitals: fakeScenario.patientProfile.vitals }));
      sm.appendMessage(sid, 'user', 'start an IV');
      let sent = null;
      const fakeOpenAI = { chat: { completions: { create: async (req) => {
        sent = req;
        return { choices: [{ message: { content: JSON.stringify({ overall: { score: 0, summary: 's' }, rubric: [], strengths: [], improvements: [] }) } }] };
      } } } };
      await makeGradingService({ openai: fakeOpenAI }).gradeSession(sid);
      const system = sent.messages.find((m) => m.role === 'system').content;
      assert.ok(system.includes('outside the California EMT scope of practice'));
      assert.ok(system.includes('caps "Appropriate interventions" at 1'));
    },
  },
];
