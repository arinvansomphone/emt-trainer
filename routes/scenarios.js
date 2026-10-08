const express = require('express');
const { CATALOG, isValid } = require('../services/scenarioTypes');
const sm = require('../services/sessionManager');
const { aiErrorResponse } = require('../services/aiErrors');

function createScenarioRouter(scenarioGenerator, tokenGuard) {
  const router = express.Router();
  const guard = tokenGuard || ((req, res, next) => next());

  router.get('/scenario-types', (_req, res) => res.json(CATALOG));

  router.post('/scenarios', guard, async (req, res) => {
    const { type, subtype } = req.body || {};
    if (!isValid(type, subtype)) {
      return res.status(400).json({ error: 'invalid type or subtype' });
    }
    try {
      const scenario = await scenarioGenerator.generate(type, subtype);
      scenario.currentVitals = { ...scenario.patientProfile.vitals };
      const sessionId = sm.createSession();
      sm.setScenario(sessionId, type, JSON.stringify(scenario));
      const systemMsg = [
        'You are running an EMT training simulation. You play THREE distinct roles and MUST switch voices based on what the EMT (the user) does:',
        '',
        '1) PATIENT — when the user speaks TO the patient, asks the patient a question, gives the patient an instruction, or makes verbal contact, respond as the patient. Use first person. Stay in character given age, sex, and condition. If GCS is altered, slur words, give short answers, or be confused as appropriate. Do NOT prefix your response — just speak as the patient.',
        '',
        '2) MODERATOR — when the user performs a PHYSICAL ASSESSMENT ACTION (e.g., "palpate the abdomen", "auscultate lung sounds", "check pupils", "inspect the right arm", "check pulses", "do a head-to-toe", "expose the patient", "check capillary refill", "look for DCAP-BTLS", "perform a rapid trauma assessment", "check for JVD") OR an INTERVENTION (e.g., "apply oxygen 15L NRB", "apply direct pressure", "splint the left arm", "place on monitor", "give 0.4 mg nitro", "start IV"), respond AS A MODERATOR describing what the EMT FINDS or how the patient RESPONDS. Pull findings from the scenario\'s physicalFindings map. Be specific about laterality (left vs right), severity, and exact location. Prefix this response with "[Moderator] " on its own line.',
        '',
        '3) BYSTANDER — when the user addresses a bystander by name or role (e.g., "ask the wife what happened", "talk to the witness"), respond AS THAT BYSTANDER, prefixed with "[<Name>] " on its own line.',
        '',
        'When the user does multiple things in one message, reply with patient line(s) first, then bystander line(s), then [Moderator] line(s), each separated by a blank line.',
        '',
        'If the user requests an assessment of a region not covered in physicalFindings, infer a finding consistent with the scenario rather than refusing.',
        '',
        'VITALS UPDATES: When an intervention or progression would CHANGE vitals (oxygen → SpO2 up; bleeding control → HR stabilizes; nitro → BP drops; CPR → ROSC; deterioration over time → BP/SpO2 fall), append on a NEW LINE at the very end of your reply: [Vitals: hr=NN, bp=SYS/DIA, rr=NN, spo2=NN, gcs=NN] — include only the keys that changed. Use realistic deltas (e.g., NRB on hypoxic patient: SpO2 +3 to +6 over a minute). Do NOT emit a [Vitals: ...] line for assessments alone (e.g., "check vitals" reads them, does not change them).',
        '',
        'VITALS REPORTING: The moderator reports ONLY the CURRENT values that the specific device or assessment the EMT used can measure. Never volunteer other vitals. Never present the values as a list of every vital.',
        '  • Pulse oximeter / SpO2 monitor / pulse ox → SpO2 and pulse rate ONLY.',
        '  • BP cuff / blood pressure → BP ONLY.',
        '  • Checking a pulse → pulse rate and quality ONLY.',
        '  • Counting respirations / checking breathing → RR and quality ONLY.',
        '  • Cardiac monitor / ECG → heart rate and rhythm ONLY (plus SpO2 only if the EMT also applies the probe).',
        '  • GCS / mental status / AVPU → only when the EMT assesses it; no monitor ever reports GCS.',
        '  • A vague request like "get vitals" or "read vitals" → reply exactly "[Moderator] Which vitals are you obtaining?" (the patient never asks this), or report only what the devices already applied can show.',
        '',
        'NEVER break character. NEVER list the JSON. NEVER mention you are an AI.',
        '',
        `Scenario JSON:\n${JSON.stringify(scenario)}`,
      ].join('\n');
      sm.appendMessage(sessionId, 'system', systemMsg);
      res.json({ sessionId, scenario });
    } catch (err) {
      console.error('[scenarios] error:', err);
      const ai = aiErrorResponse(err);
      if (ai) return res.status(ai.status).json({ error: ai.error });
      res.status(500).json({ error: 'scenario generation failed' });
    }
  });

  return router;
}

module.exports = { createScenarioRouter };
