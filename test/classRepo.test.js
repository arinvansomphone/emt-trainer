const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');
const repo = require('../services/classRepo');

function setup() {
  resetForTests();
  getDb(':memory:');
}

function makeClass(email = 'a@school.edu') {
  const t = repo.createTeacher({ email, name: 'Teacher' });
  return { t, c: repo.createClass(t.id, 'EMT 101') };
}

exports.tests = [
  {
    name: 'normalizeCode accepts dashes, spaces, lowercase',
    fn: () => {
      assert.strictEqual(repo.normalizeCode('k7q 2-mx'), 'K7Q2MX');
      assert.strictEqual(repo.formatCode('K7Q2MX'), 'K7Q-2MX');
    },
  },
  {
    name: 'createClass makes a 6-char code from the safe alphabet',
    fn: () => {
      setup();
      const { c } = makeClass();
      assert.ok(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(c.code));
      assert.strictEqual(repo.getClassByCode(repo.formatCode(c.code).toLowerCase()).id, c.id);
    },
  },
  {
    name: "getClassForTeacher hides other teachers' classes",
    fn: () => {
      setup();
      const { t, c } = makeClass('a@school.edu');
      const b = repo.createTeacher({ email: 'b@school.edu', name: 'B' });
      assert.strictEqual(repo.getClassForTeacher(c.id, b.id), null);
      assert.strictEqual(repo.getClassForTeacher(c.id, t.id).id, c.id);
    },
  },
  {
    name: 'upsertStudent merges by normalized email',
    fn: () => {
      setup();
      const { c } = makeClass();
      const s1 = repo.upsertStudent(c.id, 'Sam', 'Sam@School.edu ');
      const s2 = repo.upsertStudent(c.id, 'Sam P', 'sam@school.edu');
      assert.strictEqual(s1.id, s2.id);
      assert.strictEqual(s2.name, 'Sam P');
      assert.strictEqual(repo.listStudents(c.id).length, 1);
    },
  },
  {
    name: 'same email in two classes is two students',
    fn: () => {
      setup();
      const { t, c } = makeClass();
      const c2 = repo.createClass(t.id, 'EMT 102');
      const s1 = repo.upsertStudent(c.id, 'Sam', 'sam@school.edu');
      const s2 = repo.upsertStudent(c2.id, 'Sam', 'sam@school.edu');
      assert.notStrictEqual(s1.id, s2.id);
    },
  },
  {
    name: 'deleteAssignment keeps the run as class practice',
    fn: () => {
      setup();
      const { c } = makeClass();
      const a = repo.createAssignment(c.id, { type: 'trauma', subtype: 'MVC', title: 'Crash' });
      const s = repo.upsertStudent(c.id, 'Sam', 'sam@school.edu');
      const sid = sm.createSession();
      repo.recordClassRun({ sessionId: sid, classId: c.id, studentId: s.id, assignmentId: a.id });
      assert.strictEqual(repo.getClassRun(sid).assignment_id, a.id);
      repo.deleteAssignment(a.id);
      assert.strictEqual(repo.getClassRun(sid).assignment_id, null);
      assert.strictEqual(repo.getAssignment(a.id), null);
      assert.strictEqual(repo.listClassRuns(c.id).length, 1);
    },
  },
  {
    name: 'schema applies cleanly over a pre-existing database',
    fn: () => {
      const file = path.join(os.tmpdir(), `emt-old-${process.pid}-${Date.now()}.db`);
      try {
        const old = new Database(file);
        old.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  scenario_type TEXT,
  state TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
CREATE TABLE IF NOT EXISTS summaries (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  upto_id INTEGER NOT NULL
);`);
        old.prepare('INSERT INTO sessions (id, created_at, scenario_type, state) VALUES (?,?,?,?)')
          .run('old-1', 1000, 'trauma', '{}');
        old.close();

        resetForTests();
        const db = getDb(file);
        const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('old-1');
        assert.strictEqual(row.scenario_type, 'trauma');
        const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classes'").get();
        assert.ok(tbl);
      } finally {
        resetForTests();
        for (const suffix of ['', '-wal', '-shm']) {
          try { fs.unlinkSync(file + suffix); } catch {}
        }
      }
    },
  },
];
