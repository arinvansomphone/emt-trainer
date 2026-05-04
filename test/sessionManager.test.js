const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');

function setup() {
  resetForTests();
  getDb(':memory:');
}

exports.tests = [
  {
    name: 'createSession returns a non-empty id',
    fn: () => {
      setup();
      const id = sm.createSession();
      assert.ok(typeof id === 'string' && id.length > 0);
    },
  },
  {
    name: 'append + getHistory round-trip preserves order',
    fn: () => {
      setup();
      const id = sm.createSession();
      sm.appendMessage(id, 'user', 'hello');
      sm.appendMessage(id, 'assistant', 'hi there');
      sm.appendMessage(id, 'user', 'how are you');
      const history = sm.getHistory(id);
      assert.deepStrictEqual(history, [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
        { role: 'user', content: 'how are you' },
      ]);
    },
  },
  {
    name: 'getSession returns row for known id, null for unknown',
    fn: () => {
      setup();
      const id = sm.createSession();
      const row = sm.getSession(id);
      assert.strictEqual(row.id, id);
      assert.strictEqual(sm.getSession('nope'), null);
    },
  },
];
