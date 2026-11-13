// Pure aggregation for the admin stats page. No DB access. Unlike classStats.js,
// callers pass every scenario session, free practice included.

const { parseRun, addCriteria } = require('./classStats');
const { CATALOG } = require('./scenarioTypes');

// Older sessions stored generator output verbatim ("cardiac"); fold case variants onto the catalog name.
function canonicalScenario(type, subtype) {
  const t = String(type).trim().toLowerCase();
  const s = String(subtype).trim();
  const known = (CATALOG[t] || []).find((name) => name.toLowerCase() === s.toLowerCase());
  return { type: t, subtype: known || s };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DAYS_SHOWN = 30;

const avgInt = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 10) / 10;
}

// An IANA zone name, not a fixed offset: each run is bucketed by the zone's rules on its own
// day, so runs from before a daylight-saving change land on the right calendar day.
function resolveZone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// en-CA formats dates as YYYY-MM-DD.
const dayFormatter = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

function criteriaList(map) {
  return [...map.entries()]
    .map(([criterion, { sum, count }]) => ({ criterion, avg: Math.round((sum / count) * 100) / 100 }))
    .sort((a, b) => a.avg - b.avg);
}

function bucket() {
  return { runs: 0, graded: 0, scores: [], lastActivity: null };
}

function addTo(b, r) {
  b.runs += 1;
  if (r.graded) {
    b.graded += 1;
    b.scores.push(r.score);
  }
  if (b.lastActivity == null || r.at > b.lastActivity) b.lastActivity = r.at;
}

function computeAdminStats({ runs = [], classes = [], now = Date.now(), timeZone = 'UTC' } = {}) {
  const fmt = dayFormatter(resolveZone(timeZone));
  const dayKey = (ms) => fmt.format(new Date(ms));
  const parsed = runs.map((row) => {
    const p = parseRun(row);
    let assessment = null;
    try {
      const st = JSON.parse(row.state);
      assessment = st && (st.expectedAssessment || st.type);
    } catch { /* corrupt state: counted as a run, nothing else */ }
    return { ...p, assessment, at: row.created_at, classId: row.class_id, studentId: row.student_id, msgs: row.user_messages || 0 };
  });

  const within = (r, ms) => r.at > now - ms;
  const graded = parsed.filter((r) => r.graded);
  const scores = graded.map((r) => r.score);
  const old = parsed.filter((r) => r.at <= now - DAY);
  const abandoned = old.filter((r) => !r.graded && r.msgs < 3);

  const daily = [];
  const byDay = new Map();
  // Calendar arithmetic on the date key itself, so the 30 labels never skip or repeat a day.
  const today = new Date(`${dayKey(now)}T00:00:00Z`).getTime();
  for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
    const entry = { date: new Date(today - i * DAY).toISOString().slice(0, 10), started: 0, graded: 0 };
    daily.push(entry);
    byDay.set(entry.date, entry);
  }
  for (const r of parsed) {
    const entry = byDay.get(dayKey(r.at));
    if (!entry) continue;
    entry.started += 1;
    if (r.graded) entry.graded += 1;
  }

  const classBuckets = new Map(classes.map((c) => [c.id, bucket()]));
  const free = bucket();
  for (const r of parsed) {
    if (!r.classId) addTo(free, r);
    else {
      if (!classBuckets.has(r.classId)) classBuckets.set(r.classId, bucket());
      addTo(classBuckets.get(r.classId), r);
    }
  }
  const summary = (b) => ({ runs: b.runs, graded: b.graded, avgScore: avgInt(b.scores), lastActivity: b.lastActivity });
  const perClass = [
    ...classes.map((c) => ({ classId: c.id, name: c.name, teacher: c.teacher_name, code: c.code, students: c.students, ...summary(classBuckets.get(c.id)) })),
    { classId: null, name: 'Free practice', teacher: null, code: null, students: null, ...summary(free) },
  ].sort((a, b) => b.runs - a.runs || String(a.name).localeCompare(String(b.name)));

  const scenarios = new Map();
  for (const r of parsed) {
    if (!r.type || !r.subtype) continue;
    const { type, subtype } = canonicalScenario(r.type, r.subtype);
    const key = `${type}\u0000${subtype.toLowerCase()}`;
    if (!scenarios.has(key)) scenarios.set(key, { type, subtype, b: bucket() });
    addTo(scenarios.get(key).b, r);
  }
  const perScenario = [...scenarios.values()]
    .map(({ type, subtype, b }) => ({ type, subtype, runs: b.runs, completionRate: pct(b.graded, b.runs), avgScore: avgInt(b.scores) }))
    .sort((a, b) => b.runs - a.runs || `${a.type}${a.subtype}`.localeCompare(`${b.type}${b.subtype}`));

  const crit = { trauma: new Map(), medical: new Map() };
  for (const r of graded) if (crit[r.assessment]) addCriteria(crit[r.assessment], r.rubric);

  const bands = { lt50: 0, from50: 0, from70: 0, from85: 0 };
  for (const s of scores) {
    if (s >= 85) bands.from85 += 1;
    else if (s >= 70) bands.from70 += 1;
    else if (s >= 50) bands.from50 += 1;
    else bands.lt50 += 1;
  }

  return {
    totals: {
      all: parsed.length,
      last24h: parsed.filter((r) => within(r, DAY)).length,
      last7d: parsed.filter((r) => within(r, 7 * DAY)).length,
      last30d: parsed.filter((r) => within(r, 30 * DAY)).length,
      class: parsed.filter((r) => r.classId).length,
      practice: parsed.filter((r) => !r.classId).length,
      graded: graded.length,
      completionRate: pct(graded.length, parsed.length),
    },
    scores: {
      avgAll: avgInt(scores),
      avg7d: avgInt(graded.filter((r) => within(r, 7 * DAY)).map((r) => r.score)),
      bands,
    },
    daily,
    activeStudents7d: new Set(parsed.filter((r) => r.studentId && within(r, 7 * DAY)).map((r) => r.studentId)).size,
    perClass,
    perScenario,
    criteria: { trauma: criteriaList(crit.trauma), medical: criteriaList(crit.medical) },
    engagement: {
      medianUserMessages: median(parsed.map((r) => r.msgs)),
      abandonedRate: pct(abandoned.length, old.length),
    },
  };
}

module.exports = { computeAdminStats, resolveZone };
