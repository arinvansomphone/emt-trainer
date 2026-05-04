const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');
const { makeSummarizer } = require('../services/conversationSummarizer');

function setup() { resetForTests(); getDb(':memory:'); }

function fakeOpenAI(reply, usage) {
  const fake = {
    lastMessages: null,
    chat: { completions: {
      create: async ({ messages }) => {
        fake.lastMessages = messages;
        return { choices: [{ message: { content: reply } }], usage };
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
];
