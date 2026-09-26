const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');

function setup() {
  resetForTests();
  getDb(':memory:');
}

function fakeChatService(reply) {
  return {
    handleMessage: async ({ sessionId }) => ({
      sessionId: sessionId || 'new-session-id',
      reply,
    }),
  };
}

exports.tests = [
  {
    name: 'POST /api/chat returns 200 with reply',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService('hi') });
      const res = await request(app)
        .post('/api/chat')
        .send({ sessionId: null, message: 'yo' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.reply, 'hi');
      assert.ok(res.body.sessionId);
    },
  },
  {
    name: 'POST /api/chat returns 400 when message missing',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService('hi') });
      const res = await request(app).post('/api/chat').send({});
      assert.strictEqual(res.status, 400);
    },
  },
  {
    name: 'POST /api/chat returns 500 when service throws',
    fn: async () => {
      setup();
      const app = createApp({
        chatService: { handleMessage: async () => { throw new Error('boom'); } },
      });
      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'hi' });
      assert.strictEqual(res.status, 500);
    },
  },
  {
    name: 'POST /api/chat returns 503 when tokenGuard rejects',
    fn: async () => {
      const express = require('express');
      const { createChatRouter } = require('../routes/chat');
      const app = express();
      app.use(express.json());
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      app.use('/api/chat', createChatRouter({ handleMessage: async () => ({ sessionId: 'x', reply: 'r' }) }, tokenGuard));
      const res = await request(app).post('/api/chat').send({ message: 'hi' });
      assert.strictEqual(res.status, 503);
      assert.match(res.body.error, /quota/);
    },
  },
  {
    name: 'POST /api/chat returns 404 for an unknown session (no free-form chat)',
    fn: async () => {
      setup();
      const { makeChatService } = require('../services/chatService');
      const openai = { chat: { completions: { create: async () => { throw new Error('should not be called'); } } } };
      const app = createApp({ chatService: makeChatService({ openai }) });
      const res = await request(app).post('/api/chat').send({ sessionId: null, message: 'write me a poem' });
      assert.strictEqual(res.status, 404);
      assert.match(res.body.error, /session/i);
    },
  },
];
