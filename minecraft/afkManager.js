import mineflayer from 'mineflayer';
import logger from '../shared/logger.js';
import eventBus from '../shared/events.js';
import configService from '../server/config.js';

export class AfkBot {
  constructor(username, options = {}) {
    this.username = username;
    this.host = options.host || configService.env.minecraftHost || 'localhost';
    this.port = options.port || configService.env.minecraftPort || 25565;
    this.auth = options.auth || configService.env.minecraftAuth || 'offline';
    this.profilesFolder = options.profilesFolder || configService.env.minecraftProfilesFolder || undefined;
    this.version = options.version || configService.env.minecraftVersion || false;

    this.bot = null;
    this.isConnected = false;
    this.enabled = options.enabled !== false;
    this.reconnectTimer = null;
  }

  start() {
    if (this.bot) {
      try { this.bot.quit(); } catch {}
      this.bot = null;
    }

    if (!this.enabled) return;

    logger.info(`[AFK] Verbinde ${this.username} mit ${this.host}:${this.port}...`);

    const opts = {
      host: this.host,
      port: this.port,
      username: this.username,
      auth: this.auth,
      hideErrors: true,
      onMsaCode: (code) => {
        logger.info(`[AFK] Microsoft-Auth für ${this.username}: ${code.verification_uri}?otc=${code.user_code}`);
      },
    };

    if (this.profilesFolder) opts.profilesFolder = this.profilesFolder;
    if (this.version) opts.version = this.version;

    try {
      this.bot = mineflayer.createBot(opts);
    } catch (err) {
      logger.error(`[AFK] Fehler beim Erstellen von ${this.username}: ${err.message}`);
      return;
    }

    this.bot.on('login', () => {
      this.isConnected = true;
      logger.info(`[AFK] ${this.username} eingeloggt.`);
      this._broadcast();
    });

    this.bot.on('end', (reason) => {
      this.isConnected = false;
      logger.info(`[AFK] ${this.username} getrennt: ${reason}`);
      this._broadcast();
      if (this.enabled) this._reconnect();
    });

    this.bot.on('error', (err) => {
      logger.error(`[AFK] Fehler bei ${this.username}: ${err.message}`);
    });

    this.bot.on('kicked', (reason) => {
      this.isConnected = false;
      logger.warn(`[AFK] ${this.username} gekickt: ${reason}`);
      this._broadcast();
      if (this.enabled) this._reconnect();
    });
  }

  stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.bot) {
      try { this.bot.quit(); } catch {}
      this.bot = null;
    }
    this.isConnected = false;
    this._broadcast();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.start();
    } else {
      this.stop();
    }
    return this.enabled;
  }

  _reconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.enabled) this.start();
    }, 10000);
  }

  _broadcast() {
    eventBus.emitToDashboard('afkUpdate', this.getStatus());
  }

  getStatus() {
    return {
      username: this.username,
      enabled: this.enabled,
      connected: this.isConnected,
    };
  }
}

export class AfkManager {
  constructor() {
    this.bots = new Map();
  }

  loadFromConfig() {
    const accounts = configService.get('afkAccounts', []);
    this.stopAll();

    for (const acc of accounts) {
      if (acc.enabled) {
        this.addBot(acc.username, { enabled: true, profilesFolder: acc.profilesFolder });
      }
    }

    if (accounts.length > 0) {
      logger.info(`[AFK] ${accounts.filter((a) => a.enabled).length}/${accounts.length} AFK-Bots gestartet.`);
    }
  }

  addBot(username, options = {}) {
    if (this.bots.has(username)) {
      const existing = this.bots.get(username);
      if (!existing.enabled && options.enabled !== false) {
        existing.enabled = true;
        existing.start();
      }
      return existing;
    }

    const bot = new AfkBot(username, options);
    this.bots.set(username, bot);
    if (bot.enabled) bot.start();
    return bot;
  }

  removeBot(username) {
    const bot = this.bots.get(username);
    if (bot) {
      bot.stop();
      this.bots.delete(username);
    }
  }

  toggleBot(username) {
    const bot = this.bots.get(username);
    if (bot) return bot.toggle();
    return null;
  }

  stopAll() {
    for (const [, bot] of this.bots) {
      bot.stop();
    }
    this.bots.clear();
  }

  getAllStatus() {
    return Array.from(this.bots.values()).map((b) => b.getStatus());
  }

  getEnabledUsernames() {
    return Array.from(this.bots.values())
      .filter((b) => b.enabled)
      .map((b) => b.username);
  }
}

export const afkManager = new AfkManager();
export default afkManager;
