import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminTabs from '@/pages/admin/AdminTabs';
import { apiFetch } from '@/lib/api';
import { setTeacher } from '@/lib/useTeacher';
import { cn } from '@/lib/utils';
import { fmtDate, fmtScore } from '@/lib/teacherFormat';

const TH = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const TD = 'px-3 py-2 align-top';
const KINDS = ['all', 'class', 'practice'];

export default function AdminRuns() {
  const [params, setParams] = useSearchParams();
  const kind = KINDS.includes(params.get('kind')) ? params.get('kind') : 'all';
  const classId = params.get('classId') || '';
  const [runs, setRuns] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const fetchPage = useCallback((before) => {
    const q = new URLSearchParams({ kind });
    if (classId) q.set('classId', classId);
    if (before != null) q.set('before', String(before));
    return apiFetch(`/api/admin/runs?${q}`);
  }, [kind, classId]);

  const fail = (e) => {
    if (e.status === 401) setTeacher(null); else setError(e.message);
  };

  useEffect(() => {
    setRuns(null);
    setError(null);
    fetchPage(null)
      .then((d) => { setRuns(d.runs); setNextBefore(d.nextBefore); })
      .catch(fail);
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const d = await fetchPage(nextBefore);
      setRuns((prev) => [...prev, ...d.runs]);
      setNextBefore(d.nextBefore);
    } catch (e) {
      fail(e);
    } finally {
      setLoadingMore(false);
    }
  }

  function setKind(k) {
    const next = new URLSearchParams(params);
    if (k === 'all') next.delete('kind'); else next.set('kind', k);
    next.delete('classId');
    setParams(next);
  }

  const className = classId && runs?.find((r) => r.classRun)?.classRun.className;

  return (
    <div className="mt-6 grid gap-4 min-w-0">
      <AdminTabs />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">All runs</h1>
        <p className="text-sm text-muted-foreground">Every scenario run on this site, newest first.</p>
      </div>

      {classId ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Showing class <span className="font-medium">{className || 'with no runs yet'}</span></span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setKind('all')}>
            <X className="h-4 w-4" /> Show all runs
          </Button>
        </div>
      ) : (
        <Tabs value={kind} onValueChange={setKind}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="class">Class</TabsTrigger>
            <TabsTrigger value="practice">Free practice</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!runs && !error && <Skeleton className="h-40" />}
      {runs && runs.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">No runs here yet.</CardContent></Card>
      )}

      {runs && runs.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className={TH}>Started</th>
                <th className={TH}>Scenario</th>
                <th className={TH}>Where</th>
                <th className={TH}>Student</th>
                <th className={TH}>Score</th>
                <th className={TH}>Messages</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.sessionId} className="border-t">
                  <td className={cn(TD, 'whitespace-nowrap')}>
                    <Link to={`/admin/runs/${r.sessionId}`} className="font-medium underline-offset-2 hover:underline">
                      {fmtDate(r.createdAt)}
                    </Link>
                  </td>
                  <td className={cn(TD, 'capitalize whitespace-nowrap')}>{r.type ? `${r.type} · ${r.subtype}` : '—'}</td>
                  <td className={TD}>
                    {r.classRun ? (
                      <>
                        <div>{r.classRun.className}</div>
                        <div className="text-xs text-muted-foreground">{r.classRun.teacherName}</div>
                      </>
                    ) : (
                      <Badge variant="outline">Free practice</Badge>
                    )}
                  </td>
                  <td className={TD}>
                    {r.student ? (
                      <>
                        <div>{r.student.name}</div>
                        <div className="text-xs text-muted-foreground break-all">{r.student.email}</div>
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className={cn(TD, 'tabular-nums whitespace-nowrap')}>
                    {r.status === 'graded' ? fmtScore(r.score) : <span className="text-muted-foreground">In progress</span>}
                    {r.late && <Badge variant="outline" className="ml-2 border-warn/40 bg-warn-soft text-warn">late</Badge>}
                  </td>
                  <td className={cn(TD, 'tabular-nums')}>{r.messageCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextBefore != null && (
        <div>
          <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
