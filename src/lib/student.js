const KEY = 'emt:student';

export function getStudent() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v.name === 'string' && typeof v.email === 'string') return { name: v.name, email: v.email };
  } catch { /* unavailable or corrupt */ }
  return null;
}

export function saveStudent({ name, email }) {
  try { localStorage.setItem(KEY, JSON.stringify({ name, email })); } catch { /* ignore */ }
}

// Uppercase and strip every non-alphanumeric character.
export function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// XXX-XXX display form.
export function formatCode(raw) {
  const c = normalizeCode(raw);
  return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}
