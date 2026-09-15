// Variable: Rate-Limit-Middleware.
// Einfache In-Memory Rate-Limitierung für API-Endpoints.

const buckets = new Map();

/**
 * Erstellt eine Rate-Limit-Middleware.
 * @param {object} opts { windowMs, max, message }
 * @returns {Function} Express-Middleware
 */
export function rateLimit({ windowMs = 60000, max = 30, message = 'Zu viele Anfragen. Bitte warte einen Moment.' } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }

    const timestamps = buckets.get(key);
    // Alte Eintraege entfernen
    const valid = timestamps.filter((t) => now - t < windowMs);
    buckets.set(key, valid);

    if (valid.length >= max) {
      return res.status(429).json({ error: message });
    }

    valid.push(now);
    next();
  };
}

// Alle 5 Minuten alte Buckets bereinigen.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of buckets) {
    const valid = timestamps.filter((t) => now - t < 300000);
    if (valid.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, valid);
    }
  }
}, 300000);