// Variable: Stats-API - Bot-Status, Spieler- und Systeminformationen.

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import * as db from '../../database/index.js';
import configService from '../config.js';

const router = Router();

// GET /api/stats/overview - Übersichtsstatistiken
router.get('/overview', authenticateToken, (req, res) => {
  try {
    const mcStatus = bridgeInstance.getStatus();
    const users = db.listUsers();
    const applications = db.listApplications();
    const logs = db.listLogs({ limit: 10 });

    const memUsage = process.memoryUsage();

    const stats = {
      discord: {
        online: true,
        guildId: configService.env.discordGuildId,
      },
      minecraft: {
        online: mcStatus.isOnline,
        host: mcStatus.host,
        port: mcStatus.port,
        username: mcStatus.username,
        ping: mcStatus.ping,
        tps: mcStatus.tps,
        playerCount: mcStatus.playerCount,
        onlinePlayers: mcStatus.onlinePlayers,
      },
      system: {
        uptime: Math.floor(process.uptime()),
        ramHeapUsed: memUsage.heapUsed,
        ramHeapTotal: memUsage.heapTotal,
        ramRss: memUsage.rss,
        nodeVersion: process.version,
        platform: process.platform,
      },
      counts: {
        totalUsers: users.length,
        verified: users.filter((u) => u.status === 'verified' || u.status === 'team').length,
        teamMembers: users.filter((u) => u.status === 'team').length,
        unverified: users.filter((u) => u.status === 'unverified').length,
        online: users.filter((u) => u.is_online).length,
        pendingApplications: applications.filter((a) => a.status === 'pending').length,
      },
      recentLogs: logs.slice(0, 5),
    };

    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Abrufen der Statistiken.' });
  }
});

// GET /api/stats/minecraft - Minecraft-Status
router.get('/minecraft', authenticateToken, (req, res) => {
  try {
    return res.json(bridgeInstance.getStatus());
  } catch (err) {
    return res.status(500).json({ error: 'Fehler.' });
  }
});

export default router;