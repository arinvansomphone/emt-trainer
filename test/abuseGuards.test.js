const assert = require('assert');
const { killSwitch } = require('../services/abuseGuards');

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
  return res;
}

exports.tests = [
  {
    name: 'killSwitch returns 503 when SERVICE_DISABLED=true',
    fn: () => {
      const prev = process.env.SERVICE_DISABLED;
      process.env.SERVICE_DISABLED = 'true';
      const res = makeRes();
      let nextCalled = false;
      killSwitch({}, res, () => { nextCalled = true; });
      if (prev === undefined) delete process.env.SERVICE_DISABLED; else process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(nextCalled, false);
      assert.match(res.body.error, /disabled/i);
    },
  },
  {
    name: 'killSwitch calls next when SERVICE_DISABLED is unset',
    fn: () => {
      const prev = process.env.SERVICE_DISABLED;
      delete process.env.SERVICE_DISABLED;
      const res = makeRes();
      let nextCalled = false;
      killSwitch({}, res, () => { nextCalled = true; });
      if (prev === undefined) delete process.env.SERVICE_DISABLED; else process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(nextCalled, true);
    },
  },
  {
    name: 'killSwitch calls next when SERVICE_DISABLED is "false"',
    fn: () => {
      const prev = process.env.SERVICE_DISABLED;
      process.env.SERVICE_DISABLED = 'false';
      const res = makeRes();
      let nextCalled = false;
      killSwitch({}, res, () => { nextCalled = true; });
      if (prev === undefined) delete process.env.SERVICE_DISABLED; else process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(nextCalled, true);
    },
  },
  {
    name: 'tokenMeter starts at zero and accepts recordUsage',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      assert.strictEqual(meter.snapshot().tokens, 0);
      meter.recordUsage(100, 50);
      assert.strictEqual(meter.snapshot().tokens, 150);
      meter.recordUsage(0, 25);
      assert.strictEqual(meter.snapshot().tokens, 175);
    },
  },
  {
    name: 'tokenMeter guard passes when under budget',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      meter.recordUsage(500, 0);
      const res = makeRes();
      let nextCalled = false;
      meter.guardMiddleware({}, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(res.statusCode, 200);
    },
  },
  {
    name: 'tokenMeter guard returns 503 when at or over budget',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      meter.recordUsage(1000, 0);
      const res = makeRes();
      let nextCalled = false;
      meter.guardMiddleware({}, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(nextCalled, false);
      assert.match(res.body.error, /quota/i);
    },
  },
  {
    name: 'tokenMeter rolls over when UTC date changes',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      let clock = new Date('2026-05-04T23:30:00Z');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => clock });
      meter.recordUsage(900, 0);
      assert.strictEqual(meter.snapshot().tokens, 900);
      clock = new Date('2026-05-05T00:30:00Z');
      meter.recordUsage(10, 0);
      assert.strictEqual(meter.snapshot().tokens, 10);
      assert.strictEqual(meter.snapshot().date, '2026-05-05');
    },
  },
  {
    name: 'tokenMeter reads DAILY_TOKEN_BUDGET env var when present',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const prev = process.env.DAILY_TOKEN_BUDGET;
      process.env.DAILY_TOKEN_BUDGET = '500';
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      assert.strictEqual(meter.snapshot().budget, 500);
      if (prev === undefined) delete process.env.DAILY_TOKEN_BUDGET; else process.env.DAILY_TOKEN_BUDGET = prev;
    },
  },
  {
    name: 'killSwitch is mounted on /api/ via createApp end-to-end',
    fn: async () => {
      const request = require('supertest');
      const { createApp } = require('../server');
      const { resetForTests, getDb } = require('../database/databaseManager');
      resetForTests(); getDb(':memory:');
      const prev = process.env.SERVICE_DISABLED;
      process.env.SERVICE_DISABLED = 'true';
      const app = createApp({});
      const res = await request(app).get('/api/scenario-types');
      if (prev === undefined) delete process.env.SERVICE_DISABLED; else process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(res.status, 503);
      assert.match(res.body.error, /disabled/i);
    },
  },
];
