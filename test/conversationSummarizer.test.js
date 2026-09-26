const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');
const { makeSummarizer } = require('../services/conversationSummarizer');

function setup() { resetForTests(); getDb(':memory:'); }

function fakeOpenAI(reply, usage) {
  const fake = {
    lastMessages: null,
    reply,
    chat: { completions: {
      create: async ({ messages }) => {
        fake.lastMessages = messages;
        return { choices: [{ message: { content: fake.reply } }], usage };
      },
    }},
  };
  return fake;
}

function seedHistory(sessionId, count) {
  for (let i = 0; i < count; i++) {
    sm.appendMessage(sessionId, i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`);
  }
}

exports.tests = [
  {
    name: 'maybeSummarize is a no-op when history is below threshold',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      seedHistory(sid, 10);
      const summarizer = makeSummarizer({ openai: fakeOpenAI('summary', { prompt_tokens: 100, completion_tokens: 30 }) });
      const result = await summarizer.maybeSummarize(sid);
      assert.strictEqual(result, false);
    },
  },
  {
    name: 'maybeSummarize records token usage to the meter when provided',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      seedHistory(sid, 30);
      const recorded = [];
      const fakeMeter = { recordUsage: (p, c) => recorded.push([p, c]) };
      const summarizer = makeSummarizer({
        openai: fakeOpenAI('summary text', { prompt_tokens: 1234, completion_tokens: 56 }),
        tokenMeter: fakeMeter,
      });
      const result = await summarizer.maybeSummarize(sid);
      assert.strictEqual(result, true);
      assert.deepStrictEqual(recorded, [[1234, 56]]);
    },
  },
  {
    name: 'maybeSummarize works without a meter (backward compatible)',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      seedHistory(sid, 30);
      const summarizer = makeSummarizer({
        openai: fakeOpenAI('summary text', { prompt_tokens: 100, completion_tokens: 30 }),
      });
      const result = await summarizer.maybeSummarize(sid);
      assert.strictEqual(result, true);
    },
  },
  {
    name: 'summarizing never deletes transcript messages (grading needs them)',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      sm.appendMessage(sid, 'system', 'scenario prompt');
      seedHistory(sid, 30);
      const summarizer = makeSummarizer({ openai: fakeOpenAI('ledger', {}) });
      await summarizer.maybeSummarize(sid);
      const history = sm.getHistory(sid);
      assert.strictEqual(history.length, 31);
      assert.strictEqual(history[1].content, 'msg 0');
      const context = sm.getContext(sid);
      assert.strictEqual(context.length, 1 + 1 + 8);
      assert.strictEqual(context[1].content, 'Earlier in this scenario:\nledger');
    },
  },
  {
    name: 'repeated summarization keeps a single rolling summary and folds the prior one in',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      sm.appendMessage(sid, 'system', 'scenario prompt');
      seedHistory(sid, 30);
      const openai = fakeOpenAI('first ledger', {});
      const summarizer = makeSummarizer({ openai });
      await summarizer.maybeSummarize(sid);
      assert.strictEqual(await summarizer.maybeSummarize(sid), false);
      seedHistory(sid, 22);
      openai.reply = 'second ledger';
      assert.strictEqual(await summarizer.maybeSummarize(sid), true);
      assert.ok(openai.lastMessages[1].content.includes('first ledger'));
      const context = sm.getContext(sid);
      const systemMsgs = context.filter((m) => m.role === 'system');
      assert.deepStrictEqual(systemMsgs.map((m) => m.content), [
        'scenario prompt',
        'Earlier in this scenario:\nsecond ledger',
      ]);
      assert.strictEqual(context.length, 2 + 8);
      assert.strictEqual(sm.getHistory(sid).length, 53);
    },
  },
];
