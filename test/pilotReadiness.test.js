const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');
const { makeTokenMeter } = require('../services/abuseGuards');

function setup() { resetForTests(); getDb(':memory:'); }

function openAIError(status, code) {
  const err = new Error(`${status} ${code}`);
  err.status = status;
  err.code = code;
  return err;
}

const failingGen = (err) => ({ generate: async () => { throw err; } });

exports.tests = [
  {
    name: 'OpenAI quota exhaustion on scenario creation returns 503 with a readable message',
    fn: async () => {
      setup();
      const app = createApp({ scenarioGenerator: failingGen(openAIError(429, 'credit_balance_exhausted')) });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'MVC' });
      assert.strictEqual(res.status, 503);
      assert.match(res.body.error, /AI service/i);
    },
  },
  {
    name: 'OpenAI rate limiting on chat returns 503 asking the user to retry',
    fn: async () => {
      setup();
      const chatService = { handleMessage: async () => { throw openAIError(429, 'rate_limit_exceeded'); } };
      const app = createApp({ chatService });
      const res = await request(app).post('/api/chat').send({ sessionId: 'x', message: 'hi' });
      assert.strictEqual(res.status, 503);
      assert.match(res.body.error, /try again/i);
    },
  },
  {
    name: 'OpenAI outage during grading returns 503, not 500',
    fn: async () => {
      setup();
      const gradingService = { gradeSession: async () => { throw openAIError(500, 'server_error'); } };
      const app = createApp({ gradingService });
      const res = await request(app).post('/api/sessions/x/grade');
      assert.strictEqual(res.status, 503);
    },
  },
  {
    name: 'non-OpenAI errors still return 500',
    fn: async () => {
      setup();
      const app = createApp({ scenarioGenerator: failingGen(new Error('bad json')) });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'MVC' });
      assert.strictEqual(res.status, 500);
    },
  },
  {
    name: 'rate limit is configurable, applies to POSTs, returns a JSON message, and skips GETs',
    fn: async () => {
      setup();
      const prev = process.env.RATE_LIMIT_PER_MIN;
      process.env.RATE_LIMIT_PER_MIN = '2';
      try {
        const app = createApp({ chatService: { handleMessage: async () => ({ sessionId: 'x', reply: 'r' }) } });
        for (let i = 0; i < 5; i++) {
          assert.strictEqual((await request(app).get('/api/scenario-types')).status, 200);
        }
        assert.strictEqual((await request(app).post('/api/chat').send({ message: 'a' })).status, 200);
        assert.strictEqual((await request(app).post('/api/chat').send({ message: 'b' })).status, 200);
        const limited = await request(app).post('/api/chat').send({ message: 'c' });
        assert.strictEqual(limited.status, 429);
        assert.match(limited.body.error, /wait/i);
      } finally {
        if (prev === undefined) delete process.env.RATE_LIMIT_PER_MIN; else process.env.RATE_LIMIT_PER_MIN = prev;
      }
    },
  },
  {
    name: 'default daily token budget fits a classroom pilot (>= 1.5M tokens)',
    fn: () => {
      const prev = process.env.DAILY_TOKEN_BUDGET;
      delete process.env.DAILY_TOKEN_BUDGET;
      try {
        assert.ok(makeTokenMeter().snapshot().budget >= 1_500_000);
      } finally {
        if (prev !== undefined) process.env.DAILY_TOKEN_BUDGET = prev;
      }
    },
  },
  {
    name: 'GET /api/sessions/:id includes the stored grade so feedback survives a reload',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      const grade = { overall: { score: 80, summary: 's' }, rubric: [], strengths: [], improvements: [] };
      sm.setScenario(sid, 'trauma', JSON.stringify({ type: 'trauma', subtype: 'MVC', grade }));
      const res = await request(createApp({})).get(`/api/sessions/${sid}`);
      assert.deepStrictEqual(res.body.grade, grade);
      const fresh = sm.createSession();
      sm.setScenario(fresh, 'trauma', JSON.stringify({ type: 'trauma', subtype: 'MVC' }));
      assert.strictEqual((await request(createApp({})).get(`/api/sessions/${fresh}`)).body.grade, null);
    },
  },
];
