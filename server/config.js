// Variable: Konfigurationssystem (Hybrid).
// - Geheimnisse/statische Werte: .env
// - Regex/IDs/Farben/Laufzeit-Werte: SQLite (settings Tabelle)
// - Standardwerte beim ersten Start: DEFAULT_SETTINGS aus shared/types.js
// Das System unterstuetzt Hot-Reload: geaenderte Einstellungen werden via Event weitergegeben.

import { EventEmitter } from 'node:events';
import { DEFAULT_SETTINGS, SETTING_KEYS, sanitizeIgn, validateRegex } from '../shared/types.js';
import * as db from '../database/index.js';
import logger from '../shared/logger.js';

const SETTINGS_PREFIX = 'setting:';

class ConfigService extends EventEmitter {
  constructor() {
    super();
    /** @type {Record<string, unknown>} */
    this.cache = {};
    /** @type {object} */
    this.env = {};
    this._loaded = false;
    this.setMaxListeners(50);
  }

  /**
   * Laedt die Konfiguration und seedet Standardwerte bei fehlenden Schluesseln.
   */
  load() {
    this._ensureDefaultsSeeded();

    // Lade alle Einstellungen in den Cache.
    this._reloadCache();

    // Lade -env-Werte als unveraenderliche Basis.
    this.env = {
      discordToken: process.env.DISCORD_TOKEN || '',
      discordGuildId: process.env.DISCORD_GUILD_ID || '',
      discordClientId: process.env.DISCORD_CLIENT_ID || '',
      minecraftHost: process.env.MINECRAFT_HOST || 'localhost',
      minecraftPort: Number(process.env.MINECRAFT_PORT || 25565),
      minecraftUsername: process.env.MINECRAFT_USERNAME || 'WindBot',
      minecraftPassword: process.env.MINECRAFT_PASSWORD || '',
      minecraftAuth: process.env.MINECRAFT_AUTH || 'microsoft',
      minecraftVersion: process.env.MINECRAFT_VERSION || '',
      minecraftProfilesFolder: process.env.MINECRAFT_PROFILES_FOLDER || '',
      port: Number(process.env.PORT || 3000),
      dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:5173',
      sessionSecret: process.env.SESSION_SECRET || '',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
      databasePath: process.env.DATABASE_PATH || './database/windsmp.sqlite',
      adminUser: process.env.DASHBOARD_ADMIN_USER || 'admin',
      adminPassword: process.env.DASHBOARD_ADMIN_PASSWORD || 'admin123',
      logLevel: process.env.LOG_LEVEL || 'info',
    };

    this._loaded = true;
    logger.info(`[Config] Konfiguration geladen (${Object.keys(this.cache).length} Einstellungen).`);
    this.emit('reload', this.getAll());
  }

  _reloadCache() {
    const all = db.listSettings();
    this.cache = {};
    for (const key of SETTING_KEYS) {
      const value = all[`${SETTINGS_PREFIX}${key}`];
      // Nur bekannte Schluessel uebernehmen, fehlende mit Defaults ueberschreiben.
      this.cache[key] = value !== undefined ? value : DEFAULT_SETTINGS[key];
    }
  }

  _ensureDefaultsSeeded() {
    // Seedet fehlende Standardwerte (idempotent).
    for (const key of SETTING_KEYS) {
      const existing = db.getSetting(`${SETTINGS_PREFIX}${key}`, undefined);
      if (existing === undefined && DEFAULT_SETTINGS[key] !== undefined) {
        db.setSetting(`${SETTINGS_PREFIX}${key}`, DEFAULT_SETTINGS[key]);
      }
    }
  }

  /**
   * Gibt einen einzelnen Konfigurationswert zurueck.
   * @param {string} key
   * @param {unknown} fallback
   * @returns {unknown}
   */
  get(key, fallback = null) {
    if (!this._loaded) return fallback;
    return key in this.cache ? this.cache[key] : fallback;
  }

  /**
   * Gibt die komplette Konfiguration als tiefe Kopie zurueck.
   * @returns {Record<string, unknown>}
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.cache));
  }

  /**
   * Aktualisiert einen oder mehrere Einstellungen mit Validierung.
   * @param {Record<string, unknown>} updates
   * @returns {{ ok: boolean, errors: string[] }}
   */
  update(updates) {
    const errors = [];
    const toWrite = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!SETTING_KEYS.includes(key)) {
        errors.push(`Unbekannte Einstellung: ${key}`);
        continue;
      }
      const validationError = this._validateSetting(key, value);
      if (validationError) {
        errors.push(`${key}: ${validationError}`);
        continue;
      }
      toWrite[key] = value;
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    for (const [key, value] of Object.entries(toWrite)) {
      db.setSetting(`${SETTINGS_PREFIX}${key}`, value);
      this.cache[key] = value;
    }

    if (Object.keys(toWrite).length > 0) {
      logger.info(`[Config] ${Object.keys(toWrite).length} Einstellung(en) aktualisiert.`);
      this.emit('reload', this.getAll());
    }

    return { ok: true, errors: [] };
  }

  /**
   * Validiert einen einzelnen Einstellungswert.
   * @param {string} key
   * @param {unknown} value
   * @returns {string|null}
   */
  _validateSetting(key, value) {
    switch (key) {
      case 'roleVerified':
      case 'roleTeam':
      case 'roleJoin':
      case 'roleAdmin':
      case 'channelLogs':
      case 'channelVerify':
      case 'channelTeam':
        // IDs koennen leer oder eine Snowflake sein.
        if (value !== '' && value !== null && !/^\d{15,20}$/.test(String(value))) {
          return 'Muss leer oder eine gueltige ID (Snowflake) sein.';
        }
        return null;
      case 'colors':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt mit Hex-Farben sein.';
        for (const [colorKey, colorVal] of Object.entries(value)) {
          if (!/^[0-9a-fA-F]{6}$/.test(String(colorVal))) {
            return `Farbe "${colorKey}" muss ein Hex-Wert (6 Zeichen) ohne '#' sein.`;
          }
        }
        return null;
      case 'verify':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt sein.';
        if (value.codeTtlMs !== undefined && (typeof value.codeTtlMs !== 'number' || value.codeTtlMs < 1000)) {
          return 'codeTtlMs muss eine Zahl >= 1000 sein.';
        }
        if (value.codeLength !== undefined && (typeof value.codeLength !== 'number' || value.codeLength < 4 || value.codeLength > 12)) {
          return 'codeLength muss zwischen 4 und 12 liegen.';
        }
        return null;
      case 'team':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt sein.';
        return null;
      case 'timeouts':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt sein.';
        return null;
      case 'patterns':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt mit Regex-Strings sein.';
        for (const [patternKey, patternVal] of Object.entries(value)) {
          if (typeof patternVal !== 'string') {
            return `Muster "${patternKey}" muss ein String sein.`;
          }
          const regexError = validateRegex(patternVal);
          if (regexError) {
            return `Muster "${patternKey}" ist kein gueltiger Regex: ${regexError}`;
          }
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * Gibt die aktuellen Regex-Muster als kompilierte RegExp-Objekte zurueck.
   * @returns {Record<string, RegExp>}
   */
  getCompiledPatterns() {
    const patterns = this.get('patterns', {});
    const out = {};
    for (const [key, source] of Object.entries(patterns)) {
      try {
        out[key] = new RegExp(source);
      } catch {
        out[key] = /(?!x)x/; // never matches
      }
    }
    return out;
  }

  /**
   * Gibt die Farben zurueck.
   * @returns {Record<string, string>}
   */
  getColors() {
    return this.get('colors', DEFAULT_SETTINGS.colors);
  }

  /**
   * Liefert eine Rollen-ID als String (leer wenn nicht gesetzt).
   * @param {string} which 'roleVerified' | 'roleTeam' | 'roleJoin' | 'roleAdmin'
   * @returns {string}
   */
  getRoleId(which) {
    const v = this.get(which, '');
    return v ? String(v) : '';
  }

  /**
   * Liefert eine Channel-ID als String.
   * @param {string} which 'channelLogs' | 'channelVerify' | 'channelTeam'
   * @returns {string}
   */
  getChannelId(which) {
    const v = this.get(which, '');
    return v ? String(v) : '';
  }
}

export const configService = new ConfigService();

// Re-export fuer bequemen Zugriff.
export { sanitizeIgn };

export default configService;