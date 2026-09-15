// Variable: Auth-Route (Login / Token).

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createToken, authenticateToken } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import configService from '../config.js';
import logger from '../../shared/logger.js';

const router = Router();

// Passwort-Hash wird beim ersten Login generiert und gecached.
let cachedPasswordHash = null;

// POST /api/auth/login
router.post('/login', rateLimit({ windowMs: 60000, max: 10, message: 'Zu viele Login-Versuche. Bitte warte 1 Minute.' }), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich.' });
    }

    const adminUser = configService.env.adminUser || 'admin';
    const adminPassword = configService.env.adminPassword || 'admin123';

    // Passwort-Hash einmalig erzeugen und cachen
    if (!cachedPasswordHash) {
      cachedPasswordHash = await bcrypt.hash(adminPassword, 10);
    }

    // Prüfe Benutzername
    if (username !== adminUser) {
      logger.warn(`[Auth] Fehlgeschlagener Login-Versuch für Benutzer: ${username}`);
      return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });
    }

    // Prüfe Passwort (vergleiche Eingabe mit dem gehashten Admin-Passwort)
    const passwordMatch = await bcrypt.compare(password, cachedPasswordHash);
    if (!passwordMatch) {
      logger.warn(`[Auth] Fehlgeschlagener Login-Versuch für Benutzer: ${username}`);
      return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });
    }

    const token = createToken({ username, role: 'admin' });
    logger.info(`[Auth] Erfolgreicher Login: ${username}`);

    return res.json({
      token,
      user: { username, role: 'admin' },
    });
  } catch (err) {
    logger.error(`[Auth] Login-Fehler: ${err.message}`);
    return res.status(500).json({ error: 'Interner Serverfehler.' });
  }
});

// GET /api/auth/verify - Prüft ob Token gültig ist
router.get('/verify', authenticateToken, (req, res) => {
  return res.json({ valid: true, user: req.user });
});

export default router;