const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');
const { makeChatService } = require('../services/chatService');

function setup() {
  resetForTests();
  getDb(':memory:');
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
    name: 'creates a new session when sessionId is null and returns reply',
    fn: async () => {
      setup();
      const svc = makeChatService({ openai: fakeOpenAI('hello back') });
      const res = await svc.handleMessage({ sessionId: null, message: 'hi' });
      assert.ok(res.sessionId);
      assert.strictEqual(res.reply, 'hello back');
      const history = sm.getHistory(res.sessionId);
      assert.deepStrictEqual(history, [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello back' },
      ]);
    },
  },
  {
    name: 'reuses existing session and forwards full history to openai',
    fn: async () => {
      setup();
      const id = sm.createSession();
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
      await svc.handleMessage({ sessionId: null, message: 'hello' });
      assert.deepStrictEqual(recorded, [[42, 7]]);
    },
  },
];
