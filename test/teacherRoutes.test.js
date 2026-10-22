const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const { makeTeacherAuth } = require('../services/teacherAuth');

function setup() { resetForTests(); getDb(':memory:'); }
const creds = { email: 'a@x.edu', name: 'A', password: 'password123' };

exports.tests = [
  {
    name: 'signup sets an httpOnly emt_teacher cookie and /me returns the teacher',
    fn: async () => {
      setup();
      const agent = request.agent(createApp());
      const res = await agent.post('/api/teacher/signup').send(creds);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(Object.keys(res.body.teacher).sort(), ['email', 'id', 'name']);
      const cookie = [].concat(res.headers['set-cookie']).find((c) => c.startsWith('emt_teacher='));
      assert.ok(cookie, 'cookie set');
      assert.ok(/HttpOnly/i.test(cookie));
      assert.ok(/SameSite=Lax/i.test(cookie));
      const me = await agent.get('/api/teacher/me');
      assert.strictEqual(me.status, 200);
      assert.strictEqual(me.body.teacher.email, 'a@x.edu');
      assert.strictEqual(me.body.teacher.password_hash, undefined);
    },
  },
  {
    name: 'logout makes /me return 401',
    fn: async () => {
      setup();
      const agent = request.agent(createApp());
      await agent.post('/api/teacher/signup').send(creds);
      const out = await agent.post('/api/teacher/logout');
      assert.strictEqual(out.status, 200);
      assert.deepStrictEqual(out.body, { ok: true });
      assert.strictEqual((await agent.get('/api/teacher/me')).status, 401);
    },
  },
  {
    name: 'login works and bad password gives 401',
    fn: async () => {
      setup();
      const app = createApp();
      await request(app).post('/api/teacher/signup').send(creds);
      const ok = await request(app).post('/api/teacher/login').send({ email: creds.email, password: creds.password });
      assert.strictEqual(ok.status, 200);
      const bad = await request(app).post('/api/teacher/login').send({ email: creds.email, password: 'nope' });
      assert.strictEqual(bad.status, 401);
      assert.strictEqual(bad.body.error, 'Email or password is incorrect.');
    },
  },
  {
    name: 'POST /google returns 501 when GOOGLE_CLIENT_ID is unset',
    fn: async () => {
      setup();
      const prev = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;
      try {
        const res = await request(createApp()).post('/api/teacher/google').send({ credential: 'x' });
        assert.strictEqual(res.status, 501);
        assert.deepStrictEqual(res.body, { error: 'Google sign-in is not configured.' });
      } finally {
        if (prev === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = prev;
      }
    },
  },
  {
    name: 'POST /google with a fake verifier signs in',
    fn: async () => {
      setup();
      const prev = process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_ID = 'test';
      try {
        const teacherAuth = makeTeacherAuth({
          googleVerifier: async () => ({ sub: 'g1', email: 't@x.edu', name: 'T', email_verified: true }),
        });
        const agent = request.agent(createApp({ teacherAuth }));
        const res = await agent.post('/api/teacher/google').send({ credential: 'tok' });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(Object.keys(res.body.teacher).sort(), ['email', 'id', 'name']);
        assert.strictEqual(res.body.teacher.email, 't@x.edu');
        assert.strictEqual((await agent.get('/api/teacher/me')).status, 200);
      } finally {
        if (prev === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = prev;
      }
    },
  },
  {
    name: 'eleventh login attempt in a minute gets 429',
    fn: async () => {
      setup();
      const app = createApp();
      for (let i = 0; i < 10; i++) {
        const r = await request(app).post('/api/teacher/login').send({ email: 'n@x.edu', password: 'x' });
        assert.strictEqual(r.status, 401);
      }
      const res = await request(app).post('/api/teacher/login').send({ email: 'n@x.edu', password: 'x' });
      assert.strictEqual(res.status, 429);
    },
  },
  {
    name: 'responses allow Google popups',
    fn: async () => {
      setup();
      const res = await request(createApp()).get('/api/teacher/me');
      assert.strictEqual(res.headers['cross-origin-opener-policy'], 'same-origin-allow-popups');
      assert.ok(res.headers['content-security-policy'].includes('accounts.google.com'));
    },
  },
];
