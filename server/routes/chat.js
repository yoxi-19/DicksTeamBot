import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import * as db from '../../database/index.js';

const router = Router();

// POST /api/chat/send - Nachricht an Minecraft-Server senden
router.post(
  '/send',
  authenticateToken,
  rateLimit({ windowMs: 10000, max: 10, message: 'Zu viele Nachrichten. Bitte warte 10 Sekunden.' }),
  async (req, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Nachricht darf nicht leer sein.' });
      }

      if (message.length > 256) {
        return res.status(400).json({ error: 'Nachricht ist zu lang (max. 256 Zeichen).' });
      }

      const trimmed = message.trim();
      const sent = trimmed.startsWith('/')
        ? bridgeInstance.sendCommand(trimmed)
        : bridgeInstance.sendMessage(trimmed);

      if (!sent) {
        return res.status(503).json({ error: 'Minecraft ist nicht verbunden. Die Nachricht wurde nicht gesendet.' });
      }

      logger.info(`[Chat] ${req.user.username} sendet: ${trimmed}`);
      const record = db.addMessage({
        category: trimmed.startsWith('/') ? 'command' : 'chat',
        content: trimmed,
        author: `Dashboard · ${req.user.username}`,
      });
      const chatMessage = { ...record, createdAt: record.created_at };
      eventBus.emitToDashboard('chatMessage', chatMessage);
      return res.json({ ok: true, message: chatMessage });
    } catch (err) {
      logger.error(`[Chat] Fehler: ${err.message}`);
      return res.status(500).json({ error: 'Interner Serverfehler.' });
    }
  },
);

export default router;
