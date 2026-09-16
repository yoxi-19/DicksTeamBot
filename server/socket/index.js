// Variable: Socket.IO-Handler.
// Verbindet Dashboard-Clients mit Live-Daten via WebSocket.
// Nur verbundene Clients mit gültigem Token erhalten Events.

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import configService from '../config.js';
import eventBus from '../../shared/events.js';
import * as db from '../../database/index.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import { getStatus as getServicesStatus } from '../routes/services.js';
import logger from '../../shared/logger.js';

let io = null;

// In-Memory-Verlauf der Console-Logs (nur für die Anzeige, kein Persistenz-
// Anspruch – nach einem Neustart beginnt er neu, mit Restart-Marker).
const consoleHistory = [];
const CONSOLE_HISTORY_LIMIT = 500;

function bufferConsoleLog(entry) {
  consoleHistory.push(entry);
  if (consoleHistory.length > CONSOLE_HISTORY_LIMIT) {
    consoleHistory.splice(0, consoleHistory.length - CONSOLE_HISTORY_LIMIT);
  }
}

/**
 * Legt einen Eintrag in den Console-Verlauf und sendet ihn live an alle Clients.
 * @param {object} entry { timestamp, level, message }
 */
export function pushConsoleLog(entry) {
  bufferConsoleLog(entry);
  if (io) {
    io.emit('consoleLog', entry);
  }
}

/**
 * Markiert einen (Neu-)Start des Servers im Console-Verlauf.
 */
export function markConsoleRestart() {
  pushConsoleLog({
    timestamp: new Date().toISOString(),
    level: 'warn',
    message: '------------------ RESTART ------------------',
  });
}

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

  // Auth-Middleware für Socket.IO
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
      return next(new Error('Ungültiger Token.'));
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

    // Anfragen für sofortige Updates
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

    socket.on('requestBankBalance', () => {
      try {
        bridgeInstance.queryBankBalance();
      } catch (err) {
        logger.error(`[Socket.IO] Fehler bei Bankstand-Abfrage: ${err.message}`);
      }
    });
  });

  // Event-Bus abonnieren und an alle Clients weiterleiten
  eventBus.on('dashboard', ({ event, payload }) => {
    if (io) {
      // Console-Logs zusätzlich puffern, damit später geoeffnete
      // Console-Seiten den Verlauf sehen
      if (event === 'consoleLog' && payload && typeof payload === 'object') {
        bufferConsoleLog(payload);
      }
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

    // Console-Verlauf (In-Memory, mit Restart-Markern)
    socket.emit('consoleLog', [...consoleHistory]);

    // Bewerbungen
    const apps = db.listApplications();
    socket.emit('teamUpdate', apps);

    // Service-Status
    socket.emit('servicesUpdate', getServicesStatus());

    // Payments
    socket.emit('paymentUpdate', db.listPayments({ limit: 200 }));
  } catch (err) {
    logger.error(`[Socket.IO] Fehler beim Senden initiale Daten: ${err.message}`);
  }
}

function getDashboardStats() {
  const memory = process.memoryUsage();
  const users = db.listUsers();
  const applications = db.listApplications();
  const payments = db.listPayments({ limit: 10000 });
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
      verified: users.filter((user) => user.status === 'verified' || user.status === 'team').length,
      teamMembers: users.filter((user) => user.status === 'team').length,
      unverified: users.filter((user) => user.status === 'unverified').length,
      waitingPayment: users.filter((user) => user.status === 'waiting_payment').length,
      online: users.filter((user) => user.is_online).length,
      pendingApplications: applications.filter((app) => app.status === 'pending').length,
      pendingPayments: payments.filter((p) => p.status === 'pending').length,
      confirmedPayments: payments.filter((p) => p.status === 'confirmed').length,
    },
    recentLogs: db.listLogs({ limit: 5 }),
    services: getServicesStatus(),
  };
}

/**
 * Gibt die Socket.IO-Instanz zurück.
 * @returns {Server|null}
 */
export function getIO() {
  return io;
}

export default { initSocket, getIO, pushConsoleLog, markConsoleRestart };
