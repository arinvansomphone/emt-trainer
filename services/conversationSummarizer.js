const sm = require('./sessionManager');

const DEFAULT_MODEL = 'gpt-4o-mini';
const TRIGGER_AT = 30;
const KEEP_RECENT = 8;

// Compacts what the model sees. The stored transcript is never modified —
// grading and the session view read the full history.
function makeSummarizer({ openai, model = DEFAULT_MODEL, tokenMeter = null }) {
  async function maybeSummarize(sessionId) {
    if (sm.getContext(sessionId).length < TRIGGER_AT) return false;
    const unsummarized = sm.getUnsummarized(sessionId);
    const head = unsummarized.slice(0, unsummarized.length - KEEP_RECENT);
    if (head.length === 0) return false;
    const prior = sm.getSummary(sessionId);
    const transcript = [
      ...(prior ? [`Summary so far: ${prior.content}`] : []),
      ...head.map((m) => `${m.role}: ${m.content}`),
    ].join('\n');
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Summarize this EMT scenario chat into a tight ledger preserving every clinical action the EMT performed, every finding revealed, every intervention applied, and every vitals change. If a prior summary is given, merge it in. Output a single dense paragraph.' },
        { role: 'user', content: transcript },
      ],
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    sm.setSummary(sessionId, completion.choices[0].message.content, head[head.length - 1].id);
    return true;
  }
  return { maybeSummarize };
}

module.exports = { makeSummarizer };
