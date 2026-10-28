import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { setTeacher } from '@/lib/useTeacher';
import { cn } from '@/lib/utils';
import { fmtDate, fmtScore } from '@/lib/teacherFormat';

const TH = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const TD = 'px-3 py-2 align-top';

export default function StudentRuns() {
  const { id, studentId } = useParams();
  const [data, setData] = useState(null);
  const [titles, setTitles] = useState(new Map());
  const [error, setError] = useState(null);

  useEffect(() => {
    const onErr = (e) => {
      if (e.status === 401) setTeacher(null);
      else setError(e.status === 404 ? "We couldn't find that student." : e.message);
    };
    apiFetch(`/api/teacher/classes/${id}/students/${studentId}`).then(setData).catch(onErr);
    // Assignment titles come from the class overview.
    apiFetch(`/api/teacher/classes/${id}`)
      .then((d) => setTitles(new Map(d.assignments.map((a) => [a.id, a.title]))))
      .catch(() => {});
  }, [id, studentId]);

  if (error) return <p className="mt-6 text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-40 mt-6" />;

  const { student, runs } = data;

  return (
    <div className="mt-6 grid gap-4 min-w-0">
      <Link to={`/teacher/classes/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-4 w-4" /> Back to class
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight break-words">{student.name}</h1>
        <p className="text-sm text-muted-foreground break-all">{student.email}</p>
      </div>

      <Card className="min-w-0">
        <CardContent className="p-4">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className={TH}>Date</th>
                    <th className={TH}>Scenario</th>
                    <th className={TH}>Assignment</th>
                    <th className={TH}>Score</th>
                    <th className={TH}><span className="sr-only">View</span></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.sessionId} className="border-t">
                      <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(r.createdAt)}</td>
                      <td className={cn(TD, 'capitalize whitespace-nowrap')}>{r.type ? `${r.type} · ${r.subtype}` : '—'}</td>
                      <td className={TD}>
                        {r.assignmentId
                          ? (titles.get(r.assignmentId) || 'Assignment')
                          : <span className="text-muted-foreground">Class practice</span>}
                        {r.late && <Badge variant="outline" className="ml-2 border-warn/40 bg-warn-soft text-warn">late</Badge>}
                      </td>
                      <td className={cn(TD, 'tabular-nums whitespace-nowrap')}>
                        {r.status === 'graded' ? fmtScore(r.score) : <span className="text-muted-foreground">In progress</span>}
                      </td>
                      <td className={cn(TD, 'text-right whitespace-nowrap')}>
                        <Link to={`/teacher/runs/${r.sessionId}`} className="underline underline-offset-2">View</Link>
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
