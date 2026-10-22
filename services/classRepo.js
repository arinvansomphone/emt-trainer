const crypto = require('crypto');
const { getDb } = require('../database/databaseManager');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function normalizeCode(input) {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatCode(code) {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function normalizeEmail(s) {
  return String(s ?? '').trim().toLowerCase();
}

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

// --- teachers ---

function createTeacher({ email, name, passwordHash = null, googleSub = null }) {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      'INSERT INTO teachers (id, email, name, password_hash, google_sub, created_at) VALUES (?,?,?,?,?,?)'
    )
    .run(id, normalizeEmail(email), name, passwordHash, googleSub, Date.now());
  return getTeacherById(id);
}

function getTeacherById(id) {
  return getDb().prepare('SELECT * FROM teachers WHERE id = ?').get(id) ?? null;
}

function getTeacherByEmail(email) {
  return getDb().prepare('SELECT * FROM teachers WHERE email = ?').get(normalizeEmail(email)) ?? null;
}

function getTeacherByGoogleSub(sub) {
  return getDb().prepare('SELECT * FROM teachers WHERE google_sub = ?').get(sub) ?? null;
}

function setTeacherGoogleSub(id, sub) {
  getDb().prepare('UPDATE teachers SET google_sub = ? WHERE id = ?').run(sub, id);
}

function setTeacherPassword(id, hash) {
  getDb().prepare('UPDATE teachers SET password_hash = ? WHERE id = ?').run(hash, id);
}

// --- classes ---

function createClass(teacherId, name) {
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO classes (id, teacher_id, name, code, created_at) VALUES (?,?,?,?,?)'
  );
  for (;;) {
    const id = crypto.randomUUID();
    const code = generateCode();
    const created_at = Date.now();
    try {
      insert.run(id, teacherId, name, code, created_at);
      return { id, teacher_id: teacherId, name, code, created_at };
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') continue; // code collision, retry
      throw err;
    }
  }
}

function listClasses(teacherId) {
  return getDb()
    .prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at, rowid')
    .all(teacherId);
}

function getClassForTeacher(classId, teacherId) {
  return (
    getDb().prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId) ?? null
  );
}

function getClassByCode(input) {
  return getDb().prepare('SELECT * FROM classes WHERE code = ?').get(normalizeCode(input)) ?? null;
}

// --- assignments ---

function createAssignment(classId, { type, subtype, title, dueAt = null }) {
  const id = crypto.randomBytes(9).toString('base64url');
  getDb()
    .prepare(
      'INSERT INTO assignments (id, class_id, type, subtype, title, due_at, created_at) VALUES (?,?,?,?,?,?,?)'
    )
    .run(id, classId, type, subtype, title, dueAt, Date.now());
  return getDb().prepare('SELECT * FROM assignments WHERE id = ?').get(id);
}

function getAssignment(id) {
  return (
    getDb()
      .prepare(
        `SELECT a.*, c.name AS class_name, c.code AS class_code
         FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.id = ?`
      )
      .get(id) ?? null
  );
}

function listAssignments(classId) {
  return getDb()
    .prepare('SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at, rowid')
    .all(classId);
}

function deleteAssignment(id) {
  getDb().prepare('DELETE FROM assignments WHERE id = ?').run(id);
}

// --- students ---

function upsertStudent(classId, name, email) {
  const db = getDb();
  const emailNorm = normalizeEmail(email);
  db.prepare(
    `INSERT INTO students (id, class_id, email_normalized, name, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT (class_id, email_normalized) DO UPDATE SET name = excluded.name`
  ).run(crypto.randomUUID(), classId, emailNorm, name, Date.now());
  return db
    .prepare('SELECT * FROM students WHERE class_id = ? AND email_normalized = ?')
    .get(classId, emailNorm);
}

function listStudents(classId) {
  return getDb()
    .prepare('SELECT * FROM students WHERE class_id = ? ORDER BY created_at, rowid')
    .all(classId);
}

function getStudent(classId, studentId) {
  return (
    getDb().prepare('SELECT * FROM students WHERE class_id = ? AND id = ?').get(classId, studentId) ?? null
  );
}

// --- class runs ---

function recordClassRun({ sessionId, classId, studentId, assignmentId = null }) {
  getDb()
    .prepare(
      'INSERT INTO class_runs (session_id, class_id, student_id, assignment_id, created_at) VALUES (?,?,?,?,?)'
    )
    .run(sessionId, classId, studentId, assignmentId, Date.now());
}

function getClassRun(sessionId) {
  return (
    getDb()
      .prepare(
        `SELECT r.*, c.name AS class_name, c.code AS class_code
         FROM class_runs r JOIN classes c ON c.id = r.class_id WHERE r.session_id = ?`
      )
      .get(sessionId) ?? null
  );
}

function listClassRuns(classId) {
  return getDb()
    .prepare(
      `SELECT r.session_id, r.student_id, r.assignment_id, r.created_at, s.state
       FROM class_runs r JOIN sessions s ON s.id = r.session_id
       WHERE r.class_id = ? ORDER BY r.created_at, r.rowid`
    )
    .all(classId);
}

module.exports = {
  normalizeCode,
  formatCode,
  normalizeEmail,
  createTeacher,
  getTeacherById,
  getTeacherByEmail,
  getTeacherByGoogleSub,
  setTeacherGoogleSub,
  setTeacherPassword,
  createClass,
  listClasses,
  getClassForTeacher,
  getClassByCode,
  createAssignment,
  getAssignment,
  listAssignments,
  deleteAssignment,
  upsertStudent,
  listStudents,
  getStudent,
  recordClassRun,
  getClassRun,
  listClassRuns,
};
