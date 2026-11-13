import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ScenarioGrid from '@/components/ScenarioGrid';
import { normalizeCode } from '@/lib/student';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { Clock, Lock, MessageSquare } from 'lucide-react';

const FEEDBACK_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSdmGUrw9d3C9FuNSwA0PKg75CaJ3uZyNJZctTmXgRLh-JmVWA/viewform?usp=dialog';
const linkClass = 'inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors';

export default function SelectionScreen() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    apiFetch('/api/scenario-types').then(setCatalog).catch(e => setError(e.message));
  }, []);

  function joinClass(e) {
    e.preventDefault();
    const c = normalizeCode(joinCode);
    if (c) navigate(`/join/${c}`);
  }

  async function start(type, subtype) {
    setBusy(subtype); setError(null);
    try {
      const data = await apiFetch('/api/scenarios', { body: { type, subtype } });
      sessionStorage.setItem(`scenario:${data.sessionId}`, JSON.stringify(data.scenario));
      sessionStorage.setItem(`classRun:${data.sessionId}`, JSON.stringify(data.classRun ?? null));
      navigate(`/session/${data.sessionId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!catalog) return (
    <div className="grid grid-cols-2 gap-3 mt-6">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
    </div>
  );

  return (
    <div className="mt-6">
      <h1 className="text-3xl font-semibold tracking-tight">Choose a scenario</h1>
      <p className="mt-1 text-muted-foreground">Pick a category, then a subtype to begin.</p>
      <ul className="mt-5 space-y-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <li className="flex gap-3">
          <Lock className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground">Free practice isn&rsquo;t shared with any teacher.</span>
        </li>
        <li className="flex gap-3">
          <Clock className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>The first scenario after a quiet period can take about 30 seconds while the server wakes up.</span>
        </li>
      </ul>
      <div className="mt-3 mb-6 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <a href={FEEDBACK_FORM} target="_blank" rel="noreferrer" className={linkClass}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" />Send feedback
        </a>
      </div>
      <ScenarioGrid catalog={catalog} busy={busy} onPick={start} />
      <form className="flex gap-2 mt-6 max-w-sm" onSubmit={joinClass}>
        <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Joining a class? Enter code" aria-label="Class code" />
        <Button type="submit" variant="outline" disabled={!normalizeCode(joinCode)}>Join</Button>
      </form>
      {error && <p className="text-sm text-destructive mt-3">{error}</p>}
    </div>
  );
}
