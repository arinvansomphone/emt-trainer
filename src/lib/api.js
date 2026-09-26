// Turns API failures into messages a trainee can act on.
const STATUS_MESSAGES = {
  404: 'This session no longer exists. Please start a new scenario.',
  409: 'This scenario has already been graded.',
  500: 'Something went wrong on our side. Please try again.',
  502: 'The trainer is starting up. Please try again in about 30 seconds.',
  504: 'The trainer is starting up. Please try again in about 30 seconds.',
};

// Server-written messages for these statuses are already user-facing.
const USE_SERVER_MESSAGE = new Set([400, 429, 503]);

async function errorMessage(res) {
  let serverMsg = null;
  try { serverMsg = (await res.json())?.error; } catch { /* non-JSON body */ }
  if (serverMsg && USE_SERVER_MESSAGE.has(res.status)) return serverMsg;
  return STATUS_MESSAGES[res.status]
    ?? (res.status === 503 ? STATUS_MESSAGES[502] : `Unexpected error (${res.status}). Please try again.`);
}

export async function apiFetch(url, { body, method = body ? 'POST' : 'GET' } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the trainer. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
