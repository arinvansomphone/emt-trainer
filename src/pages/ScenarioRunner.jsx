import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Mic, MicOff, RotateCcw, Square } from 'lucide-react';
import { AssistantMessage, UserMessage } from '@/components/ChatBubbles';
import { useSpeechRecognition } from '@/lib/useSpeech';

export default function ScenarioRunner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [scenario, setScenario] = useState(null);
  const [bystanders, setBystanders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  const speech = useSpeechRecognition({
    onResult: (text) => setInput((cur) => (cur ? cur + ' ' : '') + text),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function refreshState() {
    try {
      const r = await fetch(`/api/sessions/${id}`);
      if (!r.ok) return;
      const data = await r.json();
      setScenario(data.scenario);
      setBystanders(data.bystanders || []);
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch (_e) { /* ignore */ }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem(`scenario:${id}`);
    if (cached) {
      const s = JSON.parse(cached);
      setScenario(s);
      setBystanders(s.bystanders || []);
    }
    refreshState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, message: text }),
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function endScenario() {
    if (!confirm('End the scenario and grade your performance?')) return;
    setGrading(true);
    try {
      const res = await fetch(`/api/sessions/${id}/grade`, { method: 'POST' });
      if (!res.ok) throw new Error(`grading returned ${res.status}`);
      const grade = await res.json();
      sessionStorage.setItem(`grade:${id}`, JSON.stringify(grade));
      navigate(`/session/${id}/feedback`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGrading(false);
    }
  }

  async function restart() {
    if (!scenario) return;
    if (!confirm('Restart with a fresh scenario of the same subtype?')) return;
    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: scenario.type, subtype: scenario.subtype }),
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      sessionStorage.setItem(`scenario:${data.sessionId}`, JSON.stringify(data.scenario));
      navigate(`/session/${data.sessionId}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!scenario) {
    return (
      <div className="mt-6">
        <p className="text-sm text-muted-foreground">No scenario data found for this session. <Link className="underline" to="/">Start a new scenario</Link>.</p>
      </div>
    );
  }

  const p = scenario.patientProfile;
  const env = scenario.environment;

  return (
    <div className="mt-6 grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Dispatch</span>
            <Badge variant="secondary">{scenario.type} · {scenario.subtype}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{scenario.dispatch}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Patient</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm"><span className="font-medium">{p.name}</span> · {p.age}y · {p.sex}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Environment</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Location:</span> {env.location}</div>
            <div><span className="text-muted-foreground">Weather:</span> {env.weather}</div>
            <div><span className="text-muted-foreground">Lighting:</span> {env.lighting}</div>
            <div><span className="text-muted-foreground">Hazards:</span> {env.hazards.join(', ') || 'none'}</div>
          </CardContent>
        </Card>
      </div>

      {bystanders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Bystanders</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            {bystanders.map((b, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{b.name} <span className="text-xs text-muted-foreground">· {b.role}</span></div>
                <div className="text-xs text-muted-foreground mt-1">{b.knowledge}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <ScrollArea className="h-[45vh] pr-2">
            <div className="flex flex-col gap-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">Begin your assessment. Ask the patient, address a bystander by name, or describe a physical action.</p>
              )}
              {messages.map((m, i) =>
                m.role === 'user'
                  ? <UserMessage key={i} content={m.content} />
                  : <AssistantMessage key={i} content={m.content} />
              )}
              {busy && <div className="self-start text-xs text-muted-foreground italic">…</div>}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
          <form className="flex gap-2 mt-4" onSubmit={send}>
            {speech.supported && (
              <Button
                type="button"
                size="icon"
                variant={speech.listening ? 'destructive' : 'outline'}
                onClick={speech.toggle}
                title={speech.listening ? 'Stop listening' : 'Speak'}
              >
                {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={speech.listening ? 'Listening…' : 'Ask the patient or describe an action…'}
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !input.trim()}>{busy ? 'Sending…' : 'Send'}</Button>
          </form>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={restart}>
          <RotateCcw className="h-4 w-4 mr-2" /> Restart
        </Button>
        <Button variant="outline" onClick={endScenario} disabled={grading}>
          {grading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Grading…</> : <><Square className="h-4 w-4 mr-2" /> End Scenario & Grade</>}
        </Button>
      </div>
    </div>
  );
}
