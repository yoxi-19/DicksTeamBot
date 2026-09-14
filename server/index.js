// Variable: Hauptserver - Team DICKS TeamBot.
// Verbindet Express, Socket.IO, Discord-Bot und Minecraft-Bridge in einem Prozess.

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// Interne Module
import logger from '../shared/logger.js';
import { initDatabase, closeDatabase } from '../database/index.js';
import configService from './config.js';
import { initSocket } from './socket/index.js';
import { DiscordBot } from '../discord/bot.js';
import { bridgeInstance } from '../minecraft/index.js';
import { afkManager } from '../minecraft/afkManager.js';

// Routen
import authRoutes from './routes/auth.js';
import statsRoutes from './routes/stats.js';
import playerRoutes from './routes/players.js';
import applicationRoutes from './routes/applications.js';
import logRoutes from './routes/logs.js';
import settingRoutes from './routes/settings.js';
import messageRoutes from './routes/messages.js';
import chatRoutes from './routes/chat.js';
import serviceRoutes, { setInstances } from './routes/services.js';
import afkRoutes from './routes/afk.js';

// Middleware
import { rateLimit } from './middleware/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

async function main() {
  logger.info('========================================');
  logger.info('  Team DICKS TeamBot wird gestartet...');
  logger.info('========================================');

  // 1. Datenbank initialisieren
  const dbPath = process.env.DATABASE_PATH || './database/windsmp.sqlite';
  initDatabase(dbPath);

  // 2. Konfiguration laden
  configService.load();

  // 3. Express-App erstellen
  const app = express();

  // Security
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: configService.env.dashboardUrl || 'http://localhost:5173',
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Rate-Limit auf alle API-Routen
  app.use('/api', rateLimit({ windowMs: 60000, max: 100 }));

  // 4. API-Routen
  app.use('/api/auth', authRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/logs', logRoutes);
  app.use('/api/settings', settingRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/afk', afkRoutes);

  // Health-Check
  app.get('/api/health', (req, res) => {
    return res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Statische Dateien aus Dashboard-Build ausliefern
  const dashboardDist = path.resolve(__dirname, '..', 'dashboard', 'dist');
  if (fs.existsSync(dashboardDist)) {
    app.use(express.static(dashboardDist));
    // SPA-Fallback: Alle nicht-API-Routen auf index.html leiten
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(dashboardDist, 'index.html'));
      }
    });
  }

  // 5. HTTP-Server und Socket.IO
  const httpServer = createServer(app);
  initSocket(httpServer);

  // 6. HTTP-Server starten
  httpServer.listen(PORT, () => {
    logger.info(`[Server] HTTP-Server laeuft auf Port ${PORT}`);
    logger.info(`[Server] Dashboard-URL: ${configService.env.dashboardUrl}`);
  });

  // 7. Discord-Bot starten
  const discordBot = new DiscordBot();
  const discordStarted = await discordBot.start();

  // Instanzen fuer Services-API registrieren
  setInstances(discordBot, bridgeInstance);

  if (discordStarted) {
    // Bridge mit Discord-Client verknüpfen, wenn Bot bereit ist
    const client = discordBot.getClient();
    if (client) {
      client.once('ready', () => {
        bridgeInstance.setDiscordClient(client);
        logger.info('[Server] Minecraft-Bridge mit Discord-Client verknüpft.');
      });
    }
  }

  // 8. Minecraft-Bridge starten
  bridgeInstance.start();

  // 8b. AFK-Bots starten
  afkManager.loadFromConfig();

  // 9. Graceful Shutdown
  const shutdown = (signal) => {
    logger.info(`[Server] ${signal} empfangen. Herunterfahren...`);
    discordBot.stop();
    bridgeInstance.stop();
    afkManager.stopAll();
    httpServer.close(() => {
      closeDatabase();
      logger.info('[Server] Sauber heruntergefahren.');
      process.exit(0);
    });

    // Timeout fuer erzwungenes Beenden
    setTimeout(() => {
      logger.error('[Server] Timeout beim Herunterfahren. Erzwinge Beenden.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error(`[Server] Uncaught Exception: ${err.message}`);
    logger.error(err.stack);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`[Server] Unhandled Rejection: ${reason}`);
  });
}

main().catch((err) => {
  logger.error(`[Server] Startfehler: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});