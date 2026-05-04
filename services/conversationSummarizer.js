const sm = require('./sessionManager');

const DEFAULT_MODEL = 'gpt-4o-mini';
const TRIGGER_AT = 30;
const KEEP_RECENT = 8;

function makeSummarizer({ openai, model = DEFAULT_MODEL, tokenMeter = null }) {
  async function maybeSummarize(sessionId) {
    const history = sm.getHistory(sessionId);
    if (history.length < TRIGGER_AT) return false;
    const head = history.slice(0, history.length - KEEP_RECENT);
    const tail = history.slice(-KEEP_RECENT);
    const transcript = head.map((m) => `${m.role}: ${m.content}`).join('\n');
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Summarize this EMT scenario chat into a tight ledger preserving every clinical action the EMT performed, every finding revealed, every intervention applied, and every vitals change. Output a single dense paragraph.' },
        { role: 'user', content: transcript },
      ],
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    const summary = completion.choices[0].message.content;
    const row = sm.getSession(sessionId);
    const systemMsgs = head.filter((m) => m.role === 'system');
    sm.replaceHistory(sessionId, [
      ...systemMsgs,
      { role: 'system', content: `Earlier in this scenario:\n${summary}` },
      ...tail,
    ]);
    return true;
  }
  return { maybeSummarize };
}

module.exports = { makeSummarizer };
