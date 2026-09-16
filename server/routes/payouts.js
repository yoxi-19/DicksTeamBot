// Variable: Auszahlungs-Route - Manuelle Auszahlungen vom Bank-Account.
// NUR Admins. Jede Auszahlung wird audit-loggt (DB + Dashboard + Discord-Kanal).

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import * as db from '../../database/index.js';
import { LogCategory } from '../../shared/types.js';
import { sanitizeIgn } from '../../shared/types.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import { getDiscordClient } from './services.js';
import { sendLogEmbed } from '../../discord/helpers.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';

const router = Router();

// Maximale Summe pro Auszahlung (Bank-Schutz, keine Einzel-Transaktion darüber)
const MAX_PAYOUT = 10_000_000;
// Wartezeit für Zustellkontrolle (Kick beim Senden möglich)
const DELIVERY_CHECK_MS = 15000;

// POST /api/payouts/withdraw - Zahlt Geld an einen Spieler aus
router.post('/withdraw', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cleanIgn = sanitizeIgn(req.body?.ign);
    const amount = Number(req.body?.amount);
    if (!cleanIgn) {
      return res.status(400).json({ error: 'Ungültiger Minecraft-Name.' });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Betrag muss eine positive ganze Zahl sein.' });
    }
    if (amount > MAX_PAYOUT) {
      return res.status(400).json({ error: `Maximal $${MAX_PAYOUT.toLocaleString('de-DE')} pro Auszahlung.` });
    }

    const sendTime = Date.now();
    const result = bridgeInstance.payout(cleanIgn, amount);
    if (!result.ok) {
      return res.status(502).json({ error: result.error });
    }

    // Zustellkontrolle: Kick kurz nach dem Senden = unklar ob angekommen
    await new Promise((resolve) => setTimeout(resolve, DELIVERY_CHECK_MS));
    const delivered = bridgeInstance.isConnected && (bridgeInstance.lastDisconnectAt || 0) < sendTime;

    const admin = req.user?.username || 'dashboard';
    const desc = `${admin} hat **$${amount.toLocaleString('de-DE')}** an **${cleanIgn}** ausgezahlt.` +
      (delivered ? '' : ' **Zustellung unklar (Disconnect nach Versand) – Kontostand prüfen!**');

    const entry = db.addLog({
      category: LogCategory.PAYMENT,
      title: delivered ? 'Manuelle Auszahlung' : 'Manuelle Auszahlung (unklar)',
      description: desc,
    });
    eventBus.emitToDashboard('logUpdate', entry);
    eventBus.emitToDashboard('paymentUpdate', db.listPayments({ limit: 200 }));

    const client = getDiscordClient();
    if (client) {
      await sendLogEmbed(client, {
        category: LogCategory.PAYMENT,
        title: delivered ? 'Manuelle Auszahlung' : 'Manuelle Auszahlung (unklar)',
        description: desc,
        color: delivered ? 'success' : 'error',
      }).catch((err) => logger.warn(`[Payout] Discord-Log fehlgeschlagen: ${err.message}`));
    }

    logger.info(`[Payout] ${admin}: $${amount} an ${cleanIgn} (delivered=${delivered})`);
    return res.json({ ok: true, delivered, ign: cleanIgn, amount });
  } catch (err) {
    logger.error(`[Payout] Fehler: ${err.message}`);
    return res.status(500).json({ error: 'Auszahlung fehlgeschlagen.' });
  }
});

export default router;
