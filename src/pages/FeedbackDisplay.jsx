import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { apiFetch } from '@/lib/api';

function scoreColor(score) {
  if (score >= 3) return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
  if (score === 2) return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
  if (score === 1) return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
  return 'bg-red-500/15 text-red-700 border-red-500/30';
}

export default function FeedbackDisplay() {
  const { id } = useParams();
  const [grade, setGrade] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem(`grade:${id}`);
    if (cached) {
      setGrade(JSON.parse(cached));
      setLoading(false);
      return;
    }
    // New tab, refresh, or shared link: the grade is stored on the session server-side.
    apiFetch(`/api/sessions/${id}`)
      .then((data) => setGrade(data.grade))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="mt-6 text-sm text-muted-foreground">Loading feedback…</p>;
  }

  if (!grade) {
    return (
      <div className="mt-6">
        <p className="text-sm text-muted-foreground">No grade found. <Link to="/" className="underline">Start a new scenario</Link>.</p>
      </div>
    );
  }

  const rubricTotal = grade.rubric.reduce((sum, r) => sum + (Number(r.score) || 0), 0);
  const rubricMax = grade.rubric.length * 3;

  return (
    <div className="mt-6 grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Performance summary</span>
            <Badge className="text-base">{rubricTotal}/{rubricMax}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{grade.overall.summary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rubric</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {grade.rubric.map((row, i) => (
            <div key={i} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">{row.criterion}</div>
                <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${scoreColor(row.score)}`}>{row.score}/3</span>
              </div>
              {Array.isArray(row.quotes) && row.quotes.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  {row.quotes.map((q, j) => (
                    <div key={j} className="italic">
                      <span className="font-mono text-[10px] not-italic mr-1">[{q.speaker}]</span>
                      "{q.text}"
                    </div>
                  ))}
                </div>
              )}
              {row.feedback && <div className="text-xs mt-2">{row.feedback}</div>}
            </div>
          ))}
        </CardContent>
      </Card>

      {(grade.strengths?.length || grade.improvements?.length) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {grade.strengths?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Strengths</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm list-disc pl-4 space-y-1">
                  {grade.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
          {grade.improvements?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Improvements</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm list-disc pl-4 space-y-1">
                  {grade.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Separator />

      <div className="flex justify-end">
        <Button asChild><Link to="/">Start a new scenario</Link></Button>
      </div>
    </div>
  );
}
