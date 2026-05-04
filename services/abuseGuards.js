function killSwitch(req, res, next) {
  if (process.env.SERVICE_DISABLED === 'true') {
    return res.status(503).json({ error: 'service temporarily disabled' });
  }
  next();
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function makeTokenMeter({ defaultBudget = 200_000, now = () => new Date() } = {}) {
  let date = ymd(now());
  let tokens = 0;

  function maybeRoll() {
    const today = ymd(now());
    if (today !== date) { date = today; tokens = 0; }
  }

  function getBudget() {
    const raw = process.env.DAILY_TOKEN_BUDGET;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : defaultBudget;
  }

  function recordUsage(promptTokens = 0, completionTokens = 0) {
    maybeRoll();
    tokens += (Number(promptTokens) || 0) + (Number(completionTokens) || 0);
  }

  function guardMiddleware(req, res, next) {
    maybeRoll();
    if (tokens >= getBudget()) {
      return res.status(503).json({ error: 'daily token quota reached, try again tomorrow' });
    }
    next();
  }

  function snapshot() {
    maybeRoll();
    return { date, tokens, budget: getBudget() };
  }

  return { recordUsage, guardMiddleware, snapshot };
}

module.exports = { killSwitch, makeTokenMeter };
