const HINTS = {
  MVC: 'high-speed two-vehicle collision; consider mechanism of injury, c-spine, internal bleeding',
  Fall: 'fall from height; spine and head injury risk',
  Assault: 'blunt or penetrating; document scene safety',
  'Sport Injury': 'orthopedic focus; possible concussion',
  Stabbing: 'penetrating trauma; bleeding control critical',
  GSW: 'gunshot wound; scene safety, primary survey, hemorrhage control',
  Burn: 'thermal/chemical burn; rule of nines, airway concern',
  Cardiac: 'chest pain or arrhythmia; OPQRST',
  Respiratory: 'dyspnea, COPD/asthma/anaphylaxis differentials',
  Neurological: 'stroke or seizure; FAST exam, GCS',
  Metabolic: 'diabetic, electrolyte, overdose',
  Obstetric: 'pregnant patient or imminent delivery',
  Pediatric: 'age-appropriate vitals; consider non-accidental trauma',
  Overdose: 'suspected drug overdose or acute intoxication. Randomly pick ONE of: opioid (pinpoint pupils, RR<10, depressed LOC, consider naloxone), stimulant such as cocaine/meth/MDMA (tachycardia, hypertension, hyperthermia, agitation, dilated pupils, possible chest pain or seizure), alcohol (slurred speech, ataxia, vomiting risk, possible head trauma from fall), benzodiazepine (sedation, slurred speech, normal pupils), polysubstance (mixed picture, often opioid+benzo or stim+alcohol), hallucinogen (psychosis, agitation, altered perception). Make scene safety and bystander credibility important. Patient may be uncooperative, drowsy, or combative depending on substance. Include drug paraphernalia or witness statements in environment/bystanders when realistic.',
};

function getTemplate(type, subtype) {
  const hint = HINTS[subtype] || '';
  return `Scenario type: ${type}. Subtype: ${subtype}. Clinical hints: ${hint}.`;
}

module.exports = { getTemplate };
