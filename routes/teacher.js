const express = require('express');
const { parseCookies, COOKIE_NAME } = require('../services/teacherAuth');

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

  return router;
}

module.exports = { createTeacherRouter };
