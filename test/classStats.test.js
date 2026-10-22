const assert = require('assert');
const { computeClassOverview, summarizeRun } = require('../services/classStats');

function grade(score, rubric = []) {
  return { overall: { score, summary: '' }, rubric, strengths: [], improvements: [] };
}
function run(id, student, assignment, createdAt, state) {
  return {
    session_id: id,
    student_id: student,
    assignment_id: assignment,
    created_at: createdAt,
    state: state === null ? null : typeof state === 'string' ? state : JSON.stringify(state),
  };
}
const st = (id, name = 'S' + id) => ({ id, class_id: 1, email_normalized: `${id}@x.edu`, name, created_at: 0 });
const asg = (id, dueAt = null) => ({ id, class_id: 1, type: 'trauma', subtype: 'MVC', title: 'A' + id, due_at: dueAt, created_at: 0 });
// Rubric rows with the given 0-3 scores; the grader's overall.score is deliberately a misleading 99.
const rows = (...scores) => scores.map((score, i) => ({ criterion: 'C' + i, score }));
const gs = (type, rubric) => ({ type, subtype: 'x', grade: grade(99, rubric) });

exports.tests = [
  {
    name: 'ungraded runs are excluded from averages but counted in student runs',
    fn() {
      const o = computeClassOverview({
        runs: [run('a', 's1', null, 1, gs('trauma', rows(2, 3))), run('b', 's1', null, 2, { type: 'trauma', subtype: 'MVC' })],
        students: [st('s1')],
        assignments: [],
      });
      assert.strictEqual(o.metrics.gradedRuns, 1);
      assert.strictEqual(o.metrics.classAvg, 83);
      assert.strictEqual(o.students[0].runs, 2);
      assert.strictEqual(o.students[0].gradedRuns, 1);
      assert.strictEqual(o.students[0].avg, 83);
      assert.strictEqual(o.students[0].email, 's1@x.edu');
    },
  },
  {
    name: "assignment avg uses each student's latest graded attempt",
    fn() {
      const o = computeClassOverview({
        runs: [run('a', 's1', 1, 10, gs('trauma', rows(1, 1))), run('b', 's1', 1, 20, gs('trauma', rows(3, 3)))],
        students: [st('s1')],
        assignments: [asg(1)],
      });
      assert.strictEqual(o.assignments[0].avg, 100);
      assert.strictEqual(o.assignments[0].done, 1);
      assert.strictEqual(o.students[0].avg, 67);
    },
  },
  {
    name: 'late is counted when graded after due date',
    fn() {
      const runs = [
        run('a', 's1', 1, 150, gs('trauma', rows(2))),
        run('b', 's2', 1, 50, gs('trauma', rows(2))),
        run('c', 's3', 2, 999, gs('trauma', rows(2))),
      ];
      const o = computeClassOverview({ runs, students: [st('s1'), st('s2'), st('s3')], assignments: [asg(1, 100), asg(2, null)] });
      assert.strictEqual(o.assignments[0].late, 1);
      assert.strictEqual(o.assignments[1].late, 0);
      assert.strictEqual(summarizeRun(runs[0], asg(1, 100)).late, true);
      assert.strictEqual(summarizeRun(runs[1], asg(1, 100)).late, false);
      assert.strictEqual(summarizeRun(runs[2], asg(2, null)).late, false);
    },
  },
  {
    name: 'late is not counted when a student also has an on-time graded run',
    fn() {
      const runs = [run('a', 's1', 1, 500, gs('trauma', rows(2))), run('b', 's1', 1, 2000, gs('trauma', rows(3)))];
      const o = computeClassOverview({ runs, students: [st('s1')], assignments: [asg(1, 1000)] });
      assert.strictEqual(o.assignments[0].done, 1);
      assert.strictEqual(o.assignments[0].late, 0);
    },
  },
  {
    name: 'score is the audited rubric percent, not the grader overall.score',
    fn() {
      const runs = [run('a', 's1', null, 1, { type: 'trauma', subtype: 'MVC', grade: grade(80, rows(1, 0)) })];
      const o = computeClassOverview({ runs, students: [st('s1')], assignments: [] });
      assert.strictEqual(o.metrics.classAvg, 17);
      assert.strictEqual(o.metrics.traumaAvg, 17);
      assert.strictEqual(o.students[0].avg, 17);
      assert.strictEqual(summarizeRun(runs[0]).score, 17);
    },
  },
  {
    name: 'a grade with no valid rubric rows is not graded',
    fn() {
      const o = computeClassOverview({ runs: [run('a', 's1', null, 1, gs('trauma', []))], students: [st('s1')], assignments: [] });
      assert.strictEqual(o.metrics.gradedRuns, 0);
      assert.strictEqual(o.metrics.classAvg, null);
    },
  },
  {
    name: 'shared criteria merge across trauma and medical',
    fn() {
      const o = computeClassOverview({
        runs: [
          run('a', 's1', null, 1, gs('trauma', [{ criterion: 'BSI / PPE', score: 3 }])),
          run('b', 's1', null, 2, gs('medical', [{ criterion: 'BSI / PPE', score: 2 }])),
        ],
        students: [st('s1')],
        assignments: [],
      });
      assert.strictEqual(o.criteria.length, 1);
      assert.strictEqual(o.criteria[0].count, 2);
      assert.strictEqual(o.criteria[0].avg, 2.5);
      assert.strictEqual(o.metrics.traumaAvg, 100);
      assert.strictEqual(o.metrics.medicalAvg, 67);
    },
  },
  {
    name: 'criteria are sorted weakest first',
    fn() {
      const o = computeClassOverview({
        runs: [run('a', 's1', null, 1, gs('trauma', [{ criterion: 'B', score: 3 }, { criterion: 'A', score: 1 }, { criterion: 'C', score: 1 }]))],
        students: [st('s1')],
        assignments: [],
      });
      assert.deepStrictEqual(o.criteria.map((c) => c.criterion), ['A', 'C', 'B']);
      assert.strictEqual(o.students[0].weakest, 'A');
    },
  },
  {
    name: 'missing lists joined students without a graded run on that assignment',
    fn() {
      const o = computeClassOverview({
        runs: [
          run('a', 's1', 1, 1, gs('trauma', rows(2))),
          run('b', 's2', 1, 1, { type: 'trauma' }),
          run('c', 's3', null, 1, gs('trauma', rows(2))),
        ],
        students: [st('s1'), st('s2'), st('s3')],
        assignments: [asg(1), asg(2)],
      });
      assert.deepStrictEqual(o.assignments[0].missing, ['s2', 's3']);
      assert.deepStrictEqual(o.assignments[1].missing, ['s1', 's2', 's3']);
      assert.deepStrictEqual(o.students[1].missingAssignmentIds, [1, 2]);
      assert.deepStrictEqual(o.students[0].missingAssignmentIds, [2]);
    },
  },
  {
    name: 'malformed grades are skipped',
    fn() {
      const o = computeClassOverview({
        runs: [
          run('a', 's1', null, 1, null),
          run('b', 's1', null, 2, '{not json'),
          run('c', 's1', null, 3, { type: 'trauma', grade: null }),
          run('d', 's1', null, 4, { type: 'trauma', grade: { overall: { score: 50 } } }),
          run('e', 's1', null, 5, { type: 'trauma', grade: { overall: { score: 'x' }, rubric: [] } }),
          run('f', 's1', null, 6, gs('trauma', [null, { criterion: 'X', score: '3' }, { criterion: 'Y', score: 2 }, { score: 1 }, 'str'])),
        ],
        students: [st('s1')],
        assignments: [],
      });
      assert.strictEqual(o.metrics.gradedRuns, 1);
      assert.strictEqual(o.students[0].runs, 6);
      assert.deepStrictEqual(o.criteria, [{ criterion: 'Y', avg: 2, count: 1 }]);
      assert.strictEqual(summarizeRun(null).status, 'in_progress');
    },
  },
  {
    name: 'empty class returns zeroed metrics and null averages',
    fn() {
      const o = computeClassOverview({ runs: [], students: [], assignments: [] });
      assert.deepStrictEqual(o.metrics, { gradedRuns: 0, studentsJoined: 0, classAvg: null, traumaAvg: null, medicalAvg: null });
      assert.deepStrictEqual(o.criteria, []);
      assert.deepStrictEqual(o.assignments, []);
      assert.deepStrictEqual(o.students, []);
    },
  },
];
