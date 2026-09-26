// Maps OpenAI SDK failures to a 503 with a message a trainee can act on.
// Returns null for anything that isn't an upstream AI failure.
const QUOTA_CODES = new Set(['insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached']);

function aiErrorResponse(err) {
  if (!err) return null;
  if (err.name === 'APIConnectionError' || err.name === 'APIConnectionTimeoutError') {
    return { status: 503, error: 'The AI service could not be reached. Please try again in a minute.' };
  }
  const status = Number(err.status);
  if (status === 429 && QUOTA_CODES.has(err.code)) {
    return { status: 503, error: 'The AI service is temporarily unavailable. Please try again later.' };
  }
  if (status === 429) {
    return { status: 503, error: 'The AI service is busy right now. Please try again in a minute.' };
  }
  if (status === 401 || status === 403 || status >= 500) {
    return { status: 503, error: 'The AI service is temporarily unavailable. Please try again later.' };
  }
  return null;
}

module.exports = { aiErrorResponse };
