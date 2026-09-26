const express = require('express');
const { aiErrorResponse } = require('../services/aiErrors');

function createChatRouter(chatService, tokenGuard) {
  const router = express.Router();
  const guard = tokenGuard || ((req, res, next) => next());
  router.post('/', guard, async (req, res) => {
    const { sessionId = null, message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    try {
      const result = await chatService.handleMessage({ sessionId, message });
      res.json(result);
    } catch (err) {
      if (err.expose) return res.status(err.status).json({ error: err.message });
      const ai = aiErrorResponse(err);
      if (ai) return res.status(ai.status).json({ error: ai.error });
      console.error('[chat] error:', err);
      res.status(500).json({ error: 'internal error' });
    }
  });
  return router;
}

module.exports = { createChatRouter };
