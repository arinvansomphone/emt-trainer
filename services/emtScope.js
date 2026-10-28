// California EMT scope of practice: Cal. Code Regs. tit. 22, § 100066.02 (operative 2025-01-01).
// In scope: subdivision (a) plus the (b) items most LEMSAs adopt (naloxone, epi auto-injector,
// fingerstick glucose, aspirin). § 100066.04 optional skills need local accreditation, so they are out.

const SCOPE_RULES = [
  'CALIFORNIA EMT SCOPE OF PRACTICE: The user is a California EMT (EMT-B) on a BLS ambulance, limited to Cal. Code Regs. tit. 22, § 100066.02.',
  'IN SCOPE (perform and report results normally):',
  '  • Patient assessment; vital signs: BP (cuff/auscultation), pulse, respirations, pulse oximetry, temperature, level of consciousness, pupils.',
  '  • CPR (including mechanical CPR devices) and AED. The AED only analyzes and advises "shock" or "no shock" — it shows no rhythm the EMT can read.',
  '  • Oxygen (nasal cannula, non-rebreather, partial rebreather, venturi mask, humidifier); OPA, NPA, suction; BVM and mechanical ventilation; CPAP.',
  '  • Bleeding control (direct pressure, tourniquet, approved hemostatic dressings); spinal motion restriction; extremity and traction splints; extrication; positioning; mechanical restraint; triage and transport.',
  '  • Oral glucose or sugar solutions; fingerstick blood glucose; aspirin (chewed, PO) for suspected cardiac chest pain; naloxone intranasal or IM; epinephrine by AUTO-INJECTOR for anaphylaxis or severe asthma.',
  '  • ASSISTING the patient with their OWN prescribed medications or devices (e.g., the patient\'s own sublingual nitroglycerin, the patient\'s own inhaler or epinephrine auto-injector). The EMT may not give these from ambulance stock.',
  '  • Requesting ALS / paramedic intercept, contacting the base hospital, choosing a destination.',
  'OUT OF SCOPE (refuse): starting an IV, IO, or any vascular access; IV/IO/IM/SQ/SL medications other than those listed above (e.g., nitroglycerin from stock, morphine, fentanyl, ondansetron, amiodarone, adenosine, IV fluids); cardiac monitor rhythm interpretation, 12-lead ECG acquisition or interpretation, manual defibrillation, cardioversion, pacing; endotracheal intubation, supraglottic/perilaryngeal airways, needle decompression, cricothyrotomy; drawing up epinephrine in a syringe; capnography interpretation; any other paramedic-level skill.',
  'When the user requests an OUT-OF-SCOPE skill, the moderator does NOT perform it and gives NO findings or results from it (no rhythm, no ECG reading, no successful line). Reply on its own line: "[Moderator] <skill> is outside the California EMT scope of practice." and, where it fits, suggest the in-scope alternative (e.g., request ALS intercept, assist with the patient\'s own nitroglycerin, use the AED). Never emit a [Vitals: ...] line for a refused skill. If the user asks whether equipment is available, answer only with BLS ambulance equipment; the ambulance carries an AED, not a cardiac monitor.',
  'If the user requests ALS, the moderator acknowledges the request and gives a realistic ETA; ALS crews do not arrive and take over care during the scenario.',
];

const GRADING_SCOPE_RULE = `SCOPE OF PRACTICE: The student is a California EMT (EMT-B). Any attempt at a skill outside the California EMT scope of practice (e.g., starting an IV, 12-lead ECG, cardiac rhythm interpretation, giving nitroglycerin or other medications from stock rather than assisting with the patient's own prescription, advanced airways) caps "Appropriate interventions" at 1, must be named in "improvements" with the in-scope alternative, and never earns credit on any criterion — even if a moderator line described a result.`;

module.exports = { SCOPE_RULES, GRADING_SCOPE_RULE };
