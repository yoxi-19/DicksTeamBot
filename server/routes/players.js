// Variable: Spieler-Route - CRUD fuer Benutzerdaten.

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import * as db from '../../database/index.js';
import { sanitizeIgn } from '../../shared/types.js';
import eventBus from '../../shared/events.js';
import { getDiscordClient } from './services.js';
import { unlink } from '../../discord/verifyService.js';
import { cancelRefund } from '../../discord/paymentService.js';

const router = Router();

// GET /api/players - Alle Spieler auflisten
router.get('/', authenticateToken, (req, res) => {
  try {
    const users = db.listUsers();
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Abrufen der Spieler.' });
  }
});

// GET /api/players/discord/:discordId - Spieler nach Discord-ID
router.get('/discord/:discordId', authenticateToken, (req, res) => {
  try {
    const user = db.findUserByDiscord(req.params.discordId);
    if (!user) {
      return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    }
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler.' });
  }
});

// GET /api/players/ign/:ign - Spieler nach Minecraft-Name
router.get('/ign/:ign', authenticateToken, (req, res) => {
  try {
    const user = db.findUserByIgn(req.params.ign);
    if (!user) {
      return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    }
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler.' });
  }
});

// GET /api/players/:id - Einzelnen Spieler abrufen (nach den spezifischen Routen)
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Ungueltige Spieler-ID.' });
    const user = db.findUserById(id);
    if (!user) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler.' });
  }
});

// PATCH /api/players/:id - Spieler aktualisieren (nur Admin)
router.patch('/:id', authenticateToken, (req, res) => {
  try {
    const existing = db.findUserById(Number(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    }

    const updates = {};
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.team !== undefined) updates.team = req.body.team;
    if (req.body.is_online !== undefined) updates.is_online = req.body.is_online ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Keine gueltigen Felder zum Aktualisieren.' });
    }

    updates.discord_id = existing.discord_id;
    updates.ign = existing.ign;
    db.upsertUser(updates);

    const updated = db.findUserById(Number(req.params.id));
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Aktualisieren.' });
  }
});

// POST /api/players/:id/unlink - Verknuepfung entfernen (nur Admin)
// Entfernt Rollen + Nickname im Discord, storniert Timer und loggt alles.
router.post('/:id/unlink', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Ungueltige Spieler-ID.' });
    const existing = db.findUserById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    }
    if (!existing.ign) {
      return res.status(400).json({ error: 'Spieler ist nicht verknuepft.' });
    }

    // Laufende Timer stornieren, damit nichts mehr nachtraeglich passiert.
    cancelRefund(existing.discord_id);
    db.invalidateCodesForUser(existing.discord_id);

    const client = getDiscordClient();
    let message;
    if (client) {
      const result = await unlink(client, existing.discord_id);
      if (!result.ok) {
        return res.status(400).json({ error: result.message });
      }
      message = result.message;
    } else {
      // Discord offline: nur DB zuruecksetzen + loggen.
      const ign = existing.ign;
      db.unlinkUser(existing.discord_id);
      const entry = db.addLog({
        category: 'verify',
        title: 'Verknuepfung entfernt (Dashboard)',
        description: `${existing.discord_id} wurde von **${ign}** getrennt (Discord offline, nur DB).`,
      });
      eventBus.emitToDashboard('logUpdate', entry);
      eventBus.emitToDashboard('playerUpdate', db.listUsers());
      message = `Verknuepfung zu ${ign} wurde entfernt.`;
    }

    return res.json({ ok: true, message });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Entfernen der Verknuepfung.' });
  }
});

export default router;
