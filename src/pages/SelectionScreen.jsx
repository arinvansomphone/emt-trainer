import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function SelectionScreen() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/scenario-types').then(setCatalog).catch(e => setError(e.message));
  }, []);

  async function start(type, subtype) {
    setBusy(subtype); setError(null);
    try {
      const data = await apiFetch('/api/scenarios', { body: { type, subtype } });
      sessionStorage.setItem(`scenario:${data.sessionId}`, JSON.stringify(data.scenario));
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
      <p className="text-xs text-muted-foreground mb-4">First click after a quiet period may take ~30 seconds while the server wakes up — this is normal.</p>
      <Tabs defaultValue="trauma">
        <TabsList>
          <TabsTrigger value="trauma">Trauma</TabsTrigger>
          <TabsTrigger value="medical">Medical</TabsTrigger>
        </TabsList>
        {['trauma','medical'].map((type) => (
          <TabsContent key={type} value={type}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {catalog[type].map((subtype) => (
                <Card
                  key={subtype}
                  onClick={() => !busy && start(type, subtype)}
                  className={`cursor-pointer hover:border-primary transition ${busy === subtype ? 'opacity-60' : ''}`}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      {subtype}
                      {busy === subtype && <Loader2 className="h-4 w-4 animate-spin" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground capitalize">{type}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      {error && <p className="text-sm text-destructive mt-3">{error}</p>}
    </div>
  );
}
