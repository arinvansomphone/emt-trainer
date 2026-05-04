const assert = require('assert');
const { auditGrade, verifyQuote } = require('../services/gradingService');

function history() {
  return [
    { role: 'user', content: "I'll put on my gloves and check the scene for hazards." },
    { role: 'assistant', content: 'Patient says: my chest hurts.\n[Moderator] Lung sounds are clear bilaterally. Equal chest rise.' },
    { role: 'user', content: 'What is your blood pressure right now?' },
    { role: 'assistant', content: '[Moderator] BP is 120/80, HR 88.' },
  ];
}

exports.tests = [
  {
    name: 'verifyQuote matches a verbatim USER substring',
    fn: () => {
      const ok = verifyQuote(
        { speaker: 'USER', text: "put on my gloves and check the scene" },
        history()
      );
      assert.strictEqual(ok, true);
    },
  },
  {
    name: 'verifyQuote is case- and punctuation-insensitive',
    fn: () => {
      const ok = verifyQuote(
        { speaker: 'USER', text: 'PUT ON MY GLOVES, AND check THE scene!' },
        history()
      );
      assert.strictEqual(ok, true);
    },
  },
  {
    name: 'verifyQuote rejects fabricated text not in transcript',
    fn: () => {
      const ok = verifyQuote(
        { speaker: 'USER', text: 'I am administering 0.4 mg of nitroglycerin' },
        history()
      );
      assert.strictEqual(ok, false);
    },
  },
  {
    name: 'verifyQuote rejects USER quote that only appears in ASSISTANT message',
    fn: () => {
      const ok = verifyQuote(
        { speaker: 'USER', text: 'Lung sounds are clear bilaterally' },
        history()
      );
      assert.strictEqual(ok, false);
    },
  },
  {
    name: 'verifyQuote accepts ASSISTANT quote from moderator finding',
    fn: () => {
      const ok = verifyQuote(
        { speaker: 'ASSISTANT', text: 'Lung sounds are clear bilaterally. Equal chest rise.' },
        history()
      );
      assert.strictEqual(ok, true);
    },
  },
  {
    name: 'verifyQuote rejects too-short quotes',
    fn: () => {
      const ok = verifyQuote({ speaker: 'USER', text: 'gloves' }, history());
      assert.strictEqual(ok, false);
    },
  },
  {
    name: 'auditGrade downgrades score to 0 when no quote verifies',
    fn: () => {
      const parsed = {
        rubric: [
          {
            criterion: 'BSI / PPE',
            score: 3,
            quotes: [{ speaker: 'USER', text: 'I donned full body BSI before approaching' }],
            feedback: 'Gloves and BSI were mentioned, earning full credit.',
          },
        ],
      };
      auditGrade(parsed, history());
      assert.strictEqual(parsed.rubric[0].score, 0);
      assert.deepStrictEqual(parsed.rubric[0].quotes, []);
      assert.match(parsed.rubric[0].feedback, /No verifiable transcript evidence/i);
    },
  },
  {
    name: 'auditGrade preserves score when at least one quote verifies',
    fn: () => {
      const parsed = {
        rubric: [
          {
            criterion: 'BSI / PPE',
            score: 3,
            quotes: [
              { speaker: 'USER', text: "put on my gloves and check the scene" },
              { speaker: 'USER', text: 'donned a full hazmat suit' },
            ],
            feedback: 'EMT verbalized BSI.',
          },
        ],
      };
      auditGrade(parsed, history());
      assert.strictEqual(parsed.rubric[0].score, 3);
      assert.strictEqual(parsed.rubric[0].quotes.length, 1);
      assert.match(parsed.rubric[0].quotes[0].text, /gloves/);
    },
  },
  {
    name: 'auditGrade leaves score-0 rows alone but clears any spurious quotes',
    fn: () => {
      const parsed = {
        rubric: [
          { criterion: 'X', score: 0, quotes: [{ speaker: 'USER', text: 'whatever' }], feedback: 'nope' },
        ],
      };
      auditGrade(parsed, history());
      assert.strictEqual(parsed.rubric[0].score, 0);
      assert.deepStrictEqual(parsed.rubric[0].quotes, []);
    },
  },
  {
    name: 'auditGrade catches the BSI hallucination that motivated this fix',
    fn: () => {
      const parsed = {
        rubric: [
          {
            criterion: 'BSI / PPE',
            score: 3,
            quotes: [],
            feedback: 'The EMT verbalized the intention to help and interact with the patient.',
          },
        ],
      };
      auditGrade(parsed, history());
      assert.strictEqual(parsed.rubric[0].score, 0);
      assert.match(parsed.rubric[0].feedback, /No verifiable transcript evidence/i);
    },
  },
  {
    name: 'gradeSession records token usage to the meter when provided',
    fn: async () => {
      const { resetForTests, getDb } = require('../database/databaseManager');
      const sm = require('../services/sessionManager');
      const { makeGradingService } = require('../services/gradingService');
      resetForTests();
      getDb(':memory:');
      const sid = sm.createSession();
      sm.setScenario(sid, 'medical', JSON.stringify({
        type: 'medical', subtype: 'Cardiac', dispatch: 'd',
        patientProfile: { name: 'X', age: 60, sex: 'male', chiefComplaint: 'chest pain', vitals: { hr: 90, bp: '140/90', rr: 18, spo2: 96, gcs: 15 } },
        currentVitals: { hr: 90, bp: '140/90', rr: 18, spo2: 96, gcs: 15 },
        expectedAssessment: 'medical',
      }));
      sm.appendMessage(sid, 'user', 'check vitals');
      sm.appendMessage(sid, 'assistant', '[Moderator] HR 90');

      const recorded = [];
      const fakeMeter = { recordUsage: (p, c) => recorded.push([p, c]) };
      const fakeOpenAI = {
        chat: {
          completions: {
            create: async () => ({
              choices: [{ message: { content: JSON.stringify({
                overall: { score: 50, summary: 's' },
                rubric: [{ criterion: 'Vital signs obtained', score: 0, quotes: [], feedback: 'none' }],
                strengths: [], improvements: [],
              }) } }],
              usage: { prompt_tokens: 1500, completion_tokens: 400 },
            }),
          },
        },
      };
      const svc = makeGradingService({ openai: fakeOpenAI, tokenMeter: fakeMeter });
      await svc.gradeSession(sid);
      assert.deepStrictEqual(recorded, [[1500, 400]]);
    },
  },
];
