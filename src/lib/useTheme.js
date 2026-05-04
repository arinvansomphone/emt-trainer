import { useEffect, useState } from 'react';

const KEY = 'pulse-color-mode';

function detectInitial() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(mode) {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}

export function useTheme() {
  const [mode, setMode] = useState(detectInitial);

  useEffect(() => {
    apply(mode);
    localStorage.setItem(KEY, mode);
  }, [mode]);

  function toggle() { setMode((m) => (m === 'dark' ? 'light' : 'dark')); }
  return { mode, toggle, isDark: mode === 'dark' };
}
