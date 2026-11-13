const assert = require('assert');
const { computeAdminStats } = require('../services/adminStats');

const H = 3_600_000;
const D = 24 * H;
const now = Date.UTC(2026, 9, 30, 12);

function run({ at, type = 'medical', subtype = 'Cardiac', classId = null, studentId = null, msgs = 5, rubric = null, overall = 10, state }) {
  const s = state !== undefined
    ? state
    : JSON.stringify({ type, subtype, expectedAssessment: type, ...(rubric ? { grade: { overall: { score: overall }, rubric } } : {}) });
  return { created_at: at, state: s, class_id: classId, student_id: studentId, user_messages: msgs };
}
const rows = (...scores) => scores.map((score, i) => ({ criterion: `C${i}`, score }));
const stats = (runs, extra = {}) => computeAdminStats({ runs, classes: [], now, tzOffsetMin: 0, ...extra });

function walkNoNaN(v, path = '') {
  if (typeof v === 'number') assert.ok(!Number.isNaN(v), `NaN at ${path}`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkNoNaN(x, `${path}.${k}`);
}

exports.tests = [
  {
    name: 'windows count boundaries',
    fn: () => {
      const s = stats([run({ at: now - H }), run({ at: now - 25 * H }), run({ at: now - 8 * D }), run({ at: now - 31 * D })]);
      assert.deepStrictEqual(
        [s.totals.last24h, s.totals.last7d, s.totals.last30d, s.totals.all],
        [1, 2, 3, 4],
      );
    },
  },
  {
    name: 'daily buckets honor tzOffset',
    fn: () => {
      const at = Date.UTC(2026, 9, 30, 3);
      const pdt = stats([run({ at })], { tzOffsetMin: 420 });
      assert.strictEqual(pdt.daily.find((d) => d.date === '2026-10-29').started, 1);
      const utc = stats([run({ at })]);
      assert.strictEqual(utc.daily.length, 30);
      assert.strictEqual(utc.daily[29].date, '2026-10-30');
      assert.strictEqual(utc.daily[0].date, '2026-10-01');
      assert.strictEqual(utc.daily[29].started, 1);
    },
  },
  {
    name: 'scores use audited percent, ignore overall.score',
    fn: () => {
      const s = stats([run({ at: now - H, rubric: rows(3, 3, 0), overall: 99 })]);
      assert.strictEqual(s.scores.avgAll, 67);
      assert.strictEqual(s.scores.avg7d, 67);
      assert.deepStrictEqual(s.scores.bands, { lt50: 0, from50: 1, from70: 0, from85: 0 });
      assert.strictEqual(s.daily[29].graded, 1);
    },
  },
  {
    name: 'completion and abandoned',
    fn: () => {
      const s = stats([
        run({ at: now - 2 * D, rubric: rows(3) }),
        run({ at: now - 2 * D, msgs: 1 }),
        run({ at: now - 2 * D, msgs: 1 }),
        run({ at: now - 2 * D, msgs: 4 }),
        run({ at: now - H, msgs: 0 }), // too recent to call abandoned
      ]);
      assert.strictEqual(s.totals.graded, 1);
      assert.strictEqual(s.totals.completionRate, 20);
      assert.strictEqual(s.engagement.abandonedRate, 50);
      assert.strictEqual(s.engagement.medianUserMessages, 1);
    },
  },
  {
    name: 'perClass includes zero-run classes and a Free practice row',
    fn: () => {
      const classes = [
        { id: 'c1', name: 'Period 1', code: 'ABC-DEF', teacher_name: 'T1', students: 2 },
        { id: 'c2', name: 'Empty', code: 'GHI-JKL', teacher_name: 'T2', students: 0 },
      ];
      const s = stats([
        run({ at: now - 2 * H, classId: 'c1', studentId: 's1', rubric: rows(3, 3) }),
        run({ at: now - H, classId: 'c1', studentId: 's2' }),
        run({ at: now - 3 * H }),
      ], { classes });
      const [p1, free, empty] = s.perClass;
      assert.deepStrictEqual(p1, { classId: 'c1', name: 'Period 1', teacher: 'T1', code: 'ABC-DEF', students: 2, runs: 2, graded: 1, avgScore: 100, lastActivity: now - H });
      assert.strictEqual(free.classId, null);
      assert.strictEqual(free.name, 'Free practice');
      assert.strictEqual(free.runs, 1);
      assert.strictEqual(free.avgScore, null);
      assert.strictEqual(empty.runs, 0);
      assert.strictEqual(empty.lastActivity, null);
      assert.strictEqual(s.totals.class, 2);
      assert.strictEqual(s.totals.practice, 1);
      assert.strictEqual(s.activeStudents7d, 2);
    },
  },
  {
    name: 'perScenario groups by type and subtype',
    fn: () => {
      const s = stats([
        run({ at: now - H, type: 'trauma', subtype: 'MVC', rubric: rows(3, 0) }),
        run({ at: now - H, type: 'trauma', subtype: 'MVC' }),
        run({ at: now - H, type: 'medical', subtype: 'Cardiac', rubric: rows(3) }),
      ]);
      assert.deepStrictEqual(s.perScenario, [
        { type: 'trauma', subtype: 'MVC', runs: 2, completionRate: 50, avgScore: 50 },
        { type: 'medical', subtype: 'Cardiac', runs: 1, completionRate: 100, avgScore: 100 },
      ]);
    },
  },
  {
    name: 'criteria lowest first, split trauma/medical',
    fn: () => {
      const tr = [{ criterion: 'BSI / PPE', score: 3 }, { criterion: 'C-spine consideration', score: 0 }];
      const tr2 = [{ criterion: 'BSI / PPE', score: 2 }, { criterion: 'C-spine consideration', score: 1 }];
      const s = stats([
        run({ at: now - H, type: 'trauma', subtype: 'MVC', rubric: tr }),
        run({ at: now - H, type: 'trauma', subtype: 'Fall', rubric: tr2 }),
        run({ at: now - H, type: 'medical', subtype: 'Cardiac', rubric: [{ criterion: 'OPQRST history of present illness', score: 2 }] }),
      ]);
      assert.deepStrictEqual(s.criteria.trauma, [
        { criterion: 'C-spine consideration', avg: 0.5 },
        { criterion: 'BSI / PPE', avg: 2.5 },
      ]);
      assert.deepStrictEqual(s.criteria.medical, [{ criterion: 'OPQRST history of present illness', avg: 2 }]);
    },
  },
  {
    name: 'corrupt state counts as a run, never NaN',
    fn: () => {
      const s = stats([run({ at: now - H, state: '{bad' }), run({ at: now - H, state: null })]);
      assert.strictEqual(s.totals.all, 2);
      assert.strictEqual(s.totals.graded, 0);
      assert.deepStrictEqual(s.perScenario, []);
      walkNoNaN(s);
    },
  },
  {
    name: 'empty input',
    fn: () => {
      const s = computeAdminStats({ runs: [], classes: [], now, tzOffsetMin: 0 });
      assert.strictEqual(s.totals.all, 0);
      assert.strictEqual(s.totals.completionRate, null);
      assert.strictEqual(s.scores.avgAll, null);
      assert.strictEqual(s.scores.avg7d, null);
      assert.strictEqual(s.engagement.abandonedRate, null);
      assert.strictEqual(s.engagement.medianUserMessages, null);
      assert.strictEqual(s.daily.length, 30);
      assert.deepStrictEqual(s.perClass.map((c) => c.name), ['Free practice']);
      walkNoNaN(s);
    },
  },
];
