const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');
const { makeChatService } = require('../services/chatService');

function setup() {
  resetForTests();
  getDb(':memory:');
}

function scenarioSession(state = { type: 'trauma', subtype: 'MVC' }) {
  const id = sm.createSession();
  sm.setScenario(id, state.type, JSON.stringify(state));
  return id;
}

function fakeOpenAI(reply, usage = { prompt_tokens: 100, completion_tokens: 50 }) {
  const fake = {
    lastMessages: null,
    chat: {
      completions: {
        create: async ({ messages }) => {
          fake.lastMessages = messages;
          return { choices: [{ message: { role: 'assistant', content: reply } }], usage };
        },
      },
    },
  };
  return fake;
}

exports.tests = [
  {
    name: 'rejects a missing or unknown sessionId with 404 instead of creating a session',
    fn: async () => {
      setup();
      const fake = fakeOpenAI('x');
      let called = false;
      fake.chat.completions.create = async () => { called = true; };
      const svc = makeChatService({ openai: fake });
      await assert.rejects(() => svc.handleMessage({ sessionId: null, message: 'hi' }), (e) => e.status === 404);
      await assert.rejects(() => svc.handleMessage({ sessionId: 'nope', message: 'hi' }), (e) => e.status === 404);
      assert.strictEqual(called, false);
      assert.strictEqual(getDb().prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    },
  },
  {
    name: 'rejects a session with no scenario with 400',
    fn: async () => {
      setup();
      const id = sm.createSession();
      const svc = makeChatService({ openai: fakeOpenAI('x') });
      await assert.rejects(() => svc.handleMessage({ sessionId: id, message: 'hi' }), (e) => e.status === 400);
    },
  },
  {
    name: 'rejects chat on an already-graded session with 409',
    fn: async () => {
      setup();
      const id = scenarioSession({ type: 'trauma', subtype: 'MVC', grade: { overall: {} } });
      const svc = makeChatService({ openai: fakeOpenAI('x') });
      await assert.rejects(() => svc.handleMessage({ sessionId: id, message: 'hi' }), (e) => e.status === 409);
    },
  },
  {
    name: 'reuses existing session and forwards full history to openai',
    fn: async () => {
      setup();
      const id = scenarioSession();
      sm.appendMessage(id, 'user', 'first');
      sm.appendMessage(id, 'assistant', 'reply 1');
      const fake = fakeOpenAI('reply 2');
      const svc = makeChatService({ openai: fake });
      const res = await svc.handleMessage({ sessionId: id, message: 'second' });
      assert.strictEqual(res.sessionId, id);
      assert.strictEqual(res.reply, 'reply 2');
      assert.deepStrictEqual(fake.lastMessages, [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply 1' },
        { role: 'user', content: 'second' },
      ]);
    },
  },
  {
    name: 'throws on blank message',
    fn: async () => {
      setup();
      const svc = makeChatService({ openai: fakeOpenAI('x') });
      await assert.rejects(
        () => svc.handleMessage({ sessionId: null, message: '   ' }),
        /message/i
      );
    },
  },
  {
    name: 'records token usage to the meter when one is provided',
    fn: async () => {
      setup();
      const recorded = [];
      const fakeMeter = { recordUsage: (p, c) => recorded.push([p, c]) };
      const svc = makeChatService({
        openai: fakeOpenAI('hi', { prompt_tokens: 42, completion_tokens: 7 }),
        tokenMeter: fakeMeter,
      });
      await svc.handleMessage({ sessionId: scenarioSession(), message: 'hello' });
      assert.deepStrictEqual(recorded, [[42, 7]]);
    },
  },
  {
    name: 'sends the summarized context (not the full transcript) to openai',
    fn: async () => {
      setup();
      const id = scenarioSession();
      sm.appendMessage(id, 'system', 'sys');
      sm.appendMessage(id, 'user', 'old');
      sm.appendMessage(id, 'assistant', 'old reply');
      const [, oldReply] = sm.getUnsummarized(id);
      sm.setSummary(id, 'ledger', oldReply.id);
      const fake = fakeOpenAI('new reply');
      const svc = makeChatService({ openai: fake });
      await svc.handleMessage({ sessionId: id, message: 'new' });
      assert.deepStrictEqual(fake.lastMessages, [
        { role: 'system', content: 'sys' },
        { role: 'system', content: 'Earlier in this scenario:\nledger' },
        { role: 'user', content: 'new' },
      ]);
    },
  },
];
