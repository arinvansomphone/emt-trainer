const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const { makeTeacherAuth } = require('../services/teacherAuth');

function setup(payload) {
  resetForTests();
  getDb(':memory:');
  return makeTeacherAuth({ googleVerifier: async () => payload });
}

async function rejects(p, status) {
  try {
    await p;
  } catch (e) {
    assert.strictEqual(e.status, status);
    return e;
  }
  assert.fail('expected rejection');
}

exports.tests = [
  {
    name: 'teacherAuth: signup then login returns the same teacher',
    fn: async () => {
      const a = setup();
      const t = await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      const l = await a.login({ email: 'a@school.edu', password: 'password1' });
      assert.strictEqual(l.id, t.id);
    },
  },
  {
    name: 'teacherAuth: login with wrong password throws 401',
    fn: async () => {
      const a = setup();
      await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      const e = await rejects(a.login({ email: 'a@school.edu', password: 'nope-nope' }), 401);
      assert.strictEqual(e.message, 'Email or password is incorrect.');
      await rejects(a.login({ email: 'x@school.edu', password: 'password1' }), 401);
    },
  },
  {
    name: 'teacherAuth: signup rejects 7-char password with 400',
    fn: async () => {
      const a = setup();
      await rejects(a.signup({ email: 'a@school.edu', name: 'A', password: '1234567' }), 400);
      await rejects(a.signup({ email: 'not-an-email', name: 'A', password: 'password1' }), 400);
    },
  },
  {
    name: 'teacherAuth: duplicate signup throws 409',
    fn: async () => {
      const a = setup();
      await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      await rejects(a.signup({ email: 'a@school.edu', name: 'A', password: 'password2' }), 409);
    },
  },
  {
    name: 'teacherAuth: email casing is normalized',
    fn: async () => {
      const a = setup();
      await a.signup({ email: 'Ms.Lee@School.edu', name: 'Lee', password: 'password1' });
      const t = await a.login({ email: 'ms.lee@school.edu', password: 'password1' });
      assert.strictEqual(t.email, 'ms.lee@school.edu');
    },
  },
  {
    name: 'teacherAuth: googleLogin links to an existing email account',
    fn: async () => {
      const a = setup({ sub: 'g1', email: 'a@school.edu', name: 'A', email_verified: true });
      const t = await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      const g = await a.googleLogin('cred');
      assert.strictEqual(g.id, t.id);
      assert.strictEqual(g.google_sub, 'g1');
      assert.strictEqual((await a.googleLogin('cred')).id, t.id);
    },
  },
  {
    name: 'teacherAuth: googleLogin creates a new teacher',
    fn: async () => {
      const a = setup({ sub: 'g2', email: 'New@School.edu', name: 'New', email_verified: true });
      const g = await a.googleLogin('cred');
      assert.strictEqual(g.email, 'new@school.edu');
      assert.strictEqual(g.google_sub, 'g2');
    },
  },
  {
    name: 'teacherAuth: signup after Google-only account sets a password on the same teacher',
    fn: async () => {
      const a = setup({ sub: 'g3', email: 'a@school.edu', name: 'A', email_verified: true });
      const g = await a.googleLogin('cred');
      const t = await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      assert.strictEqual(t.id, g.id);
      assert.strictEqual((await a.login({ email: 'a@school.edu', password: 'password1' })).id, g.id);
    },
  },
  {
    name: 'teacherAuth: googleLogin rejects email_verified=false with 401',
    fn: async () => {
      const a = setup({ sub: 'g4', email: 'a@school.edu', name: 'A', email_verified: false });
      await rejects(a.googleLogin('cred'), 401);
    },
  },
  {
    name: 'teacherAuth: session create, lookup, delete',
    fn: async () => {
      const a = setup();
      const t = await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      const token = a.createSession(t.id);
      assert.match(token, /^[0-9a-f]{64}$/);
      assert.strictEqual(a.getTeacherForToken(token).id, t.id);
      a.deleteSession(token);
      assert.strictEqual(a.getTeacherForToken(token), null);
    },
  },
  {
    name: 'teacherAuth: expired session returns null',
    fn: async () => {
      const a = setup();
      const t = await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      getDb()
        .prepare('INSERT INTO teacher_sessions (token, teacher_id, created_at, expires_at) VALUES (?,?,?,?)')
        .run('old', t.id, Date.now() - 1000, Date.now() - 1);
      assert.strictEqual(a.getTeacherForToken('old'), null);
    },
  },
  {
    name: 'teacherAuth: requireTeacher reads cookie, 401 otherwise',
    fn: async () => {
      const a = setup();
      const t = await a.signup({ email: 'a@school.edu', name: 'A', password: 'password1' });
      const token = a.createSession(t.id);
      const req = { headers: { cookie: `x=1; emt_teacher=${token}; y=2` } };
      let nexted = false;
      a.requireTeacher(req, {}, () => (nexted = true));
      assert.ok(nexted);
      assert.strictEqual(req.teacher.id, t.id);
      let status, body;
      const res = { status: (s) => ((status = s), res), json: (b) => (body = b) };
      a.requireTeacher({ headers: {} }, res, () => assert.fail('no'));
      assert.strictEqual(status, 401);
      assert.deepStrictEqual(body, { error: 'Please sign in again.' });
    },
  },
  {
    name: 'teacherAuth: cookie flags',
    fn: async () => {
      const a = setup();
      const calls = [];
      const res = { cookie: (...c) => calls.push(['set', ...c]), clearCookie: (...c) => calls.push(['clear', ...c]) };
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      a.setCookie(res, 'tok');
      process.env.NODE_ENV = 'test';
      a.setCookie(res, 'tok');
      a.clearCookie(res);
      process.env.NODE_ENV = prev;
      assert.strictEqual(calls[0][1], 'emt_teacher');
      assert.strictEqual(calls[0][3].httpOnly, true);
      assert.strictEqual(calls[0][3].sameSite, 'lax');
      assert.strictEqual(calls[0][3].secure, true);
      assert.strictEqual(calls[0][3].maxAge, 30 * 24 * 60 * 60 * 1000);
      assert.strictEqual(calls[1][3].secure, false);
      assert.strictEqual(calls[2][0], 'clear');
    },
  },
];
