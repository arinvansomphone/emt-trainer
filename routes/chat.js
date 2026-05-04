const express = require('express');

function createChatRouter(chatService) {
  const router = express.Router();
  router.post('/', async (req, res) => {
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
