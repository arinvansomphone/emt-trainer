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
    name: 'scenario system prompt allows fingerstick blood glucose (BGL)',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(prompt.includes('BLOOD GLUCOSE IS IN SCOPE'));
      for (const alias of ['BGL', 'blood sugar', 'glucometer']) {
        assert.ok(prompt.includes(alias), `prompt should recognize "${alias}"`);
      }
      assert.ok(prompt.includes('not vascular access'));
      assert.ok(prompt.includes('Glucometer / fingerstick'), 'prompt should say what a glucometer reports');
      assert.ok(prompt.includes('bgl=NN'), 'vitals marker should allow bgl');
    },
  },
  {
    name: 'scenario system prompt allows stroke scales and other assessment tools (G-FAST)',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(prompt.includes('ASSESSMENT TOOLS ARE IN SCOPE'));
      for (const tool of ['G-FAST', 'BE-FAST', 'Cincinnati', 'LAMS']) {
        assert.ok(prompt.includes(tool), `prompt should name ${tool} as in scope`);
      }
    },
  },
  {
    name: 'scenario system prompt makes the EMT give the handover report, never the moderator',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(prompt.includes('HANDOVER REPORT'));
      assert.ok(prompt.includes('ready for your report'));
      assert.ok(prompt.includes('receiving paramedic'));
      assert.ok(!prompt.includes('receiving nurse'));
      assert.ok(prompt.includes('NEVER give, draft, summarize, or prompt the contents of the report'));
    },
  },
  {
    name: 'scenario system prompt sends scene safety and environment questions to the moderator',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(prompt.includes('SCENE AND ENVIRONMENT'));
      for (const q of ['scene safe', 'how many patients', 'hazards']) {
        assert.ok(prompt.includes(q), `prompt should route "${q}" to the moderator`);
      }
    },
  },
  {
    name: 'scenario system prompt allows aspirin and other EMT medications, but only with a stated dose',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(prompt.includes('EMT MEDICATIONS ARE IN SCOPE'));
      assert.ok(prompt.includes('aspirin'));
      assert.ok(prompt.includes('What dose'));
      assert.ok(prompt.includes('do NOT give the medication until the EMT states a dose'));
    },
  },
  {
    name: 'scenario system prompt acknowledges transport decisions without starting a handover',
    fn: async () => {
      const prompt = await seededSystemPrompt();
      assert.ok(prompt.includes('TRANSPORT DECISIONS'));
      assert.ok(prompt.includes('is NOT a handover'));
    },
  },
  {
    name: 'scenario generator schema includes a blood glucose value',
    fn: async () => {
      const src = require('fs').readFileSync(require.resolve('../services/scenarioGenerator'), 'utf8');
      assert.ok(src.includes('"bgl": number'));
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
      assert.ok(system.includes('Fingerstick blood glucose'), 'grader should know BGL is in scope');
      assert.ok(system.includes('stroke scales'), 'grader should know stroke scales are in scope');
      assert.ok(system.includes('without a dose'), 'grader should expect a stated dose');
    },
  },
];
