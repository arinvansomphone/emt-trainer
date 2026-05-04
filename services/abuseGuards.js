function killSwitch(req, res, next) {
  if (process.env.SERVICE_DISABLED === 'true') {
    return res.status(503).json({ error: 'service temporarily disabled' });
  }
  next();
}

module.exports = { killSwitch };
