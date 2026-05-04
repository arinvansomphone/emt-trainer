const sm = require('./sessionManager');

const DEFAULT_MODEL = 'gpt-4o-mini';

const VITALS_RE = /\[Vitals:\s*([^\]]+)\]/i;

function parseVitals(text) {
  const m = text.match(VITALS_RE);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim());
    if (!k || v === undefined) continue;
    const num = Number(v);
    out[k.toLowerCase()] = Number.isFinite(num) ? num : v;
  }
  return Object.keys(out).length ? out : null;
}

function applyVitals(sessionId, partial) {
  const row = sm.getSession(sessionId);
  if (!row || !row.state) return;
  const state = JSON.parse(row.state);
  state.currentVitals = { ...(state.currentVitals || state.patientProfile?.vitals || {}), ...partial };
  sm.setScenario(sessionId, row.scenario_type, JSON.stringify(state));
}

function makeChatService({ openai, model = DEFAULT_MODEL, summarizer = null, tokenMeter = null }) {
  async function handleMessage({ sessionId, message }) {
    if (!message || !message.trim()) {
      throw new Error('message is required');
    }
    let id = sessionId;
    if (!id || !sm.getSession(id)) {
      id = sm.createSession();
    }
    sm.appendMessage(id, 'user', message);
    const history = sm.getHistory(id);
    const completion = await openai.chat.completions.create({
      model,
      messages: history,
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    const reply = completion.choices[0].message.content;
    sm.appendMessage(id, 'assistant', reply);
    const vitalsDelta = parseVitals(reply);
    if (vitalsDelta) applyVitals(id, vitalsDelta);
    if (summarizer) {
      try { await summarizer.maybeSummarize(id); } catch (e) { console.error('[summarizer]', e); }
    }
    return { sessionId: id, reply };
  }
  return { handleMessage };
}

module.exports = { makeChatService, parseVitals };
