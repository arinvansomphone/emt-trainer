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
      process.env.SERVICE_DISABLED = prev;
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
      process.env.SERVICE_DISABLED = prev;
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
      process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(nextCalled, true);
    },
  },
];
