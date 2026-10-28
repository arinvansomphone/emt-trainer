import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStudent } from '@/lib/student';

export default function StudentForm({ onSubmit, submitLabel = 'Continue' }) {
  const saved = getStudent();
  const [name, setName] = useState(saved?.name || '');
  const [email, setEmail] = useState(saved?.email || '');
  const [errors, setErrors] = useState({});

  function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!name.trim()) errs.name = 'Enter your name.';
    if (!email.includes('@')) errs.email = 'Enter a valid email address.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({ name: name.trim(), email: email.trim() });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 max-w-sm" noValidate>
      <div>
        <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
      </div>
      <div>
        <Input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your email" />
        {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
      </div>
      <p className="text-xs text-muted-foreground">Your name, email, scores, and transcript will be visible to your teacher.</p>
      <div><Button type="submit">{submitLabel}</Button></div>
    </form>
  );
}
