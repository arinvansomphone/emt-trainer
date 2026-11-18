const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const { makeTeacherAuth } = require('../services/teacherAuth');
const repo = require('../services/classRepo');

function setup() { resetForTests(); getDb(':memory:'); }

// Google-verified teacher + session cookie, without going through Google.
function signIn(email, { google = true } = {}) {
  const t = repo.createTeacher({ email, name: 'Admin', googleSub: google ? `g-${email}` : null, passwordHash: google ? null : 'h' });
  return { teacher: t, cookie: `emt_teacher=${makeTeacherAuth().createSession(t.id)}` };
}

async function withAdmins(value, fn) {
  const prev = process.env.ADMIN_EMAILS;
  if (value === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = value;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = prev;
  }
}

const { isAdmin } = makeTeacherAuth();

exports.tests = [
  {
    name: 'isAdmin true for Google-verified listed email, case/space-insensitive',
    fn: () => withAdmins(' Admin@X.edu , b@y.edu', () => {
      assert.strictEqual(isAdmin({ email: 'admin@x.edu', google_sub: 'g' }), true);
    }),
  },
  {
    name: 'isAdmin false without google_sub',
    fn: () => withAdmins('admin@x.edu', () => {
      assert.strictEqual(isAdmin({ email: 'admin@x.edu', google_sub: null }), false);
    }),
  },
  {
    name: 'isAdmin false for unlisted email',
    fn: () => withAdmins('admin@x.edu', () => {
      assert.strictEqual(isAdmin({ email: 'other@x.edu', google_sub: 'g' }), false);
    }),
  },
  {
    name: 'isAdmin false when ADMIN_EMAILS unset or empty',
    fn: async () => {
      const t = { email: 'admin@x.edu', google_sub: 'g' };
      await withAdmins(undefined, () => assert.strictEqual(isAdmin(t), false));
      await withAdmins('', () => assert.strictEqual(isAdmin(t), false));
      await withAdmins(' , ', () => assert.strictEqual(isAdmin(t), false));
    },
  },
  {
    name: '/api/teacher/me reports isAdmin',
    fn: () => withAdmins('admin@x.edu', async () => {
      setup();
      const app = createApp();
      const admin = signIn('admin@x.edu');
      const other = signIn('t@x.edu');
      assert.strictEqual((await request(app).get('/api/teacher/me').set('Cookie', admin.cookie)).body.teacher.isAdmin, true);
      assert.strictEqual((await request(app).get('/api/teacher/me').set('Cookie', other.cookie)).body.teacher.isAdmin, false);
    }),
  },
];
