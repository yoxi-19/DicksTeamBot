// Variable: Konfigurationssystem (Hybrid).
// - Geheimnisse/statische Werte: .env
// - Regex/IDs/Farben/Laufzeit-Werte: SQLite (settings Tabelle)
// - Standardwerte beim ersten Start: DEFAULT_SETTINGS aus shared/types.js
// Das System unterstuetzt Hot-Reload: geänderte Einstellungen werden via Event weitergegeben.

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
      minecraftUsername: process.env.MINECRAFT_USERNAME || 'DicksBot',
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
      roleVerified: process.env.ROLE_VERIFIED || '',
      roleTeam: process.env.ROLE_TEAM || '',
      roleJoin: process.env.ROLE_JOIN || '',
      roleAdmin: process.env.ROLE_ADMIN || '',
    };

    this._loaded = true;
    logger.info(`[Config] Konfiguration geladen (${Object.keys(this.cache).length} Einstellungen).`);
    this.emit('reload', this.getAll());
  }

  _reloadCache() {
    const all = db.listSettings();
    this.cache = {};
    for (const key of SETTING_KEYS) {
      let value = all[`${SETTINGS_PREFIX}${key}`];
      // Nur bekannte Schlüssel uebernehmen, fehlende mit Defaults überschreiben.
      if (value === undefined) {
        value = DEFAULT_SETTINGS[key];
      }
      // Patterns: RegExp-Objekte in String-Quellen konvertieren (durch JSON.stringify Bug)
      if (key === 'patterns' && typeof value === 'object' && value !== null) {
        const converted = {};
        for (const [k, v] of Object.entries(value)) {
          converted[k] = v instanceof RegExp ? v.source : String(v);
        }
        // Korrigierte Werte sofort in DB schreiben
        db.setSetting(`${SETTINGS_PREFIX}${key}`, converted);
        value = converted;
      }
      this.cache[key] = value;
    }
  }

  _ensureDefaultsSeeded() {
    // Seedet fehlende Standardwerte (idempotent).
    for (const key of SETTING_KEYS) {
      const existing = db.getSetting(`${SETTINGS_PREFIX}${key}`, undefined);
      if (existing === undefined && DEFAULT_SETTINGS[key] !== undefined) {
        let value = DEFAULT_SETTINGS[key];
        // Patterns: RegExp-Objekte in String-Quellen konvertieren
        if (key === 'patterns' && typeof value === 'object' && value !== null) {
          const converted = {};
          for (const [k, v] of Object.entries(value)) {
            converted[k] = v instanceof RegExp ? v.source : v;
          }
          value = converted;
        }
        db.setSetting(`${SETTINGS_PREFIX}${key}`, value);
      }
    }
  }

  /**
   * Gibt einen einzelnen Konfigurationswert zurück.
   * @param {string} key
   * @param {unknown} fallback
   * @returns {unknown}
   */
  get(key, fallback = null) {
    if (!this._loaded) return fallback;
    return key in this.cache ? this.cache[key] : fallback;
  }

  /**
   * Gibt die komplette Konfiguration als tiefe Kopie zurück.
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
      // RegExp-Objekte in String-Quelle konvertieren
      let finalValue = value;
      if (key === 'patterns' && typeof value === 'object' && value !== null) {
        finalValue = {};
        for (const [k, v] of Object.entries(value)) {
          finalValue[k] = v instanceof RegExp ? v.source : v;
        }
      }
      db.setSetting(`${SETTINGS_PREFIX}${key}`, finalValue);
      this.cache[key] = finalValue;
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
      case 'channelJoinLogs':
        // IDs können leer oder eine Snowflake sein.
        if (value !== '' && value !== null && !/^\d{15,20}$/.test(String(value))) {
          return 'Muss leer oder eine gültige ID (Snowflake) sein.';
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
        if (value.isFull !== undefined && typeof value.isFull !== 'boolean') {
          return 'isFull muss true oder false sein.';
        }
        return null;
      case 'teamRanks':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt sein.';
        if (value.count !== undefined && (!Number.isInteger(value.count) || value.count < 1 || value.count > 10)) {
          return 'count muss eine ganze Zahl zwischen 1 und 10 sein.';
        }
        for (const field of ['roles', 'ownerRoles']) {
          if (value[field] !== undefined) {
            if (value[field] === null || typeof value[field] !== 'object') return `${field} muss ein Objekt sein.`;
            for (const [rankKey, roleVal] of Object.entries(value[field])) {
              if (!/^\d+$/.test(rankKey)) return `Rang "${rankKey}" muss eine Zahl sein.`;
              if (roleVal !== '' && roleVal !== null && !/^\d{15,20}$/.test(String(roleVal))) {
                return `Rolle für Rang ${rankKey} muss leer oder eine gültige ID (Snowflake) sein.`;
              }
            }
          }
        }
        if (value.owners !== undefined) {
          if (value.owners === null || typeof value.owners !== 'object') return 'owners muss ein Objekt sein.';
          for (const [rankKey, ownerVal] of Object.entries(value.owners)) {
            if (!/^\d+$/.test(rankKey)) return `Rang "${rankKey}" muss eine Zahl sein.`;
            if (ownerVal !== '' && ownerVal !== null && !/^\d{15,20}$/.test(String(ownerVal))) {
              return `Owner für Rang ${rankKey} muss leer oder eine gültige Discord-ID sein.`;
            }
          }
        }
        return null;
      case 'timeouts':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt sein.';
        if (value.paymentTimeoutMs !== undefined && (typeof value.paymentTimeoutMs !== 'number' || value.paymentTimeoutMs < 60000)) {
          return 'paymentTimeoutMs muss eine Zahl >= 60000 sein.';
        }
        return null;
      case 'payment':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt sein.';
        if (value.amount !== undefined && (typeof value.amount !== 'number' || value.amount < 0)) {
          return 'amount muss eine positive Zahl sein.';
        }
        return null;
      case 'patterns':
        if (value === null || typeof value !== 'object') return 'Muss ein Objekt mit Regex-Strings sein.';
        for (const [patternKey, patternVal] of Object.entries(value)) {
          // RegExp-Objekte in String wandeln
          const patternStr = patternVal instanceof RegExp ? patternVal.source : String(patternVal);
          if (typeof patternStr !== 'string') {
            return `Muster "${patternKey}" muss ein String sein.`;
          }
          const regexError = validateRegex(patternStr);
          if (regexError) {
            return `Muster "${patternKey}" ist kein gültiger Regex: ${regexError}`;
          }
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * Gibt die aktuellen Regex-Muster als kompilierte RegExp-Objekte zurück.
   * @returns {Record<string, RegExp>}
   */
  getCompiledPatterns() {
    const patterns = this.get('patterns', {});
    const out = {};
    for (const [key, source] of Object.entries(patterns)) {
      try {
        out[key] = new RegExp(source, 'i');
      } catch {
        out[key] = /(?!x)x/; // never matches
      }
    }
    return out;
  }

  /**
   * Gibt die Farben zurück.
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
    // Dashboard-Einstellungen haben Vorrang; die .env dient als zuverlässiger
    // Fallback für Deployments ohne vorherige Dashboard-Konfiguration.
    return v ? String(v) : (this.env[which] ? String(this.env[which]) : '');
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

// Re-export für bequemen Zugriff.
export { sanitizeIgn };

export default configService;
