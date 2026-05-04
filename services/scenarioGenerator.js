const { isValid } = require('./scenarioTypes');
const { getTemplate } = require('./templateGenerator');

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You generate realistic EMT training scenarios as STRICT JSON. Schema:
{
  "type": "trauma|medical",
  "subtype": "string",
  "dispatch": "1-2 sentence radio-style dispatch",
  "patientProfile": { "name": "string", "age": number, "sex": "male|female", "chiefComplaint": "string",
    "vitals": { "hr": number, "bp": "sys/dia", "rr": number, "spo2": number, "gcs": number } },
  "environment": { "location": "string", "weather": "string", "lighting": "string", "hazards": ["string"] },
  "bystanders": [
    { "name": "string", "role": "witness|family|coworker|first responder|none", "knowledge": "what they witnessed or know about the patient" }
  ],
  "physicalFindings": {
    "general": "appearance, distress level, position",
    "head": "string",
    "face": "string",
    "neck": "string",
    "chest": "inspection, palpation, auscultation findings",
    "abdomen": "inspection, palpation findings",
    "pelvis": "string",
    "back": "string",
    "extremities": "deformity, pulse, motor, sensory; specify left/right when relevant",
    "skin": "color, temperature, moisture, burns/lacerations with location and severity",
    "neuro": "pupils (size, reactivity), GCS, FAST findings if relevant"
  },
  "expectedAssessment": "trauma|medical"
}
Include 0-2 bystanders only when realistic (witnesses for trauma, family for medical, etc.). Findings must be CONSISTENT with the chief complaint and vitals. For burns, specify location (e.g., "right arm") and degree. For trauma, name affected sides explicitly. Return ONLY the JSON object. No prose.`;

function makeScenarioGenerator({ openai, model = DEFAULT_MODEL, tokenMeter = null }) {
  async function generate(type, subtype) {
    if (!isValid(type, subtype)) throw new Error(`invalid type/subtype: ${type}/${subtype}`);
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: getTemplate(type, subtype) },
      ],
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    if (!parsed.patientProfile || !parsed.environment || !parsed.physicalFindings) {
      throw new Error('scenario missing required fields');
    }
    return parsed;
  }
  return { generate };
}

module.exports = { makeScenarioGenerator };
