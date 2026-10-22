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
const gs = (type, score, rubric) => ({ type, subtype: 'x', grade: grade(score, rubric) });

exports.tests = [
  {
    name: 'ungraded runs are excluded from averages but counted in student runs',
    fn() {
      const o = computeClassOverview({
        runs: [run('a', 's1', null, 1, gs('trauma', 80, [])), run('b', 's1', null, 2, { type: 'trauma', subtype: 'MVC' })],
        students: [st('s1')],
        assignments: [],
      });
      assert.strictEqual(o.metrics.gradedRuns, 1);
      assert.strictEqual(o.metrics.classAvg, 80);
      assert.strictEqual(o.students[0].runs, 2);
      assert.strictEqual(o.students[0].gradedRuns, 1);
      assert.strictEqual(o.students[0].avg, 80);
      assert.strictEqual(o.students[0].email, 's1@x.edu');
    },
  },
  {
    name: "assignment avg uses each student's latest graded attempt",
    fn() {
      const o = computeClassOverview({
        runs: [run('a', 's1', 1, 10, gs('trauma', 40, [])), run('b', 's1', 1, 20, gs('trauma', 80, []))],
        students: [st('s1')],
        assignments: [asg(1)],
      });
      assert.strictEqual(o.assignments[0].avg, 80);
      assert.strictEqual(o.assignments[0].done, 1);
      assert.strictEqual(o.students[0].avg, 60);
    },
  },
  {
    name: 'late is counted when graded after due date',
    fn() {
      const runs = [
        run('a', 's1', 1, 150, gs('trauma', 70, [])),
        run('b', 's2', 1, 50, gs('trauma', 70, [])),
        run('c', 's3', 2, 999, gs('trauma', 70, [])),
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
    name: 'shared criteria merge across trauma and medical',
    fn() {
      const o = computeClassOverview({
        runs: [
          run('a', 's1', null, 1, gs('trauma', 70, [{ criterion: 'BSI / PPE', score: 3 }])),
          run('b', 's1', null, 2, gs('medical', 70, [{ criterion: 'BSI / PPE', score: 2 }])),
        ],
        students: [st('s1')],
        assignments: [],
      });
      assert.strictEqual(o.criteria.length, 1);
      assert.strictEqual(o.criteria[0].count, 2);
      assert.strictEqual(o.criteria[0].avg, 2.5);
      assert.strictEqual(o.metrics.traumaAvg, 70);
      assert.strictEqual(o.metrics.medicalAvg, 70);
    },
  },
  {
    name: 'criteria are sorted weakest first',
    fn() {
      const o = computeClassOverview({
        runs: [run('a', 's1', null, 1, gs('trauma', 70, [{ criterion: 'B', score: 3 }, { criterion: 'A', score: 1 }, { criterion: 'C', score: 1 }]))],
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
          run('a', 's1', 1, 1, gs('trauma', 70, [])),
          run('b', 's2', 1, 1, { type: 'trauma' }),
          run('c', 's3', null, 1, gs('trauma', 70, [])),
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
          run('f', 's1', null, 6, gs('trauma', 60, [null, { criterion: 'X', score: '3' }, { criterion: 'Y', score: 2 }, { score: 1 }, 'str'])),
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
