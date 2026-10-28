import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import CopyButton from '@/components/CopyButton';
import { apiFetch } from '@/lib/api';
import { setTeacher } from '@/lib/useTeacher';
import { cn } from '@/lib/utils';
import { fmtAvg, fmtDate, fmtScore, joinLink, assignmentLink } from '@/lib/teacherFormat';

const TH = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const TD = 'px-3 py-2 align-top';

function barColor(avg) {
  if (avg < 1.5) return 'bg-bad';
  if (avg < 2.25) return 'bg-warn';
  return 'bg-good';
}

function Metric({ label, value }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function CriteriaBars({ criteria }) {
  if (!criteria.length) {
    return <p className="text-sm text-muted-foreground">No graded runs yet. Criteria appear once students finish and grade a scenario.</p>;
  }
  return (
    <div className="grid gap-3">
      {criteria.map((c) => (
        <div key={c.criterion} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">{c.criterion}</span>
            <span className="tabular-nums text-muted-foreground shrink-0">{fmtAvg(c.avg)}/3 · {c.count}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full', barColor(c.avg))} style={{ width: `${Math.max(0, Math.min(100, (c.avg / 3) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function NewAssignment({ classId, catalog, onCreated }) {
  const [type, setType] = useState('trauma');
  const [subtype, setSubtype] = useState('');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const options = catalog?.[type] || [];
  const chosen = options.includes(subtype) ? subtype : options[0] || '';

  async function submit(e) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true); setError(null);
    try {
      // A date input means "due by the end of that day" in the teacher's timezone.
      const dueAt = due ? new Date(`${due}T23:59:59`).toISOString() : undefined;
      const a = await apiFetch(`/api/teacher/classes/${classId}/assignments`, {
        body: { type, subtype: chosen, title: title.trim() || undefined, dueAt },
      });
      setCreated(a);
      setTitle(''); setDue('');
      onCreated();
    } catch (err) {
      if (err.status === 401) setTeacher(null); else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

  return (
    <div className="grid gap-3">
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
        <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Scenario type">
          <option value="trauma">Trauma</option>
          <option value="medical">Medical</option>
        </select>
        <select className={selectCls} value={chosen} onChange={(e) => setSubtype(e.target.value)} aria-label="Scenario subtype" disabled={!catalog}>
          {options.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Assignment title" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="shrink-0">Due</span>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy || !chosen}>{busy ? 'Creating…' : 'Create assignment'}</Button>
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {created && (
        <div className="rounded-md border p-3 text-sm grid gap-2">
          <div>Created <span className="font-medium">{created.title}</span>. Share this link with students:</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs break-all bg-muted rounded px-2 py-1">{assignmentLink(created.id)}</code>
            <CopyButton text={assignmentLink(created.id)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClassOverview() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    return apiFetch(`/api/teacher/classes/${id}`)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => {
        if (e.status === 401) setTeacher(null);
        else setError(e.status === 404 ? "We couldn't find that class." : e.message);
      });
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch('/api/scenario-types').then(setCatalog).catch(() => {}); }, []);

  async function remove(a) {
    const ok = window.confirm(
      `Delete "${a.title}"? Its link will stop working. Runs already submitted stay in the class as practice.`
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/teacher/assignments/${a.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      if (e.status === 401) setTeacher(null); else window.alert(e.message);
    }
  }

  if (error) return <p className="mt-6 text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-40 mt-6" />;

  const { class: cls, metrics, criteria, assignments, students } = data;
  const titleOf = new Map(assignments.map((a) => [a.id, a.title]));

  return (
    <div className="mt-6 grid gap-4 min-w-0">
      <Link to="/teacher" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-4 w-4" /> All classes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{cls.name}</h1>
          <p className="text-sm text-muted-foreground">
            Class code <span className="font-mono text-foreground">{cls.code}</span>
          </p>
        </div>
        <CopyButton text={joinLink(cls.code)} label="Copy join link" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Graded runs" value={metrics.gradedRuns} />
        <Metric label="Class avg" value={fmtScore(metrics.classAvg)} />
        <Metric label="Trauma avg" value={fmtScore(metrics.traumaAvg)} />
        <Metric label="Medical avg" value={fmtScore(metrics.medicalAvg)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the class needs to work on</CardTitle>
          <p className="text-xs text-muted-foreground">Average rubric score per criterion (0–3), weakest first.</p>
        </CardHeader>
        <CardContent><CriteriaBars criteria={criteria} /></CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader><CardTitle className="text-base">Assignments</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet. Students can still practice any scenario through the join link.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className={TH}>Assignment</th>
                    <th className={TH}>Due</th>
                    <th className={TH}>Done</th>
                    <th className={TH}>Avg</th>
                    <th className={TH}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className={TD}>
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs text-muted-foreground capitalize">{a.type} · {a.subtype}</div>
                      </td>
                      <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(a.dueAt)}</td>
                      <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>
                        {a.done}/{metrics.studentsJoined}{a.late > 0 && ` · ${a.late} late`}
                      </td>
                      <td className={cn(TD, 'tabular-nums')}>{fmtScore(a.avg)}</td>
                      <td className={cn(TD, 'whitespace-nowrap text-right')}>
                        <div className="inline-flex gap-1">
                          <CopyButton text={assignmentLink(a.id)} label="Copy link" />
                          <Button type="button" variant="ghost" size="sm" onClick={() => remove(a)} aria-label={`Delete ${a.title}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <div className="text-sm font-medium mb-2">New assignment</div>
            <NewAssignment classId={cls.id} catalog={catalog} onCreated={load} />
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Students</CardTitle>
          <p className="text-xs text-muted-foreground">
            {metrics.studentsJoined === 1 ? '1 student has joined' : `${metrics.studentsJoined} students have joined`}. Students appear here after their first run.
          </p>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students yet. Share the join link to get started.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className={TH}>Student</th>
                    <th className={TH}>Runs</th>
                    <th className={TH}>Avg</th>
                    <th className={TH}>Weakest</th>
                    <th className={TH}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className={TD}>
                        <Link to={`/teacher/classes/${cls.id}/students/${s.id}`} className="font-medium underline-offset-2 hover:underline">
                          {s.name}
                        </Link>
                        <div className="text-xs text-muted-foreground break-all">{s.email}</div>
                      </td>
                      <td className={cn(TD, 'tabular-nums whitespace-nowrap')}>
                        {s.runs}{s.gradedRuns !== s.runs && <span className="text-muted-foreground"> ({s.gradedRuns} graded)</span>}
                      </td>
                      <td className={cn(TD, 'tabular-nums')}>{fmtScore(s.avg)}</td>
                      <td className={cn(TD, 'min-w-[8rem]')}>{s.weakest || <span className="text-muted-foreground">—</span>}</td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1">
                          {s.missingAssignmentIds.map((aid) => (
                            <Badge key={aid} variant="outline" className="border-warn/40 bg-warn-soft text-warn whitespace-nowrap">
                              Missing {titleOf.get(aid) || 'assignment'}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
