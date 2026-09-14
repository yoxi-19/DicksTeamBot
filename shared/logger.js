// Variable: gekapselter Winston-Logger.
// Benutzersichtbare Meldungen werden auf Deutsch ausgegeben,
// interne Entwickler-Logs duerfen Englisch sein.

import winston from 'winston';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import eventBus from './events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.resolve(__dirname, '..', 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const level = process.env.LOG_LEVEL || 'info';

// Custom Transport: Sendet jede Log-Zeile live an Socket.IO-Clients
class DashboardTransport extends winston.Transport {
  log(info, callback) {
    setImmediate(() => {
      eventBus.emit('dashboard', {
        event: 'consoleLog',
        payload: {
          timestamp: new Date().toISOString(),
          level: info.level,
          message: info.message,
        },
      });
    });
    callback();
  }
}

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`),
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`),
);

const logger = winston.createLogger({
  level,
  format: fileFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new DashboardTransport(),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

export default logger;