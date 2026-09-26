const crypto = require('crypto');
const { getDb } = require('../database/databaseManager');

function createSession() {
  const id = crypto.randomUUID();
  getDb()
    .prepare('INSERT INTO sessions (id, created_at) VALUES (?, ?)')
    .run(id, Date.now());
  return id;
}

function getSession(id) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  return row ?? null;
}

function appendMessage(sessionId, role, content) {
  getDb()
    .prepare(
      'INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(sessionId, role, content, Date.now());
}

function getHistory(sessionId) {
  return getDb()
    .prepare(
      'SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC'
    )
    .all(sessionId);
}

function setScenario(sessionId, scenarioType, stateJson) {
  getDb()
    .prepare('UPDATE sessions SET scenario_type = ?, state = ? WHERE id = ?')
    .run(scenarioType, stateJson, sessionId);
}

function getSummary(sessionId) {
  return getDb().prepare('SELECT content, upto_id FROM summaries WHERE session_id = ?').get(sessionId) ?? null;
}

function setSummary(sessionId, content, uptoId) {
  getDb()
    .prepare(
      'INSERT INTO summaries (session_id, content, upto_id) VALUES (?, ?, ?) ' +
        'ON CONFLICT(session_id) DO UPDATE SET content = excluded.content, upto_id = excluded.upto_id'
    )
    .run(sessionId, content, uptoId);
}

// Non-system messages not yet folded into the summary, with ids.
function getUnsummarized(sessionId) {
  const uptoId = getSummary(sessionId)?.upto_id ?? 0;
  return getDb()
    .prepare(
      "SELECT id, role, content FROM messages WHERE session_id = ? AND role != 'system' AND id > ? ORDER BY id ASC"
    )
    .all(sessionId, uptoId);
}

// What the model sees: system messages, the rolling summary, then unsummarized turns.
function getContext(sessionId) {
  const summary = getSummary(sessionId);
  if (!summary) return getHistory(sessionId);
  const system = getDb()
    .prepare("SELECT role, content FROM messages WHERE session_id = ? AND role = 'system' ORDER BY id ASC")
    .all(sessionId);
  const recent = getUnsummarized(sessionId).map(({ role, content }) => ({ role, content }));
  return [...system, { role: 'system', content: `Earlier in this scenario:\n${summary.content}` }, ...recent];
}

module.exports = { createSession, getSession, appendMessage, getHistory, setScenario, getSummary, setSummary, getUnsummarized, getContext };
