import { Stethoscope, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { splitRoles } from '@/lib/parseRoles';

function Bubble({ kind, name, text }) {
  const meta = {
    patient: {
      label: 'Patient',
      icon: <User className="h-3 w-3" />,
      style: { background: 'var(--color-patient-soft)', color: 'var(--color-patient)' },
    },
    moderator: {
      label: 'Moderator',
      icon: <Stethoscope className="h-3 w-3" />,
      style: { background: 'var(--color-moderator-soft)', color: 'var(--color-moderator)', borderColor: 'transparent' },
    },
    bystander: {
      label: name || 'Bystander',
      icon: <Users className="h-3 w-3" />,
      style: { background: 'var(--color-bystander-soft)', color: 'var(--color-bystander)', borderColor: 'transparent' },
    },
  }[kind] || { label: 'Assistant', icon: null, style: {} };

  return (
    <div
      className={cn('rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap text-sm border border-transparent self-start')}
      style={meta.style}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70 mb-1">
        {meta.icon}{meta.label}
      </div>
      {text}
    </div>
  );
}

export function AssistantMessage({ content }) {
  const segments = splitRoles(content);
  if (segments.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 self-start max-w-[85%]">
      {segments.map((s, i) => <Bubble key={i} {...s} />)}
    </div>
  );
}

export function UserMessage({ content }) {
  return (
    <div className="self-end rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap text-sm bg-primary text-primary-foreground">
      {content}
    </div>
  );
}
