const { getDb } = require('../database/databaseManager');

// Read-only queries over every scenario session, free practice included. Admin only.

const RUN_SELECT = `
  SELECT s.id AS session_id, s.created_at, s.state,
         r.class_id, c.name AS class_name, c.code AS class_code, t.name AS teacher_name,
         r.student_id, st.name AS student_name, st.email_normalized AS student_email,
         r.assignment_id, a.due_at,
         (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id AND m.role = 'user') AS user_messages
  FROM sessions s
  LEFT JOIN class_runs r ON r.session_id = s.id
  LEFT JOIN classes c ON c.id = r.class_id
  LEFT JOIN teachers t ON t.id = c.teacher_id
  LEFT JOIN students st ON st.id = r.student_id
  LEFT JOIN assignments a ON a.id = r.assignment_id`;

function listRuns({ kind = 'all', classId = null, before = null, limit = 50 } = {}) {
  const where = ['s.state IS NOT NULL'];
  const params = [];
  if (kind === 'class') where.push('r.session_id IS NOT NULL');
  if (kind === 'practice') where.push('r.session_id IS NULL');
  if (classId) {
    where.push('r.class_id = ?');
    params.push(classId);
  }
  if (before != null) {
    where.push('s.created_at < ?');
    params.push(before);
  }
  params.push(limit);
  return getDb()
    .prepare(`${RUN_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC, s.rowid DESC LIMIT ?`)
    .all(...params);
}

function getRun(sessionId) {
  return getDb().prepare(`${RUN_SELECT} WHERE s.id = ? AND s.state IS NOT NULL`).get(sessionId) ?? null;
}

function listStatsRows() {
  return getDb()
    .prepare(
      `SELECT s.created_at, s.state, r.class_id, r.student_id,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id AND m.role = 'user') AS user_messages
       FROM sessions s LEFT JOIN class_runs r ON r.session_id = s.id
       WHERE s.state IS NOT NULL`
    )
    .all();
}

function listClassesWithTeachers() {
  return getDb()
    .prepare(
      `SELECT c.id, c.name, c.code, t.name AS teacher_name,
              (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id) AS students
       FROM classes c JOIN teachers t ON t.id = c.teacher_id
       ORDER BY c.created_at, c.rowid`
    )
    .all();
}

function dbSizeBytes() {
  const db = getDb();
  return db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true });
}

module.exports = { listRuns, getRun, listStatsRows, listClassesWithTeachers, dbSizeBytes };
