// Variable: Payment-API-Routen.
// Stellt Endpunkte für die Payment-Verwaltung bereit.

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import * as db from '../../database/index.js';
import { PlayerStatus, LogCategory } from '../../shared/types.js';
import { cancelRefund, consumePendingPaymentConfirm } from '../../discord/paymentService.js';
import { getDiscordClient } from './services.js';
import { sendLogEmbed } from '../../discord/helpers.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';

const router = Router();

/**
 * GET /api/payments - Alle Payments abrufen (mit optionalem Status-Filter).
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, limit } = req.query;
    const payments = db.listPayments({
      status: status || null,
      limit: limit ? parseInt(limit, 10) : 200,
    });
    return res.json(payments);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/payments/stats/overview - Statistiken.
 */
router.get('/stats/overview', authenticateToken, (req, res) => {
  try {
    const all = db.listPayments({ limit: 10000 });
    const pending = all.filter((p) => p.status === 'pending').length;
    const confirmed = all.filter((p) => p.status === 'confirmed').length;
    const failed = all.filter((p) => p.status === 'failed').length;
    const timeout = all.filter((p) => p.status === 'timeout').length;
    const totalAmount = all
      .filter((p) => p.status === 'confirmed')
      .reduce((sum, p) => sum + p.amount, 0);

    return res.json({ pending, confirmed, failed, timeout, total: all.length, totalAmount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/payments/:id - Einzelnes Payment abrufen.
 * Muss nach den festen Unterrouten stehen.
 */
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Ungültige Payment-ID.' });
    const payment = db.findPaymentById(id);
    if (!payment) return res.status(404).json({ error: 'Payment nicht gefunden.' });
    return res.json(payment);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler.' });
  }
});

/**
 * POST /api/payments/:id/cancel - Zahlungsablauf abbrechen (nur Admin).
 * - pending -> failed, User zurück auf verifiziert (kann neu starten),
 *   Timer und ausstehende Erfolgsmeldungen werden storniert.
 * - refunding -> zurück auf confirmed (Admin übernimmt Verantwortung,
 *   Geldfluss bitte manuell prüfen), Timer werden storniert.
 */
router.post('/:id/cancel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Ungültige Payment-ID.' });
    const payment = db.findPaymentById(id);
    if (!payment) return res.status(404).json({ error: 'Payment nicht gefunden.' });

    const admin = req.user?.username || 'dashboard';
    let updated = null;
    let title = '';
    let description = '';

    if (payment.status === 'pending') {
      updated = db.updatePaymentStatus(id, 'failed');
      cancelRefund(payment.discord_id);
      consumePendingPaymentConfirm(payment.discord_id);
      const user = db.findUserByDiscord(payment.discord_id);
      if (user && user.status === PlayerStatus.WAITING_PAYMENT) {
        db.upsertUser({ discord_id: payment.discord_id, status: PlayerStatus.VERIFIED });
      }
      title = 'Zahlung abgebrochen';
      description = `Payment #${id} (**${payment.ign}**, $${Number(payment.amount).toLocaleString('de-DE')}) von ${admin} abgebrochen. User kann neu starten.`;
    } else if (payment.status === 'refunding') {
      updated = db.updatePaymentStatus(id, 'confirmed');
      cancelRefund(payment.discord_id);
      consumePendingPaymentConfirm(payment.discord_id);
      title = 'Refund abgebrochen';
      description = `Refund für Payment #${id} (**${payment.ign}**, $${Number(payment.amount).toLocaleString('de-DE')}) von ${admin} gestoppt – zurück auf bestätigt. Geldfluss bitte manuell prüfen!`;
    } else {
      return res.status(400).json({ error: `Nur ausstehende oder laufende Refunds können abgebrochen werden (Status: ${payment.status}).` });
    }

    const entry = db.addLog({ category: LogCategory.PAYMENT, title, description });
    eventBus.emitToDashboard('logUpdate', entry);
    eventBus.emitToDashboard('paymentUpdate', db.listPayments({ limit: 200 }));
    eventBus.emitToDashboard('playerUpdate', db.listUsers());

    const client = getDiscordClient();
    if (client) {
      await sendLogEmbed(client, {
        category: LogCategory.PAYMENT,
        title,
        description,
        color: 'warning',
      }).catch((err) => logger.warn(`[Payments] Discord-Log fehlgeschlagen: ${err.message}`));
    }

    logger.info(`[Payments] ${title}: #${id} durch ${admin}`);
    return res.json({ ok: true, payment: updated });
  } catch (err) {
    logger.error(`[Payments] Abbruch fehlgeschlagen: ${err.message}`);
    return res.status(500).json({ error: 'Abbruch fehlgeschlagen.' });
  }
});

export default router;
