const express = require('express');
const adminRepo = require('../services/adminRepo');
const { formatCode } = require('../services/classRepo');
const { summarizeRun } = require('../services/classStats');
const { computeAdminStats, resolveZone } = require('../services/adminStats');
const sessionManager = require('../services/sessionManager');

const NOT_FOUND = { error: 'not found' };
const KINDS = new Set(['all', 'class', 'practice']);
const DISK_BYTES = 1_000_000_000; // render.yaml: sizeGB 1

function parseState(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function parseLimit(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 100) : 50;
}

function classRunOf(row) {
  if (!row.class_id) return null;
  return { classId: row.class_id, className: row.class_name, code: formatCode(row.class_code), teacherName: row.teacher_name };
}

function runItem(row) {
  return {
    ...summarizeRun(row, { due_at: row.due_at }),
    messageCount: row.user_messages,
    classRun: classRunOf(row),
    student: row.student_id ? { name: row.student_name, email: row.student_email } : null,
  };
}

function createAdminRouter({ teacherAuth, tokenMeter = null, statsTtlMs = 60_000 }) {
  const router = express.Router();
  router.use(teacherAuth.requireAdmin);
  // Stats scan every session; cache per time zone so refreshes don't block chats.
  const statsCache = new Map();

  function handle(fn) {
    return async (req, res) => {
      try {
        await fn(req, res);
      } catch (err) {
        console.error('[admin] unexpected error:', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
    };
  }

  router.get('/runs', handle(async (req, res) => {
    const kind = KINDS.has(req.query.kind) ? req.query.kind : 'all';
    const limit = parseLimit(req.query.limit);
    const before = Number(req.query.before);
    const classId = typeof req.query.classId === 'string' && req.query.classId ? req.query.classId : null;
    const rows = adminRepo.listRuns({ kind, classId, limit, before: req.query.before && Number.isFinite(before) ? before : null });
    const runs = rows.map(runItem);
    res.json({ runs, nextBefore: runs.length === limit ? runs[runs.length - 1].createdAt : null });
  }));

  router.get('/stats', handle(async (req, res) => {
    const tz = typeof req.query.tz === 'string' && req.query.tz.length <= 64 ? resolveZone(req.query.tz) : 'UTC';
    const now = Date.now();
    let entry = statsCache.get(tz);
    if (!entry || now - entry.generatedAt >= statsTtlMs) {
      const classes = adminRepo.listClassesWithTeachers().map((c) => ({ ...c, code: formatCode(c.code) }));
      entry = { generatedAt: now, stats: computeAdminStats({ runs: adminRepo.listStatsRows(), classes, now, timeZone: tz }) };
      statsCache.set(tz, entry);
    }
    res.json({
      ...entry.stats,
      generatedAt: entry.generatedAt,
      storage: { bytes: adminRepo.dbSizeBytes(), diskBytes: DISK_BYTES },
      ...(tokenMeter ? { aiToday: tokenMeter.snapshot() } : {}),
    });
  }));

  router.get('/runs/:sessionId', handle(async (req, res) => {
    const row = adminRepo.getRun(req.params.sessionId);
    if (!row) return res.status(404).json(NOT_FOUND);
    const { grade = null, ...scenario } = parseState(row.state);
    res.json({
      run: summarizeRun(row, { due_at: row.due_at }),
      student: row.student_id ? { id: row.student_id, name: row.student_name, email: row.student_email } : null,
      classRun: classRunOf(row),
      scenario,
      grade,
      messages: sessionManager.getHistory(row.session_id).filter((m) => m.role !== 'system'),
    });
  }));

  return router;
}

module.exports = { createAdminRouter };
