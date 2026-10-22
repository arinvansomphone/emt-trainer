import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import StudentForm from '@/components/StudentForm';
import { apiFetch } from '@/lib/api';
import { saveStudent } from '@/lib/student';

const GONE = 'This assignment no longer exists. Ask your teacher for a new link.';

export default function AssignmentStart() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/assignments/${encodeURIComponent(assignmentId)}`)
      .then(setAssignment)
      .catch((e) => setLoadError(e.status === 404 ? GONE : e.message));
  }, [assignmentId]);

  async function start(student) {
    saveStudent(student);
    setStarting(true); setError(null);
    try {
      const data = await apiFetch('/api/scenarios', {
        body: { assignmentId: assignment.id, studentName: student.name, studentEmail: student.email },
      });
      sessionStorage.setItem(`scenario:${data.sessionId}`, JSON.stringify(data.scenario));
      navigate(`/session/${data.sessionId}`);
    } catch (e) {
      setError(e.status === 404 ? GONE : e.message);
      setStarting(false);
    }
  }

  if (loadError) return <p className="mt-6 text-sm text-destructive">{loadError}</p>;
  if (!assignment) return <Skeleton className="h-24 mt-6" />;

  const pastDue = assignment.dueAt && assignment.dueAt < Date.now();

  return (
    <div className="mt-6">
      <h1 className="text-2xl font-semibold tracking-tight">{assignment.title}</h1>
      <p className="text-sm text-muted-foreground">{assignment.className} · {assignment.type} · {assignment.subtype}</p>
      {assignment.dueAt && (
        <p className="text-sm text-muted-foreground">Due {new Date(assignment.dueAt).toLocaleDateString()}</p>
      )}
      {pastDue && (
        <p className="text-sm mt-2">
          This assignment was due {new Date(assignment.dueAt).toLocaleDateString()}. You can still submit; it will be marked late.
        </p>
      )}
      <div className="mt-4">
        <StudentForm submitLabel={starting ? 'Starting…' : 'Start scenario'} onSubmit={(s) => !starting && start(s)} />
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </div>
    </div>
  );
}
