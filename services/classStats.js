// Pure aggregation for the teacher dashboard. No DB access: callers pass
// class-run rows only, so free-practice sessions can never appear here.

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const avgInt = (xs) => (xs.length ? Math.round(mean(xs)) : null);

function parseState(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

// Normalize a run row into { type, subtype, graded, score, rubric }.
function parseRun(run) {
  const state = parseState(run && run.state);
  const out = {
    type: state && typeof state.type === 'string' ? state.type : null,
    subtype: state && typeof state.subtype === 'string' ? state.subtype : null,
    graded: false,
    score: null,
    rubric: [],
  };
  const grade = state && state.grade;
  if (grade && typeof grade === 'object' && Array.isArray(grade.rubric)) {
    const rows = grade.rubric.filter(
      (r) => r && typeof r === 'object' && typeof r.criterion === 'string' && r.criterion && isNum(r.score)
    );
    if (rows.length > 0) {
      out.graded = true;
      out.rubric = rows;
      // Audited rubric percent; the grader's overall.score is never trusted (it is not adjusted by the audit).
      out.score = Math.round((rows.reduce((a, r) => a + r.score, 0) / (rows.length * 3)) * 100);
    }
  }
  return out;
}

function summarizeRun(run, assignment = null) {
  const p = parseRun(run);
  const createdAt = run ? run.created_at : null;
  const due = assignment ? assignment.due_at : null;
  return {
    sessionId: run ? run.session_id : null,
    type: p.type,
    subtype: p.subtype,
    createdAt,
    assignmentId: run && run.assignment_id != null ? run.assignment_id : null,
    status: p.graded ? 'graded' : 'in_progress',
    score: p.graded ? p.score : null,
    late: p.graded && isNum(due) && isNum(createdAt) && createdAt > due,
  };
}

// Accumulates per-criterion sums, preserving first-seen (rubric) order.
function addCriteria(map, rubric) {
  for (const r of rubric) {
    const e = map.get(r.criterion) || { sum: 0, count: 0 };
    e.sum += r.score;
    e.count += 1;
    map.set(r.criterion, e);
  }
}

function computeClassOverview({ runs = [], students = [], assignments = [] } = {}) {
  const parsed = (runs || []).filter(Boolean).map((run) => ({ run, p: parseRun(run) }));
  const graded = parsed.filter((x) => x.p.graded);

  const allCrit = new Map();
  for (const x of graded) addCriteria(allCrit, x.p.rubric);
  const criteria = [...allCrit.entries()]
    .map(([criterion, e]) => ({ criterion, avg: Math.round((e.sum / e.count) * 10) / 10, count: e.count }))
    .sort((a, b) => a.avg - b.avg || (a.criterion < b.criterion ? -1 : a.criterion > b.criterion ? 1 : 0));

  const scoresOf = (type) => graded.filter((x) => x.p.type === type).map((x) => x.p.score);
  const metrics = {
    gradedRuns: graded.length,
    studentsJoined: students.length,
    classAvg: avgInt(graded.map((x) => x.p.score)),
    traumaAvg: avgInt(scoresOf('trauma')),
    medicalAvg: avgInt(scoresOf('medical')),
  };

  // Latest graded attempt per (student, assignment); later created_at wins, ties go to later input.
  const latest = new Map(); // `${assignmentId}|${studentId}` -> {run,p}
  for (const x of graded) {
    if (x.run.assignment_id == null) continue;
    const key = `${x.run.assignment_id}|${x.run.student_id}`;
    const cur = latest.get(key);
    if (!cur || !(x.run.created_at < cur.run.created_at)) latest.set(key, x);
  }

  const assignmentsOut = (assignments || []).map((a) => {
    const done = [];
    const missing = [];
    for (const s of students) {
      const hit = latest.get(`${a.id}|${s.id}`);
      if (hit) done.push(hit);
      else missing.push(s.id);
    }
    const hasDue = isNum(a.due_at);
    // Late = graded on this assignment but never on time (any on-time graded run clears the student).
    const lateStudents = hasDue
      ? students.filter((s) => {
          const mine = graded.filter((x) => x.run.assignment_id === a.id && x.run.student_id === s.id);
          return mine.length > 0 && !mine.some((x) => x.run.created_at <= a.due_at);
        }).length
      : 0;
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      subtype: a.subtype,
      dueAt: hasDue ? a.due_at : null,
      done: done.length,
      late: lateStudents,
      avg: avgInt(done.map((x) => x.p.score)),
      missing,
    };
  });

  const studentsOut = students.map((s) => {
    const mine = parsed.filter((x) => x.run.student_id === s.id);
    const myGraded = mine.filter((x) => x.p.graded);
    const crit = new Map();
    for (const x of myGraded) addCriteria(crit, x.p.rubric);
    let weakest = null;
    let best = Infinity;
    for (const [name, e] of crit) {
      const a = e.sum / e.count;
      if (a < best) {
        best = a;
        weakest = name;
      }
    }
    return {
      id: s.id,
      name: s.name,
      email: s.email_normalized,
      runs: mine.length,
      gradedRuns: myGraded.length,
      avg: avgInt(myGraded.map((x) => x.p.score)),
      weakest,
      missingAssignmentIds: assignmentsOut.filter((a) => a.missing.includes(s.id)).map((a) => a.id),
    };
  });

  return { metrics, criteria, assignments: assignmentsOut, students: studentsOut };
}

module.exports = { computeClassOverview, summarizeRun };
