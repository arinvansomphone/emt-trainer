// Display helpers shared by the teacher pages.
export const fmtScore = (v) => (v == null ? '—' : `${Math.round(v)}%`);
export const fmtAvg = (v) => (v == null ? '—' : Number(v).toFixed(1));
export const fmtDate = (ms) => (ms == null ? '—' : new Date(ms).toLocaleDateString());
export const joinLink = (code) => `${window.location.origin}/join/${String(code).replace(/-/g, '')}`;
export const assignmentLink = (id) => `${window.location.origin}/a/${id}`;
