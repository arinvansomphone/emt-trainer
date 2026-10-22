import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import GradeView from '@/components/GradeView';
import RunBadge from '@/components/RunBadge';
import { normalizeCode } from '@/lib/student';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { apiFetch } from '@/lib/api';

export default function FeedbackDisplay() {
  const { id } = useParams();
  const [grade, setGrade] = useState(null);
  const [classRun, setClassRun] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem(`grade:${id}`);
    if (cached) setGrade(JSON.parse(cached));
    // New tab, refresh, or shared link: the grade is stored on the session server-side.
    apiFetch(`/api/sessions/${id}`)
      .then((data) => {
        setClassRun(data.classRun || null);
        if (!cached) setGrade(data.grade);
      })
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

  const startHref = classRun?.assignmentId
    ? `/a/${classRun.assignmentId}`
    : classRun ? `/join/${normalizeCode(classRun.classCode)}` : '/';

  return (
    <div className="mt-6 grid gap-4">
      <div><RunBadge classRun={classRun} /></div>
      <GradeView grade={grade} />

      <Separator />

      <div className="flex justify-end">
        <Button asChild><Link to={startHref}>Start a new scenario</Link></Button>
      </div>
    </div>
  );
}
