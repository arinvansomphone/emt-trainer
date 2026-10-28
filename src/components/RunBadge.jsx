import { Badge } from '@/components/ui/badge';

export default function RunBadge({ classRun }) {
  // undefined = not loaded yet; null = confirmed free practice.
  if (classRun === undefined) return null;
  return (
    <Badge variant={classRun ? 'default' : 'outline'}>
      {classRun ? `Shared with ${classRun.className}` : 'Free practice'}
    </Badge>
  );
}
