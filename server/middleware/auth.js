// Variable: JWT-Authentifizierungs-Middleware.
// Schuetzt API-Routen und Dashboard-Endpoints.

import jwt from 'jsonwebtoken';
import configService from '../config.js';
import logger from '../../shared/logger.js';

/**
 * Middleware: Prüft den Authorization-Header auf gültiges JWT.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Kein Token bereitgestellt.' });
  }

  const secret = configService.env.sessionSecret;
  if (!secret) {
    logger.error('[Auth] Kein SESSION_SECRET konfiguriert.');
    return res.status(500).json({ error: 'Server-Konfigurationsfehler.' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token abgelaufen.' });
    }
    return res.status(403).json({ error: 'Ungültiger Token.' });
  }
}

/**
 * Erstellt ein JWT für den Dashboard-Login.
 * @param {object} payload { username, role }
 * @returns {string}
 */
export function createToken(payload) {
  const secret = configService.env.sessionSecret;
  const expiresIn = configService.env.jwtExpiresIn || '7d';
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Middleware: Nur Admin-Benutzer erlauben.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Keine Admin-Berechtigung.' });
  }
  next();
}