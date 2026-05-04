import { Link, NavLink } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/ThemeToggle';

function StarOfLife({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="10" y="2" width="4" height="20" rx="1.5" />
      <rect x="10" y="2" width="4" height="20" rx="1.5" transform="rotate(60 12 12)" />
      <rect x="10" y="2" width="4" height="20" rx="1.5" transform="rotate(120 12 12)" />
    </svg>
  );
}

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => cn('text-sm transition-colors',
        isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </NavLink>
  );
}

export default function Header() {
  return (
    <>
      <header className="flex items-center justify-between py-4 gap-4">
        <Link to="/" className="flex items-center gap-3">
          <StarOfLife className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold tracking-tight">EMT Scenario Trainer</span>
        </Link>
        <nav className="flex items-center gap-3">
          <NavItem to="/">Scenarios</NavItem>
          <NavItem to="/about">About</NavItem>
          <ThemeToggle />
        </nav>
      </header>
      <Separator />
    </>
  );
}
