import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ScenarioGrid from '@/components/ScenarioGrid';
import { normalizeCode } from '@/lib/student';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';

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
      <h1 className="text-2xl font-semibold tracking-tight">Choose a scenario</h1>
      <p className="text-sm text-muted-foreground mb-1">Pick a category, then a subtype to begin.</p>
      <p className="text-xs text-muted-foreground mb-1">First click after a quiet period may take ~30 seconds while the server wakes up — this is normal.</p>
      <p className="text-sm text-muted-foreground mb-1">
        Please submit feedback through <a href="https://docs.google.com/forms/d/e/1FAIpQLSdmGUrw9d3C9FuNSwA0PKg75CaJ3uZyNJZctTmXgRLh-JmVWA/viewform?usp=dialog" target="_blank" rel="noreferrer" className="underline">this form</a>!
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Questions or concerns? Email <a href="mailto:arinv@stanford.edu" className="underline">arinv@stanford.edu</a>.
      </p>
      <p className="text-sm font-medium mb-3">Free practice — not shared with any teacher.</p>
      <ScenarioGrid catalog={catalog} busy={busy} onPick={start} />
      <form className="flex gap-2 mt-6 max-w-sm" onSubmit={joinClass}>
        <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Joining a class? Enter code" aria-label="Class code" />
        <Button type="submit" variant="outline" disabled={!normalizeCode(joinCode)}>Join</Button>
      </form>
      {error && <p className="text-sm text-destructive mt-3">{error}</p>}
    </div>
  );
}
