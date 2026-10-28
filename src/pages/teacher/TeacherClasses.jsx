import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { setTeacher, useTeacher } from '@/lib/useTeacher';

export default function TeacherClasses() {
  const { teacher } = useTeacher();
  const [classes, setClasses] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    apiFetch('/api/teacher/classes')
      .then(setClasses)
      .catch((e) => (e.status === 401 ? setTeacher(null) : setLoadError(e.message)));
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Enter a class name.'); return; }
    setBusy(true); setError(null);
    try {
      const c = await apiFetch('/api/teacher/classes', { body: { name: name.trim() } });
      setClasses((prev) => [...(prev || []), { ...c, studentsJoined: 0, gradedRuns: 0 }]);
      setName('');
    } catch (err) {
      if (err.status === 401) setTeacher(null); else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your classes</h1>
        <p className="text-sm text-muted-foreground">Signed in as {teacher?.name || teacher?.email}.</p>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {!classes && !loadError && <Skeleton className="h-24" />}
      {classes && classes.length === 0 && (
        <p className="text-sm text-muted-foreground">No classes yet. Create one below, then share its join link with students.</p>
      )}
      {classes && classes.length > 0 && (
        <div className="grid gap-2">
          {classes.map((c) => (
            <Link key={c.id} to={`/teacher/classes/${c.id}`} className="block">
              <Card className="hover:bg-accent transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Code <span className="font-mono">{c.code}</span> · {c.studentsJoined} joined · {c.gradedRuns} graded runs
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">New class</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Class name, e.g. EMT-B Fall 2026" value={name} onChange={(e) => setName(e.target.value)} aria-label="Class name" />
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create class'}</Button>
          </form>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
