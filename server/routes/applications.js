// Variable: Bewerbungs-Route - Team-Bewerbungen verwalten.

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../../database/index.js';
import { ApplicationStatus } from '../../shared/types.js';
import { reviewApplication } from '../../discord/teamService.js';
import eventBus from '../../shared/events.js';

const router = Router();

// GET /api/applications - Alle Bewerbungen abrufen
router.get('/', authenticateToken, (req, res) => {
  try {
    const status = req.query.status || null;
    const apps = db.listApplications(status);
    return res.json(apps);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Abrufen der Bewerbungen.' });
  }
});

// GET /api/applications/:id - Einzelne Bewerbung
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const app = db.findApplicationById(Number(req.params.id));
    if (!app) {
      return res.status(404).json({ error: 'Bewerbung nicht gefunden.' });
    }
    return res.json(app);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler.' });
  }
});

// POST /api/applications/:id/review - Bewerbung annehmen/ablehnen
router.post('/:id/review', authenticateToken, async (req, res) => {
  try {
    const { decision } = req.body; // 'accepted' oder 'rejected'
    const applicationId = Number(req.params.id);

    if (!decision || !['accepted', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision muss "accepted" oder "rejected" sein.' });
    }

    const app = db.findApplicationById(applicationId);
    if (!app) {
      return res.status(404).json({ error: 'Bewerbung nicht gefunden.' });
    }
    if (app.status !== ApplicationStatus.PENDING) {
      return res.status(400).json({ error: 'Diese Bewerbung wurde bereits bearbeitet.' });
    }

    // Review mit dem Discord-Client ausfuehren (wenn verfuegbar)
    // Falls kein Client verfuegbar (nur API), manuell aktualisieren.
    const reviewedBy = req.user?.username || 'dashboard';
    db.updateApplicationStatus(applicationId, decision === 'accepted' ? ApplicationStatus.ACCEPTED : ApplicationStatus.REJECTED, reviewedBy);
    // Alle offenen Dashboards sofort aktualisieren, nicht erst beim Reconnect.
    eventBus.emitToDashboard('teamUpdate', db.listApplications());

    return res.json({ ok: true, message: `Bewerbung wurde ${decision === 'accepted' ? 'angenommen' : 'abgelehnt'}.` });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler bei der Bearbeitung.' });
  }
});

export default router;
