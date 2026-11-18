import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TAB = 'inline-flex items-center rounded-md px-3 py-1 text-sm font-medium transition-all';

// Page-level switch between the two admin pages, styled like the shadcn TabsList.
export default function AdminTabs() {
  const tab = ({ isActive }) => cn(TAB, isActive ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground');
  return (
    <nav className="inline-flex h-9 items-center rounded-lg bg-muted p-1 w-fit" aria-label="Admin sections">
      <NavLink to="/admin" end className={tab}>Stats</NavLink>
      <NavLink to="/admin/runs" className={tab}>Runs</NavLink>
    </nav>
  );
}
