const assert = require('assert');
const { makeScenarioGenerator } = require('../services/scenarioGenerator');

function fakeOpenAI(jsonStr) {
  return {
    chat: { completions: {
      create: async () => ({ choices: [{ message: { content: jsonStr } }] }),
    }},
  };
}

const validJson = JSON.stringify({
  type: 'trauma',
  subtype: 'MVC',
  dispatch: '34yo M MVC on Hwy 101',
  patientProfile: { name: 'John', age: 34, sex: 'male', chiefComplaint: 'chest pain', vitals: { hr: 110, bp: '140/90', rr: 22, spo2: 95, gcs: 15 } },
  environment: { location: 'highway shoulder', weather: 'clear', lighting: 'daylight', hazards: ['traffic'] },
  bystanders: [],
  physicalFindings: {
    general: 'alert, in moderate distress',
    head: 'no DCAP-BTLS', face: 'no abrasions', neck: 'no JVD, trachea midline',
    chest: 'equal rise, clear breath sounds', abdomen: 'soft, non-tender',
    pelvis: 'stable', back: 'no tenderness',
    extremities: 'left wrist deformity with palpable distal pulse',
    skin: 'pink, warm, dry',
    neuro: 'PERRL, GCS 15',
  },
  expectedAssessment: 'trauma',
});

exports.tests = [
  {
    name: 'generate returns parsed scenario',
    fn: async () => {
      const gen = makeScenarioGenerator({ openai: fakeOpenAI(validJson) });
      const s = await gen.generate('trauma', 'MVC');
      assert.strictEqual(s.type, 'trauma');
      assert.strictEqual(s.subtype, 'MVC');
      assert.strictEqual(s.patientProfile.age, 34);
    },
  },
  {
    name: 'generate rejects unknown type',
    fn: async () => {
      const gen = makeScenarioGenerator({ openai: fakeOpenAI(validJson) });
      await assert.rejects(() => gen.generate('alien', 'MVC'), /invalid/i);
    },
  },
  {
    name: 'generate rejects malformed JSON from openai',
    fn: async () => {
      const gen = makeScenarioGenerator({ openai: fakeOpenAI('not json') });
      await assert.rejects(() => gen.generate('trauma', 'MVC'));
    },
  },
];
