// Variable: Socket.IO-Handler.
// Verbindet Dashboard-Clients mit Live-Daten via WebSocket.
// Nur verbundene Clients mit gueltigem Token erhalten Events.

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import configService from '../config.js';
import eventBus from '../../shared/events.js';
import * as db from '../../database/index.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import { getStatus as getServicesStatus } from '../routes/services.js';
import logger from '../../shared/logger.js';

let io = null;

/**
 * Initialisiert den Socket.IO-Server auf dem Express-Server.
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocket(httpServer) {
  const corsOrigin = configService.env.dashboardUrl || 'http://localhost:5173';

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // Auth-Middleware fuer Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Kein Token bereitgestellt.'));
    }

    const secret = configService.env.sessionSecret;
    try {
      const decoded = jwt.verify(token, secret);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Ungueltiger Token.'));
    }
  });

  // Verbindungshandling
  io.on('connection', (socket) => {
    logger.info(`[Socket.IO] Client verbunden: ${socket.id} (${socket.user?.username || 'unbekannt'})`);

    // Initiale Daten senden
    sendInitialData(socket);

    // Dashboard-Events weiterleiten
    socket.on('disconnect', () => {
      logger.debug(`[Socket.IO] Client getrennt: ${socket.id}`);
    });

    // Anfragen fuer sofortige Updates
    socket.on('requestStats', () => {
      try {
        socket.emit('statsUpdate', getDashboardStats());
      } catch (err) {
        logger.error(`[Socket.IO] Fehler bei statsUpdate: ${err.message}`);
      }
    });

    socket.on('requestPlayers', () => {
      try {
        socket.emit('playerUpdate', db.listUsers());
      } catch (err) {
        logger.error(`[Socket.IO] Fehler bei playerUpdate: ${err.message}`);
      }
    });

    socket.on('requestLogs', (opts) => {
      try {
        const logs = db.listLogs(opts || {});
        socket.emit('logUpdate', logs);
      } catch (err) {
        logger.error(`[Socket.IO] Fehler bei logUpdate: ${err.message}`);
      }
    });

    socket.on('requestServices', () => {
      try {
        socket.emit('servicesUpdate', getServicesStatus());
      } catch (err) {
        logger.error(`[Socket.IO] Fehler bei servicesUpdate: ${err.message}`);
      }
    });
  });

  // Event-Bus abonnieren und an alle Clients weiterleiten
  eventBus.on('dashboard', ({ event, payload }) => {
    if (io) {
      io.emit(event, payload);
    }
  });

  // Regulaere Status-Updates (alle 5 Sekunden)
  setInterval(() => {
    if (io) {
      io.emit('statsUpdate', getDashboardStats());
    }
  }, 5000);

  logger.info('[Socket.IO] Initialisiert.');
  return io;
}

/**
 * Sendet initiale Daten an einen neu verbundenen Client.
 * @param {import('socket.io').Socket} socket
 */
function sendInitialData(socket) {
  try {
    // Statistiken
    socket.emit('statsUpdate', getDashboardStats());

    // Spieler
    socket.emit('playerUpdate', db.listUsers());

    // Letzte Nachrichten
    const messages = db.listMessages(200);
    socket.emit('chatMessage', messages);

    // Letzte Logs
    const logs = db.listLogs({ limit: 100 });
    socket.emit('logUpdate', logs);

    // Bewerbungen
    const apps = db.listApplications();
    socket.emit('teamUpdate', apps);

    // Service-Status
    socket.emit('servicesUpdate', getServicesStatus());
  } catch (err) {
    logger.error(`[Socket.IO] Fehler beim Senden initiale Daten: ${err.message}`);
  }
}

function getDashboardStats() {
  const memory = process.memoryUsage();
  const users = db.listUsers();
  const applications = db.listApplications();
  return {
    discord: { online: true },
    minecraft: bridgeInstance.getStatus(),
    system: {
      uptime: Math.floor(process.uptime()),
      ramHeapUsed: memory.heapUsed,
      ramHeapTotal: memory.heapTotal,
      ramRss: memory.rss,
    },
    counts: {
      totalUsers: users.length,
      verified: users.filter((user) => user.status === 'verified').length,
      teamMembers: users.filter((user) => user.status === 'team').length,
      unverified: users.filter((user) => user.status === 'unverified').length,
      online: users.filter((user) => user.is_online).length,
      pendingApplications: applications.filter((app) => app.status === 'pending').length,
    },
    recentLogs: db.listLogs({ limit: 5 }),
    services: getServicesStatus(),
  };
}

/**
 * Gibt die Socket.IO-Instanz zurueck.
 * @returns {Server|null}
 */
export function getIO() {
  return io;
}

export default { initSocket, getIO };
