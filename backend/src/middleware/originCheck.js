const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getAllowedOrigin() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

// Rejects cross-site state-changing requests. Non-browser clients (API keys,
// HMAC-signed webhooks) send neither Sec-Fetch-Site nor Origin and pass through.
function originCheck(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite) {
    if (fetchSite === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }
    return next();
  }

  const origin = req.get('origin');
  if (!origin) return next();

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  if (origin === getAllowedOrigin() || originHost === req.get('host')) return next();

  return res.status(403).json({ error: 'Cross-site request blocked' });
}

module.exports = { originCheck };
