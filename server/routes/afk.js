import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { afkManager } from '../../minecraft/afkManager.js';
import configService from '../config.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';

const router = Router();

// GET /api/afk - Alle AFK-Accounts anzeigen
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const configAccounts = configService.get('afkAccounts', []);
  const liveStatus = afkManager.getAllStatus();

  const merged = configAccounts.map((acc) => {
    const live = liveStatus.find((l) => l.username === acc.username);
    return {
      username: acc.username,
      enabled: acc.enabled !== false,
      connected: live?.connected || false,
    };
  });

  return res.json({ accounts: merged });
});

// POST /api/afk/add - AFK-Account hinzufuegen
router.post('/add', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username erforderlich.' });
    }

    const cleaned = username.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(cleaned)) {
      return res.status(400).json({ error: 'Ungültiger Minecraft-Name (3-16 Zeichen, alphanumerisch).' });
    }

    const accounts = configService.get('afkAccounts', []);
    if (accounts.some((a) => a.username === cleaned)) {
      return res.status(400).json({ error: `${cleaned} ist bereits hinzugefuegt.` });
    }

    accounts.push({ username: cleaned, enabled: true });
    configService.update({ afkAccounts: accounts });

    afkManager.addBot(cleaned, { enabled: true });

    logger.info(`[AFK] Account hinzugefuegt: ${cleaned}`);
    eventBus.emitToDashboard('afkUpdate', { username: cleaned, enabled: true, connected: false });

    return res.json({ ok: true, message: `${cleaned} hinzugefuegt und gestartet.` });
  } catch (err) {
    logger.error(`[AFK] Fehler beim Hinzufuegen: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/afk/remove - AFK-Account entfernen
router.post('/remove', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username erforderlich.' });
    }

    let accounts = configService.get('afkAccounts', []);
    const found = accounts.some((a) => a.username === username);
    if (!found) {
      return res.status(404).json({ error: `${username} nicht gefunden.` });
    }

    accounts = accounts.filter((a) => a.username !== username);
    configService.update({ afkAccounts: accounts });

    afkManager.removeBot(username);

    logger.info(`[AFK] Account entfernt: ${username}`);
    eventBus.emitToDashboard('afkRemove', { username });

    return res.json({ ok: true, message: `${username} entfernt.` });
  } catch (err) {
    logger.error(`[AFK] Fehler beim Entfernen: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/afk/toggle - AFK-Account an/aus
router.post('/toggle', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username erforderlich.' });
    }

    const accounts = configService.get('afkAccounts', []);
    const account = accounts.find((a) => a.username === username);
    if (!account) {
      return res.status(404).json({ error: `${username} nicht gefunden.` });
    }

    account.enabled = !account.enabled;
    configService.update({ afkAccounts: accounts });

    afkManager.toggleBot(username);

    const status = account.enabled ? 'aktiviert' : 'deaktiviert';
    logger.info(`[AFK] ${username} ${status}`);

    return res.json({ ok: true, enabled: account.enabled, message: `${username} ${status}.` });
  } catch (err) {
    logger.error(`[AFK] Fehler beim Togglen: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
