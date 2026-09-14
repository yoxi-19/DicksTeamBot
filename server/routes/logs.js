// Variable: Logs-Route - Log-Eintraege abrufen und filtern.

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../../database/index.js';

const router = Router();

// GET /api/logs - Alle Logs abrufen
router.get('/', authenticateToken, (req, res) => {
  try {
    const category = req.query.category || null;
    const since = req.query.since || null;
    const limit = Math.min(Number(req.query.limit) || 500, 2000);

    const logs = db.listLogs({ category, since, limit });
    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Abrufen der Logs.' });
  }
});

// GET /api/logs/export - Logs als Text-Download
router.get('/export', authenticateToken, (req, res) => {
  try {
    const category = req.query.category || null;
    const since = req.query.since || null;
    const logs = db.listLogs({ category, since, limit: 5000 });

    const lines = logs.map(
      (l) => `[${l.created_at}] [${l.category}] ${l.title}${l.description ? ': ' + l.description : ''}`,
    );

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="windsmp-logs.txt"');
    return res.send(lines.join('\n'));
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Exportieren.' });
  }
});

// GET /api/logs/categories - Verfuegbare Kategorien
router.get('/categories', authenticateToken, (req, res) => {
  return res.json(['verify', 'team', 'payment', 'system', 'error', 'command']);
});

export default router;