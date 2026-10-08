const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let dbInstance = null;

function getDb(filename) {
  if (dbInstance) return dbInstance;
  // DB_PATH points at a persistent disk in production; the default lives in the repo for local dev.
  const file = filename ?? process.env.DB_PATH ?? path.join(__dirname, 'emt.db');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  dbInstance = db;
  return db;
}

function resetForTests() {
  if (dbInstance) dbInstance.close();
  dbInstance = null;
}

module.exports = { getDb, resetForTests };
