import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import StudentForm from '@/components/StudentForm';
import ScenarioGrid from '@/components/ScenarioGrid';
import { apiFetch } from '@/lib/api';
import { saveStudent, formatCode, normalizeCode } from '@/lib/student';

const CODE_NOT_FOUND = "We couldn't find that class code. Check it with your teacher.";

export default function JoinClass() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [cls, setCls] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [student, setStudent] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    apiFetch(`/api/classes/${normalizeCode(code)}`)
      .then(setCls)
      .catch((e) => setLoadError(e.status === 404 ? CODE_NOT_FOUND : e.message));
    apiFetch('/api/scenario-types').then(setCatalog).catch((e) => setLoadError(e.message));
  }, [code]);

  async function start(type, subtype) {
    setBusy(subtype); setError(null);
    try {
      const data = await apiFetch('/api/scenarios', {
        body: { type, subtype, classCode: cls.code, studentName: student.name, studentEmail: student.email },
      });
      sessionStorage.setItem(`scenario:${data.sessionId}`, JSON.stringify(data.scenario));
      sessionStorage.setItem(`classRun:${data.sessionId}`, JSON.stringify(data.classRun ?? null));
      navigate(`/session/${data.sessionId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <p className="mt-6 text-sm text-destructive">{loadError}</p>;
  if (!cls || !catalog) return <Skeleton className="h-24 mt-6" />;

  return (
    <div className="mt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Join {cls.name}</h1>
      <p className="text-sm text-muted-foreground mb-4">Class code {formatCode(cls.code)}</p>
      {!student ? (
        <StudentForm
          submitLabel="Continue"
          onSubmit={(s) => { saveStudent(s); setStudent(s); }}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">Hi {student.name}. Pick a scenario to run for {cls.name}.</p>
          <ScenarioGrid catalog={catalog} busy={busy} onPick={start} />
          {error && <p className="text-sm text-destructive mt-3">{error}</p>}
        </>
      )}
    </div>
  );
}
