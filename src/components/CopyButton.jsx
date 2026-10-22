import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CopyButton({ text, label = 'Copy link', ...props }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), 1500);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('Copied');
    } catch {
      setState('Copy failed');
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} {...props}>
      {state === 'Copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {state || label}
    </Button>
  );
}
