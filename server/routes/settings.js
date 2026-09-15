// Variable: Einstellungs-Route - Bot-Konfiguration über API verwalten.

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import configService from '../config.js';
import { SETTING_KEYS } from '../../shared/types.js';

const router = Router();

// GET /api/settings - Alle Einstellungen abrufen
router.get('/', authenticateToken, (req, res) => {
  try {
    const settings = configService.getAll();
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Abrufen der Einstellungen.' });
  }
});

// GET /api/settings/schema/keys - Alle gültigen Schlüssel
// Muss vor /:key stehen, damit "schema" nicht als Einstellung behandelt wird.
router.get('/schema/keys', authenticateToken, (req, res) => {
  return res.json(SETTING_KEYS);
});

// GET /api/settings/:key - Einzelne Einstellung abrufen
router.get('/:key', authenticateToken, (req, res) => {
  try {
    const key = req.params.key;
    if (!SETTING_KEYS.includes(key)) {
      return res.status(404).json({ error: 'Unbekannte Einstellung.' });
    }
    const value = configService.get(key);
    return res.json({ key, value });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler.' });
  }
});

// PUT /api/settings - Einstellungen aktualisieren
router.put('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Eingabe muss ein Objekt sein.' });
    }

    const result = configService.update(updates);
    if (!result.ok) {
      return res.status(400).json({ errors: result.errors });
    }

    return res.json({ ok: true, settings: configService.getAll() });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Aktualisieren.' });
  }
});

export default router;
