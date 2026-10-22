const express = require('express');
const { parseCookies, COOKIE_NAME } = require('../services/teacherAuth');
const repo = require('../services/classRepo');
const { computeClassOverview, summarizeRun } = require('../services/classStats');
const { isValid } = require('../services/scenarioTypes');
const sessionManager = require('../services/sessionManager');

const NOT_FOUND = { error: 'not found' };
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

function parseState(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function publicTeacher(t) {
  return { id: t.id, email: t.email, name: t.name };
}

function createTeacherRouter({ teacherAuth }) {
  const router = express.Router();

  function handle(fn) {
    return async (req, res) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err && err.expose) return res.status(err.status || 400).json({ error: err.message });
        console.error('[teacher] unexpected error:', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
    };
  }

  function startSession(res, teacher) {
    teacherAuth.setCookie(res, teacherAuth.createSession(teacher.id));
    res.json({ teacher: publicTeacher(teacher) });
  }

  router.post('/signup', handle(async (req, res) => {
    startSession(res, await teacherAuth.signup(req.body || {}));
  }));

  router.post('/login', handle(async (req, res) => {
    startSession(res, await teacherAuth.login(req.body || {}));
  }));

  router.post('/google', handle(async (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(501).json({ error: 'Google sign-in is not configured.' });
    }
    startSession(res, await teacherAuth.googleLogin((req.body || {}).credential));
  }));

  router.post('/logout', handle(async (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) teacherAuth.deleteSession(token);
    teacherAuth.clearCookie(res);
    res.json({ ok: true });
  }));

  router.get('/me', handle(async (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    const teacher = teacherAuth.getTeacherForToken(token);
    if (!teacher) return res.status(401).json({ error: 'Please sign in again.' });
    res.json({ teacher: publicTeacher(teacher) });
  }));

  // --- classes, assignments, students, runs (all behind requireTeacher) ---
  const guard = teacherAuth.requireTeacher;

  function overviewFor(cls) {
    return computeClassOverview({
      runs: repo.listClassRuns(cls.id),
      students: repo.listStudents(cls.id),
      assignments: repo.listAssignments(cls.id),
    });
  }

  router.get('/classes', guard, handle(async (req, res) => {
    res.json(repo.listClasses(req.teacher.id).map((c) => {
      const o = overviewFor(c);
      return {
        id: c.id,
        name: c.name,
        code: repo.formatCode(c.code),
        studentsJoined: repo.listStudents(c.id).length,
        gradedRuns: o.metrics.gradedRuns,
      };
    }));
  }));

  router.post('/classes', guard, handle(async (req, res) => {
    const name = String((req.body || {}).name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Enter a class name.' });
    const c = repo.createClass(req.teacher.id, name);
    res.json({ id: c.id, name: c.name, code: repo.formatCode(c.code) });
  }));

  router.get('/classes/:id', guard, handle(async (req, res) => {
    const c = repo.getClassForTeacher(req.params.id, req.teacher.id);
    if (!c) return res.status(404).json(NOT_FOUND);
    res.json({ class: { id: c.id, name: c.name, code: repo.formatCode(c.code) }, ...overviewFor(c) });
  }));

  router.post('/classes/:id/assignments', guard, handle(async (req, res) => {
    const c = repo.getClassForTeacher(req.params.id, req.teacher.id);
    if (!c) return res.status(404).json(NOT_FOUND);
    const { type, subtype, title, dueAt } = req.body || {};
    if (typeof type !== 'string' || typeof subtype !== 'string' || !isValid(type, subtype)) return res.status(400).json({ error: 'invalid type or subtype' });
    let due = null;
    if (dueAt !== undefined && dueAt !== null && String(dueAt).trim() !== '') {
      due = Date.parse(String(dueAt));
      if (!Number.isFinite(due)) return res.status(400).json({ error: 'Enter a valid due date.' });
    }
    const finalTitle = String(title ?? '').trim() || `${cap(type)} · ${subtype}`;
    const a = repo.createAssignment(c.id, { type, subtype, title: finalTitle, dueAt: due });
    res.json({ id: a.id, title: a.title, type: a.type, subtype: a.subtype, dueAt: a.due_at ?? null });
  }));

  router.delete('/assignments/:id', guard, handle(async (req, res) => {
    const a = repo.getAssignment(req.params.id);
    if (!a || !repo.getClassForTeacher(a.class_id, req.teacher.id)) return res.status(404).json(NOT_FOUND);
    repo.deleteAssignment(a.id);
    res.json({ ok: true });
  }));

  router.get('/classes/:id/students/:studentId', guard, handle(async (req, res) => {
    const c = repo.getClassForTeacher(req.params.id, req.teacher.id);
    if (!c) return res.status(404).json(NOT_FOUND);
    const st = repo.getStudent(c.id, req.params.studentId);
    if (!st) return res.status(404).json(NOT_FOUND);
    const assignments = new Map(repo.listAssignments(c.id).map((a) => [a.id, a]));
    const runs = repo
      .listClassRuns(c.id)
      .filter((r) => r.student_id === st.id)
      .sort((a, b) => b.created_at - a.created_at)
      .map((r) => summarizeRun(r, assignments.get(r.assignment_id) ?? null));
    res.json({ student: { id: st.id, name: st.name, email: st.email_normalized }, runs });
  }));

  router.get('/runs/:sessionId', guard, handle(async (req, res) => {
    const cr = repo.getClassRun(req.params.sessionId);
    if (!cr || !repo.getClassForTeacher(cr.class_id, req.teacher.id)) return res.status(404).json(NOT_FOUND);
    const session = sessionManager.getSession(cr.session_id);
    const st = repo.getStudent(cr.class_id, cr.student_id);
    if (!session || !st) return res.status(404).json(NOT_FOUND);
    const { grade = null, ...scenario } = parseState(session.state);
    const assignment = cr.assignment_id ? repo.getAssignment(cr.assignment_id) : null;
    res.json({
      run: summarizeRun({ ...cr, state: session.state }, assignment),
      student: { id: st.id, name: st.name },
      scenario,
      grade,
      messages: sessionManager.getHistory(cr.session_id).filter((m) => m.role !== 'system'),
    });
  }));

  return router;
}

module.exports = { createTeacherRouter };
