import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api';

// One shared store so the Header and teacher pages agree on who is signed in.
let state = { teacher: null, loading: true };
let inflight = null;
let loaded = false;
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load() {
  if (inflight) return inflight;
  inflight = apiFetch('/api/teacher/me')
    .then((data) => setState({ teacher: data.teacher, loading: false }))
    .catch(() => setState({ teacher: null, loading: false }))
    .finally(() => { inflight = null; loaded = true; });
  return inflight;
}

// Call after sign-in with the returned teacher to skip a round trip.
export function setTeacher(teacher) {
  loaded = true;
  setState({ teacher, loading: false });
}

export function useTeacher() {
  const snap = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (!loaded) load();
  }, []);

  const refresh = useCallback(() => load(), []);
  const logout = useCallback(async () => {
    try { await apiFetch('/api/teacher/logout', { method: 'POST' }); } catch { /* cookie may already be gone */ }
    setTeacher(null);
  }, []);

  return { teacher: snap.teacher, loading: snap.loading, refresh, logout };
}
