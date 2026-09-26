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
  {
    name: 'getContext returns the full history when no summary exists',
    fn: () => {
      setup();
      const id = sm.createSession();
      sm.appendMessage(id, 'system', 'sys');
      sm.appendMessage(id, 'user', 'hello');
      assert.deepStrictEqual(sm.getContext(id), sm.getHistory(id));
    },
  },
  {
    name: 'getContext replaces summarized messages with the summary; getHistory stays full',
    fn: () => {
      setup();
      const id = sm.createSession();
      sm.appendMessage(id, 'system', 'sys');
      sm.appendMessage(id, 'user', 'early 1');
      sm.appendMessage(id, 'assistant', 'early 2');
      sm.appendMessage(id, 'user', 'late');
      const unsummarized = sm.getUnsummarized(id);
      sm.setSummary(id, 'S', unsummarized[1].id);
      assert.deepStrictEqual(sm.getContext(id), [
        { role: 'system', content: 'sys' },
        { role: 'system', content: 'Earlier in this scenario:\nS' },
        { role: 'user', content: 'late' },
      ]);
      assert.strictEqual(sm.getHistory(id).length, 4);
      assert.deepStrictEqual(sm.getUnsummarized(id).map((m) => m.content), ['late']);
    },
  },
];
