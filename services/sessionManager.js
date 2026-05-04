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

function replaceHistory(sessionId, messages) {
  const db = getDb();
  const trx = db.transaction(() => {
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    const insert = db.prepare(
      'INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    );
    const now = Date.now();
    for (const m of messages) insert.run(sessionId, m.role, m.content, now);
  });
  trx();
}

module.exports = { createSession, getSession, appendMessage, getHistory, setScenario, replaceHistory };
