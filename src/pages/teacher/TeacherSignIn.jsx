import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { apiFetch } from '@/lib/api';
import { setTeacher } from '@/lib/useTeacher';

export default function TeacherSignIn() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const signup = mode === 'signup';

  async function finish(request) {
    setBusy(true); setError(null);
    try {
      const data = await request();
      setTeacher(data.teacher);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    const body = signup ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password };
    finish(() => apiFetch(`/api/teacher/${signup ? 'signup' : 'login'}`, { body, serverMessage: true }));
  }

  function google(credential) {
    finish(() => apiFetch('/api/teacher/google', { body: { credential }, serverMessage: true }));
  }

  return (
    <div className="mt-6 max-w-sm mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{signup ? 'Create a teacher account' : 'Teacher sign in'}</CardTitle>
          <p className="text-sm text-muted-foreground">See your class's graded runs, assignments, and transcripts.</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <GoogleSignInButton onCredential={google} />
          <form onSubmit={submit} className="grid gap-3">
            {signup && (
              <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" autoComplete="name" />
            )}
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" autoComplete="email" />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
              autoComplete={signup ? 'new-password' : 'current-password'}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</Button>
          </form>
          <Separator />
          <p className="text-sm text-muted-foreground">
            {signup ? 'Already have an account? ' : 'New here? '}
            <button
              type="button"
              className="underline text-foreground"
              onClick={() => { setMode(signup ? 'login' : 'signup'); setError(null); }}
            >
              {signup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
