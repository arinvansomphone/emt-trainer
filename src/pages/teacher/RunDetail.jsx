import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import GradeView from '@/components/GradeView';
import { AssistantMessage, UserMessage } from '@/components/ChatBubbles';
import { apiFetch } from '@/lib/api';
import { setTeacher } from '@/lib/useTeacher';
import { fmtDate } from '@/lib/teacherFormat';

// Shared by the teacher dashboard and the admin view (endpoint="/api/admin/runs").
export default function RunDetail({ endpoint = '/api/teacher/runs' }) {
  const { sessionId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const navigate = useNavigate();
  const home = endpoint.startsWith('/api/admin') ? '/admin/runs' : '/teacher';
  // Opened from a shared link there is no in-app history to go back to.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(home));

  useEffect(() => {
    apiFetch(`${endpoint}/${sessionId}`)
      .then(setData)
      .catch((e) => {
        if (e.status === 401) setTeacher(null);
        else setError(e.status === 404 ? "We couldn't find that run." : e.message);
      });
  }, [endpoint, sessionId]);

  if (error) return <p className="mt-6 text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-40 mt-6" />;

  const { run, student, classRun, scenario, grade, messages } = data;
  const transcriptOpen = showTranscript || !grade;

  return (
    <div className="mt-6 grid gap-4 min-w-0">
      <button
        type="button"
        onClick={back}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight break-words">{student?.name ?? 'Free practice'}</h1>
        {classRun && (
          <p className="text-sm text-muted-foreground break-words">Class: {classRun.className} · {classRun.teacherName}</p>
        )}
        <p className="text-sm text-muted-foreground capitalize">
          {scenario.type ? `${scenario.type} · ${scenario.subtype}` : 'Scenario'} · {fmtDate(run.createdAt)}
          {run.late && <Badge variant="outline" className="ml-2 normal-case border-warn/40 bg-warn-soft text-warn">late</Badge>}
        </p>
      </div>

      {grade ? (
        <GradeView grade={grade} />
      ) : (
        <p className="text-sm text-muted-foreground">This run hasn't been graded yet.</p>
      )}

      {grade && (
        <div>
          <Button type="button" variant="outline" onClick={() => setShowTranscript((v) => !v)}>
            {showTranscript ? 'Hide transcript' : 'View full transcript'}
          </Button>
        </div>
      )}

      {transcriptOpen && (
        <Card>
          <CardHeader><CardTitle className="text-base">Transcript</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages.</p>}
              {messages.map((m, i) =>
                m.role === 'user'
                  ? <UserMessage key={i} content={m.content} />
                  : <AssistantMessage key={i} content={m.content} />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
