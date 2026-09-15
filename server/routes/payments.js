// Variable: Payment-API-Routen.
// Stellt Endpunkte fuer die Payment-Verwaltung bereit.

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../../database/index.js';

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
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Ungueltige Payment-ID.' });
    const payment = db.findPaymentById(id);
    if (!payment) return res.status(404).json({ error: 'Payment nicht gefunden.' });
    return res.json(payment);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
