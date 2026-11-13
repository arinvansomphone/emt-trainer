import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/ThemeToggle';
import { useTeacher } from '@/lib/useTeacher';

function StarOfLife({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="10" y="2" width="4" height="20" rx="1.5" />
      <rect x="10" y="2" width="4" height="20" rx="1.5" transform="rotate(60 12 12)" />
      <rect x="10" y="2" width="4" height="20" rx="1.5" transform="rotate(120 12 12)" />
    </svg>
  );
}

function NavItem({ to, end = true, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn('text-sm transition-colors',
        isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </NavLink>
  );
}

export default function Header() {
  const { teacher, logout } = useTeacher();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate('/teacher');
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between py-4 gap-x-4 gap-y-2">
        <Link to="/" className="flex items-center gap-3">
          <StarOfLife className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold tracking-tight">EMT Scenario Trainer</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3">
          <NavItem to="/">Scenarios</NavItem>
          <NavItem to="/about">About</NavItem>
          <NavItem to="/teacher" end={false}>Teachers</NavItem>
          {teacher && (
            <button type="button" onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </button>
          )}
          <ThemeToggle />
        </nav>
      </header>
      <Separator />
    </>
  );
}
