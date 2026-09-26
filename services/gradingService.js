const sm = require('./sessionManager');

const DEFAULT_MODEL = 'gpt-4o';

const RUBRIC = {
  trauma: [
    'Scene size-up & safety',
    'BSI / PPE',
    'General impression & primary survey (ABC)',
    'C-spine consideration',
    'Rapid trauma assessment / DCAP-BTLS',
    'Vital signs obtained',
    'SAMPLE history',
    'Appropriate interventions (oxygen, bleeding control, splinting)',
    'Transport decision and reassessment',
  ],
  medical: [
    'Scene size-up & safety',
    'BSI / PPE',
    'General impression & primary survey (ABC)',
    'OPQRST history of present illness',
    'SAMPLE history',
    'Vital signs obtained',
    'Focused physical exam',
    'Appropriate interventions (oxygen, position, medications)',
    'Transport decision and reassessment',
  ],
};

const SYSTEM_PROMPT = `You are an EMT instructor grading a student's run on a training scenario. Be strict but fair, and ground every score in evidence from the transcript.

EVIDENCE RULES:
1. Every non-zero score MUST be supported by VERBATIM substrings from the transcript, returned as a "quotes" array on that rubric row. Each quote is { "speaker": "USER" | "ASSISTANT", "text": "..." } where text is a verbatim substring (8–80 words) of an actual message of that role. NO paraphrasing, NO summarizing, NO fabrication. The grading server will substring-match each quote against the actual transcript and overwrite the score to 0 if no quote verifies — so quotes that you invent or paraphrase will be discarded.
2. Distinguish stated/verbalized actions from performed assessments:
   • Stated/verbalized actions — BSI/PPE, scene size-up verbalization, transport decision, history-taking questions (OPQRST, SAMPLE) — quotes MUST be from USER messages. The EMT must have actually said it. Do NOT count moderator/patient/bystander mentions of equipment, gloves, scene safety, or actions as proof the EMT did them. If the EMT did not verbalize the action in their own message, the score is 0.
   • Performed assessments — palpation, auscultation, RTA/DCAP-BTLS, vital readings, exposure, c-spine stabilization, interventions (O2, bandage, splint, meds) — quotes MAY be USER (the request) or ASSISTANT (a [Moderator] line that directly responds to the request with findings). A moderator finding only counts when it was clearly elicited by an EMT request earlier in the transcript.
3. Score on completeness AND quality. Coverage gaps cap the score:
   • 0 — never attempted in any form, or no verifiable quotes
   • 1 — attempted but minimal: one component of a multi-component check, or a single shallow question
   • 2 — most expected components present, with gaps
   • 3 — all expected components covered competently (textbook)
   Asking only for SpO2 on the Vitals criterion is a 1, not a 3. Verbalizing only "scene safe" without mechanism/hazards is a 1, not a 3.
4. Per-criterion expected components for FULL CREDIT (3):
   • Rapid trauma assessment / DCAP-BTLS — sequential exam covering head, neck, chest, abdomen, pelvis, extremities (back when feasible).
   • OPQRST — all six: Onset, Provocation/Palliation, Quality, Radiation, Severity, Timing.
   • SAMPLE — all six: Signs/symptoms, Allergies, Medications, Past history, Last oral intake, Events.
   • Primary survey / ABC — Airway AND Breathing AND Circulation, performed early.
   • BSI / PPE — EMT-stated only. Effectively binary: 0 if the EMT never verbalizes gloves/BSI/PPE/donning, 3 if stated.
   • Scene size-up & safety — at minimum scene safety AND mechanism/nature; bonus for hazards, # patients, resources. One element only is a 1.
   • Vital signs obtained — full set is HR, BP, RR, SpO2, plus GCS or mental status when relevant. Single vital = 1. Three of the four core vitals = 2. Full set = 3.
   • Appropriate interventions — match interventions to the chief complaint. Correct + complete = 3; correct but incomplete = 1-2; wrong or absent = 0.
   • Transport decision and reassessment — both stated transport decision AND at least one reassessment. Either alone = 1-2.
   • C-spine consideration — manual stabilization or c-collar applied/verbalized when MOI warrants.

OUTPUT: STRICT JSON in this shape:
{
  "overall": { "score": 0-100, "summary": "1-2 sentence verdict" },
  "rubric": [
    {
      "criterion": "exact name from rubric",
      "quotes": [ { "speaker": "USER" | "ASSISTANT", "text": "verbatim substring 8-80 words" } ],
      "score": 0-3,
      "feedback": "1-2 sentence note"
    }
  ],
  "strengths": ["..."],
  "improvements": ["..."]
}
Use the criterion names from the rubric VERBATIM. Return ONLY JSON.`;

function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function verifyQuote(quote, history) {
  if (!quote || typeof quote.text !== 'string') return false;
  const needle = normalize(quote.text);
  if (needle.length < 8) return false;
  const role = quote.speaker === 'USER' ? 'user' : 'assistant';
  return history.some((m) => m.role === role && normalize(m.content).includes(needle));
}

function auditGrade(parsed, history) {
  if (!parsed || !Array.isArray(parsed.rubric)) return parsed;
  for (const row of parsed.rubric) {
    if (!row) continue;
    const quotes = Array.isArray(row.quotes) ? row.quotes : [];
    if (typeof row.score !== 'number' || row.score === 0) {
      row.quotes = [];
      continue;
    }
    const verified = quotes.filter((q) => verifyQuote(q, history));
    if (verified.length === 0) {
      const original = row.feedback || '';
      row.score = 0;
      row.feedback = `No verifiable transcript evidence found for this criterion. (Grader's original note: ${original || 'none'})`;
      row.quotes = [];
    } else {
      row.quotes = verified;
    }
  }
  return parsed;
}

function makeGradingService({ openai, model = DEFAULT_MODEL, tokenMeter = null }) {
  async function gradeSession(sessionId) {
    const row = sm.getSession(sessionId);
    if (!row) throw new Error('session not found');
    const state = row.state ? JSON.parse(row.state) : null;
    if (!state) throw new Error('no scenario on session');
    if (state.grade) return state.grade;
    const history = sm.getHistory(sessionId).filter((m) => m.role !== 'system');
    const rubric = RUBRIC[state.expectedAssessment] || RUBRIC.medical;

    const transcript = history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const userMsg = [
      `Scenario: ${state.type} / ${state.subtype}`,
      `Dispatch: ${state.dispatch}`,
      `Patient: ${state.patientProfile.name}, ${state.patientProfile.age}${state.patientProfile.sex[0]}, CC ${state.patientProfile.chiefComplaint}`,
      `Initial vitals: ${JSON.stringify(state.patientProfile.vitals)}`,
      `Final vitals: ${JSON.stringify(state.currentVitals)}`,
      '',
      `Rubric criteria to score (in order):\n- ${rubric.join('\n- ')}`,
      '',
      'Transcript:',
      transcript,
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    if (!parsed.overall || !parsed.rubric) throw new Error('grading result missing fields');

    const audited = auditGrade(parsed, history);

    state.grade = audited;
    sm.setScenario(sessionId, row.scenario_type, JSON.stringify(state));
    return audited;
  }
  return { gradeSession };
}

module.exports = { makeGradingService, RUBRIC, auditGrade, verifyQuote };
