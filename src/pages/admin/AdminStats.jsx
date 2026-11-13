import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import AdminTabs from '@/pages/admin/AdminTabs';
import ActivityChart from '@/pages/admin/ActivityChart';
import { apiFetch } from '@/lib/api';
import { setTeacher } from '@/lib/useTeacher';
import { cn } from '@/lib/utils';
import { fmtAvg, fmtDate, fmtScore } from '@/lib/teacherFormat';

const TH = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const TD = 'px-3 py-2 align-top';
const fmtPct = (v) => (v == null ? '—' : `${v}%`);

function barColor(avg) {
  if (avg < 1.5) return 'bg-bad';
  if (avg < 2.25) return 'bg-warn';
  return 'bg-good';
}

function Metric({ label, value, hint }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Criteria({ title, items }) {
  return (
    <div className="grid gap-3">
      <div className="text-sm font-medium">{title}</div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">No graded runs yet.</p>}
      {items.map((c) => (
        <div key={c.criterion} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">{c.criterion}</span>
            <span className="tabular-nums text-muted-foreground shrink-0">{fmtAvg(c.avg)}/3</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full', barColor(c.avg))} style={{ width: `${Math.max(0, Math.min(100, (c.avg / 3) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch(`/api/admin/stats?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`)
      .then(setData)
      .catch((e) => { if (e.status === 401) setTeacher(null); else setError(e.message); });
  }, []);

  const header = (
    <>
      <AdminTabs />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">Every run on this site, free practice included. Figures can be up to a minute old; reload to refresh.</p>
      </div>
    </>
  );

  if (error) return <div className="mt-6 grid gap-4">{header}<p className="text-sm text-destructive">{error}</p></div>;
  if (!data) return <div className="mt-6 grid gap-4">{header}<Skeleton className="h-40" /></div>;

  const { totals, scores, daily, activeStudents7d, perClass, perScenario, criteria, engagement, storage, aiToday } = data;
  if (totals.all === 0) {
    return (
      <div className="mt-6 grid gap-4">
        {header}
        <Card><CardContent className="p-4 text-sm text-muted-foreground">No runs yet. Stats appear once someone starts a scenario.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-4 min-w-0">
      {header}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Runs, last 24 h" value={totals.last24h} />
        <Metric label="Runs, last 7 days" value={totals.last7d} hint={`${totals.last30d} in 30 days`} />
        <Metric label="All runs" value={totals.all} hint={`${totals.class} class · ${totals.practice} free practice`} />
        <Metric label="Completion rate" value={fmtPct(totals.completionRate)} hint={`${totals.graded} graded`} />
        <Metric label="Average score" value={fmtScore(scores.avg7d)} hint={`last 7 days · ${fmtScore(scores.avgAll)} all time`} />
        <Metric label="Active students" value={activeStudents7d} hint="in classes, last 7 days" />
        <Metric
          label="AI budget used today"
          value={aiToday ? fmtPct(Math.round((aiToday.tokens / aiToday.budget) * 100)) : '—'}
          hint={aiToday ? `${aiToday.tokens.toLocaleString()} of ${aiToday.budget.toLocaleString()} tokens` : 'not available'}
        />
        <Metric
          label="Storage used"
          value={`${(storage.bytes / 1e6).toFixed(1)} MB`}
          hint={`of ${(storage.diskBytes / 1e9).toFixed(0)} GB disk`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs per day</CardTitle>
          <p className="text-xs text-muted-foreground">Last 30 days, by the day each run started.</p>
        </CardHeader>
        <CardContent><ActivityChart daily={daily} /></CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader><CardTitle className="text-base">By class</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className={TH}>Class</th>
                  <th className={TH}>Students</th>
                  <th className={TH}>Runs</th>
                  <th className={TH}>Graded</th>
                  <th className={TH}>Avg</th>
                  <th className={TH}>Last run</th>
                </tr>
              </thead>
              <tbody>
                {perClass.map((c) => (
                  <tr key={c.classId ?? 'practice'} className="border-t">
                    <td className={TD}>
                      <Link
                        to={c.classId ? `/admin/runs?classId=${c.classId}` : '/admin/runs?kind=practice'}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.classId && <div className="text-xs text-muted-foreground">{c.teacher} · <span className="font-mono">{c.code}</span></div>}
                    </td>
                    <td className={cn(TD, 'tabular-nums')}>{c.students ?? '—'}</td>
                    <td className={cn(TD, 'tabular-nums')}>{c.runs}</td>
                    <td className={cn(TD, 'tabular-nums')}>{c.graded}</td>
                    <td className={cn(TD, 'tabular-nums')}>{fmtScore(c.avgScore)}</td>
                    <td className={cn(TD, 'whitespace-nowrap')}>{fmtDate(c.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">By scenario</CardTitle>
          <p className="text-xs text-muted-foreground">Averages under 70% are highlighted.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className={TH}>Scenario</th>
                  <th className={TH}>Runs</th>
                  <th className={TH}>Completed</th>
                  <th className={TH}>Avg</th>
                </tr>
              </thead>
              <tbody>
                {perScenario.map((s) => (
                  <tr key={`${s.type}-${s.subtype}`} className="border-t">
                    <td className={cn(TD, 'capitalize whitespace-nowrap')}>{s.type} · {s.subtype}</td>
                    <td className={cn(TD, 'tabular-nums')}>{s.runs}</td>
                    <td className={cn(TD, 'tabular-nums')}>{fmtPct(s.completionRate)}</td>
                    <td className={cn(TD, 'tabular-nums', s.avgScore != null && s.avgScore < 70 && 'text-warn font-medium')}>
                      {fmtScore(s.avgScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weakest skills</CardTitle>
          <p className="text-xs text-muted-foreground">Average rubric score per criterion (0–3) across all graded runs, weakest first.</p>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <Criteria title="Trauma" items={criteria.trauma} />
          <Criteria title="Medical" items={criteria.medical} />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Students send a median of <span className="text-foreground tabular-nums">{engagement.medianUserMessages ?? '—'}</span> messages per run.{' '}
        <span className="text-foreground tabular-nums">{fmtPct(engagement.abandonedRate)}</span> of runs older than a day were abandoned (fewer than 3 messages, never graded).
      </p>
    </div>
  );
}
