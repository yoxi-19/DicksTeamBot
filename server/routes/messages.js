// Variable: Nachrichten-Route - Chat-Verlauf und Live-Nachrichten.

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../../database/index.js';

const router = Router();

// GET /api/messages - Nachrichten abrufen
router.get('/', authenticateToken, (req, res) => {
  try {
    const category = req.query.category || null;
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    let messages = db.listMessages(limit);

    if (category) {
      messages = messages.filter((m) => m.category === category);
    }

    return res.json(messages);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Abrufen der Nachrichten.' });
  }
});

// GET /api/messages/categories - Verfuegbare Kategorien
router.get('/categories', authenticateToken, (req, res) => {
  return res.json(['chat', 'system', 'payment', 'command', 'error', 'joinLeave', 'private', 'other']);
});

export default router;