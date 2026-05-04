const express = require('express');

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
      console.error('[chat] error:', err);
      res.status(500).json({ error: 'internal error' });
    }
  });
  return router;
}

module.exports = { createChatRouter };
