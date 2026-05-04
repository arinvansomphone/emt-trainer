const express = require('express');
const sm = require('../services/sessionManager');

function createSessionsRouter({ gradingService } = {}) {
  const router = express.Router();

  router.get('/:id', (req, res) => {
    const row = sm.getSession(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const state = row.state ? JSON.parse(row.state) : null;
    const messages = sm.getHistory(req.params.id).filter((m) => m.role !== 'system');
    res.json({
      sessionId: row.id,
      scenarioType: row.scenario_type,
      scenario: state,
      currentVitals: state?.currentVitals ?? state?.patientProfile?.vitals ?? null,
      bystanders: state?.bystanders ?? [],
      messages,
    });
  });

  router.post('/:id/grade', async (req, res) => {
    if (!gradingService) return res.status(501).json({ error: 'grading not enabled' });
    try {
      const result = await gradingService.gradeSession(req.params.id);
      res.json(result);
    } catch (err) {
      console.error('[grade] error:', err);
      res.status(500).json({ error: 'grading failed' });
    }
  });

  return router;
}

module.exports = { createSessionsRouter };
