// Variable: Discord Bot-Hauptmodul.
// Erstellt den Discord-Client, laedt Befehle und Events, startet den Bot.

import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import logger from '../shared/logger.js';
import configService from '../server/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DiscordBot {
  constructor() {
    this.client = null;
    this.commands = new Collection();
    this.isReady = false;
  }

  /**
   * Initialisiert den Discord-Client und laedt Befehle/Events.
   * Idempotent: ein vorhandener Client wird vorher zerstoert, damit nie
   * zwei Sessions mit demselben Token laufen.
   */
  async start() {
    const token = configService.env.discordToken;
    if (!token) {
      logger.error('[Discord] Kein DISCORD_TOKEN konfiguriert. Bot wird nicht gestartet.');
      return false;
    }

    if (this.client) {
      try {
        this.client.destroy();
      } catch {
        // Ignorieren
      }
      this.client = null;
      this.isReady = false;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    // Client-Fehler abfangen statt den Prozess abstuerzen zu lassen.
    this.client.on('error', (err) => {
      logger.warn(`[Discord] Client-Fehler: ${err.message}`);
    });

    // Befehle laden
    await this._loadCommands();

    // Events laden
    await this._loadEvents();

    // Bot anmelden (mit Wiederholung bei Gateway-Fehlern wie 503/500)
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.client.login(token);
        return true;
      } catch (err) {
        logger.error(`[Discord] Login fehlgeschlagen (Versuch ${attempt}/${maxAttempts}): ${err.message}`);
        if (attempt >= maxAttempts) {
          // Client nicht zerstoeren, damit discord.js-interne Reconnects
          // nicht mit "Shard 0 not found" abbrechen.
          return false;
        }
        const delayMs = attempt * 15000;
        logger.info(`[Discord] Neuer Login-Versuch in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return false;
  }

  /**
   * Laedt alle Slash-Befehle aus discord/commands/.
   */
  async _loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    if (!fs.existsSync(commandsPath)) {
      logger.warn('[Discord] commands-Verzeichnis nicht gefunden.');
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        const commandModule = await import(pathToFileURL(filePath).href);
        const command = commandModule.default || commandModule;

        if (command && command.data && command.execute) {
          this.commands.set(command.data.name, command);
          logger.debug(`[Discord] Befehl geladen: /${command.data.name}`);
        } else {
          logger.warn(`[Discord] Befehl ${file} hat gültiges Format.`);
        }
      } catch (err) {
        logger.error(`[Discord] Fehler beim Laden von ${file}: ${err.message}`);
      }
    }

    logger.info(`[Discord] ${this.commands.size} Befehle geladen.`);
  }

  /**
   * Laedt alle Event-Handler aus discord/events/.
   */
  async _loadEvents() {
    const eventsPath = path.join(__dirname, 'events');
    if (!fs.existsSync(eventsPath)) {
      logger.warn('[Discord] events-Verzeichnis nicht gefunden.');
      return;
    }

    const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

    for (const file of eventFiles) {
      try {
        const eventFilePath = path.join(eventsPath, file);
        const eventModule = await import(pathToFileURL(eventFilePath).href);
        const event = eventModule.default || eventModule;

        if (event && event.name && typeof event.execute === 'function') {
          if (event.once) {
            this.client.once(event.name, (...args) => event.execute(...args, this));
          } else {
            this.client.on(event.name, (...args) => event.execute(...args, this));
          }
          logger.debug(`[Discord] Event geladen: ${event.name}`);
        }
      } catch (err) {
        logger.error(`[Discord] Fehler beim Laden von Event ${file}: ${err.message}`);
      }
    }

    logger.info(`[Discord] Event-Handler geladen.`);
  }

  /**
   * Gibt den Client zurück.
   * @returns {Client}
   */
  getClient() {
    return this.client;
  }

  /**
   * Stoppt den Bot sauber.
   */
  stop() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.isReady = false;
      logger.info('[Discord] Bot gestoppt.');
    }
  }
}

export default DiscordBot;
