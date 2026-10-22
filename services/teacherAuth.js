const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/databaseManager');
const repo = require('./classRepo');
const { httpError } = require('./httpError');

const COOKIE_NAME = 'emt_teacher';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function defaultGoogleVerifier(credential) {
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

function makeTeacherAuth({ googleVerifier = defaultGoogleVerifier } = {}) {
  async function signup({ email, name, password }) {
    const normalized = repo.normalizeEmail(email || '');
    if (!EMAIL_RE.test(normalized)) throw httpError(400, 'Please enter a valid email address.');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      throw httpError(400, `Password must be at least ${MIN_PASSWORD} characters.`);
    }
    const existing = repo.getTeacherByEmail(normalized);
    if (existing && existing.password_hash) {
      throw httpError(409, 'An account with that email already exists.');
    }
    const hash = await bcrypt.hash(password, 10);
    if (existing) {
      repo.setTeacherPassword(existing.id, hash);
      return repo.getTeacherById(existing.id);
    }
    return repo.createTeacher({
      email: normalized,
      name: (name || '').trim() || normalized,
      passwordHash: hash,
    });
  }

  async function login({ email, password }) {
    const bad = () => httpError(401, 'Email or password is incorrect.');
    const teacher = repo.getTeacherByEmail(repo.normalizeEmail(email || ''));
    if (!teacher || !teacher.password_hash || typeof password !== 'string') throw bad();
    if (!(await bcrypt.compare(password, teacher.password_hash))) throw bad();
    return teacher;
  }

  async function googleLogin(credential) {
    let payload;
    try {
      payload = await googleVerifier(credential);
    } catch {
      throw httpError(401, 'Google sign-in failed.');
    }
    if (!payload || !payload.sub || !payload.email) throw httpError(401, 'Google sign-in failed.');
    if (!payload.email_verified) throw httpError(401, 'Your Google email is not verified.');
    const bySub = repo.getTeacherByGoogleSub(payload.sub);
    if (bySub) return bySub;
    const byEmail = repo.getTeacherByEmail(payload.email);
    if (byEmail) {
      repo.setTeacherGoogleSub(byEmail.id, payload.sub);
      return repo.getTeacherById(byEmail.id);
    }
    return repo.createTeacher({
      email: payload.email,
      name: payload.name || payload.email,
      googleSub: payload.sub,
    });
  }

  function createSession(teacherId) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    getDb()
      .prepare('INSERT INTO teacher_sessions (token, teacher_id, created_at, expires_at) VALUES (?,?,?,?)')
      .run(token, teacherId, now, now + SESSION_MS);
    return token;
  }

  function getTeacherForToken(token) {
    if (!token) return null;
    const row = getDb().prepare('SELECT * FROM teacher_sessions WHERE token = ?').get(token);
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      deleteSession(token);
      return null;
    }
    return repo.getTeacherById(row.teacher_id);
  }

  function deleteSession(token) {
    getDb().prepare('DELETE FROM teacher_sessions WHERE token = ?').run(token);
  }

  function requireTeacher(req, res, next) {
    const token = parseCookies(req.headers && req.headers.cookie)[COOKIE_NAME];
    const teacher = getTeacherForToken(token);
    if (!teacher) return res.status(401).json({ error: 'Please sign in again.' });
    req.teacher = teacher;
    next();
  }

  function setCookie(res, token) {
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_MS });
  }

  function clearCookie(res) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
  }

  return {
    signup,
    login,
    googleLogin,
    createSession,
    getTeacherForToken,
    deleteSession,
    requireTeacher,
    setCookie,
    clearCookie,
  };
}

module.exports = { makeTeacherAuth, defaultGoogleVerifier, parseCookies, COOKIE_NAME };
