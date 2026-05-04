// Strip vitals marker and split a mixed-role assistant reply into segments
// shaped like { kind: 'patient'|'moderator'|'bystander', name?: string, text: string }.
// Patient text is anything before the first marker (or between markers when unprefixed).

const VITALS_RE = /\n?\[Vitals:[^\]]+\]/i;
const MARKER_RE = /\[(Moderator|[^\]\n]+)\]\s*/g;

export function stripVitals(text) {
  return text.replace(VITALS_RE, '').trimEnd();
}

export function splitRoles(text) {
  const cleaned = stripVitals(text || '');
  if (!cleaned) return [];
  const segments = [];
  let lastIdx = 0;
  let lastKind = 'patient';
  let lastName = undefined;
  for (const m of cleaned.matchAll(MARKER_RE)) {
    const before = cleaned.slice(lastIdx, m.index).trim();
    if (before) segments.push({ kind: lastKind, name: lastName, text: before });
    const label = m[1].trim();
    if (label.toLowerCase() === 'moderator') {
      lastKind = 'moderator';
      lastName = undefined;
    } else {
      lastKind = 'bystander';
      lastName = label;
    }
    lastIdx = m.index + m[0].length;
  }
  const tail = cleaned.slice(lastIdx).trim();
  if (tail) segments.push({ kind: lastKind, name: lastName, text: tail });
  return segments;
}
