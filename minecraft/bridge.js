// Variable: Minecraft-Bridge mit Mineflayer.
// Verbindet sich mit dem Minecraft-Server, verarbeitet Chat-Nachrichten ueber
// konfigurierbare Regex-Muster, fuehrt Auto-Detection aus und steuert In-Game-Befehle.

import mineflayer from 'mineflayer';
import logger from '../shared/logger.js';
import eventBus from '../shared/events.js';
import configService from '../server/config.js';
import * as db from '../database/index.js';
import { MessageCategory, LogCategory, PlayerStatus } from '../shared/types.js';
import { completeVerification } from '../discord/verifyService.js';
import { handleTeamJoined, handleTeamLeft } from '../discord/teamService.js';

export class MinecraftBridge {
  constructor(discordClient = null) {
    this.discordClient = discordClient;
    this.bot = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.autoReconnect = true;
    this.maxReconnectDelayMs = 60000;
    this.baseReconnectDelayMs = 5000;

    // Metriken
    this.tps = 20.0;
    this.ping = 0;
    this.lastTimePacket = null;
    this.tickSamples = [];

    // Listener fuer Event-Bus Aktionen
    this._setupBusListeners();
  }

  /**
   * Setzt den Discord-Client, falls dieser nachtraeglich verfuegbar wird.
   * @param {import('discord.js').Client} client
   */
  setDiscordClient(client) {
    this.discordClient = client;
  }

  /**
   * Registriert Event-Bus-Abonnements fuer Befehle von aussen (Discord, Dashboard).
   */
  _setupBusListeners() {
    eventBus.on('minecraft:teamInvite', ({ ign }) => {
      logger.info(`[Minecraft] Sende Team-Einladung fuer: ${ign}`);
      this.sendCommand(`/team invite ${ign}`);
    });

    eventBus.on('minecraft:sendCommand', (cmd) => {
      this.sendCommand(cmd);
    });

    eventBus.on('minecraft:sendMessage', (msg) => {
      this.sendMessage(msg);
    });
  }

  /**
   * Startet die Verbindung zum Minecraft-Server.
   */
  start() {
    if (this.bot) {
      try {
        this.bot.quit();
      } catch {
        // Ignorieren
      }
      this.bot = null;
    }

    const host = configService.env.minecraftHost || 'localhost';
    const port = configService.env.minecraftPort || 25565;
    const username = configService.env.minecraftUsername || 'WindBot';
    const password = configService.env.minecraftPassword || undefined;
    const auth = configService.env.minecraftAuth || 'offline';
    const version = configService.env.minecraftVersion || false;

    // Session-Cache: prismarine-auth speichert hier die Microsoft-Login-Token.
    // Leer lassen fuer Standard-Ort (~/.minecraft/nmp-cache).
    // Auf dem VPS: lokal einloggen, dann den Cache-Ordner uebertragen.
    const profilesFolder = configService.env.minecraftProfilesFolder || undefined;

    logger.info(`[Minecraft] Verbinde mit ${host}:${port} als "${username}" (Auth: ${auth})...`);
    if (profilesFolder) {
      logger.info(`[Minecraft] Profile-Ordner: ${profilesFolder}`);
    }

    const options = {
      host,
      port,
      username,
      auth,
      hideErrors: true,
      onMsaCode: (code) => {
        logger.info(`[Minecraft] ========================================`);
        logger.info(`[Minecraft]  Microsoft-Auth erforderlich!`);
        logger.info(`[Minecraft] ========================================`);
        logger.info(`[Minecraft] ${code.message}`);
        logger.info(`[Minecraft] Oeffne: ${code.verification_uri}?otc=${code.user_code}`);
        logger.info(`[Minecraft] Code: ${code.user_code}`);
        logger.info(`[Minecraft] ========================================`);
      },
    };

    if (profilesFolder) {
      options.profilesFolder = profilesFolder;
    }

    if (password) {
      options.password = password;
    }

    if (version) {
      options.version = version;
    }

    try {
      this.bot = mineflayer.createBot(options);
      this._bindBotEvents();
    } catch (err) {
      logger.error(`[Minecraft] Fehler beim Initialisieren des Bots: ${err.message}`);
      this._scheduleReconnect();
    }
  }

  /**
   * Beendet die Verbindung sauber.
   */
  stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.bot) {
      try {
        this.bot.quit();
      } catch {
        // Ignorieren
      }
      this.bot = null;
    }

    this.isConnected = false;
    this._broadcastStatus();
    logger.info('[Minecraft] Bridge gestoppt.');
  }

  /**
   * Extrahiert sauberen Text aus einer Minecraft-JSON-Nachricht.
   * Nutzt prismarine-chat toString() fuer vollstaendige Extraktion,
   * inkl. verschachtelten extra-Arrays und translate-Nachrichten.
   * Entfernt danach §-Farbcodes und Custom-Font-Glyphs.
   * @param {object} jsonMsg - prismarine-chat ChatMessage
   * @returns {string}
   */
  _cleanChatMessage(jsonMsg) {
    if (!jsonMsg) return '';

    let text = '';
    try {
      // toString() von prismarine-chat extrahiert rekursiv ALLES korrekt
      text = jsonMsg.toString();
    } catch {
      // Fallback: manuelle Extraktion
      text = this._extractJsonText(jsonMsg);
    }

    // Section-Sign + Farbcode entfernen (§0-§9, §a-§f, §k-§r, §x fuer hex)
    text = text.replace(/§[0-9a-fk-orx]/gi, '');
    // Private Use Area (Minecraft Resource Pack Glyphs) entfernen
    text = text.replace(/[\uE000-\uF8FF]/g, '');
    // Replacement Character
    text = text.replace(/\uFFFD/g, '');
    // Control characters ( aber NEWLINE und TAB behalten )
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    return text.trim();
  }

  /**
   * Rekursive Text-Extraktion (Fallback fuer toString()).
   * Verarbeitet .text, .extra (verschachtelt), .translate + .with.
   * @param {object} node
   * @returns {string}
   */
  _extractJsonText(node) {
    if (!node) return '';
    if (typeof node === 'string') return node;

    let text = '';

    if (typeof node.text === 'string') {
      text += node.text;
    }

    if (Array.isArray(node.extra)) {
      for (const part of node.extra) {
        text += this._extractJsonText(part);
      }
    }

    if (typeof node.translate === 'string') {
      text += node.translate;
      if (Array.isArray(node.with)) {
        for (const part of node.with) {
          text += this._extractJsonText(part);
        }
      }
    }

    return text;
  }

  /**
   * Sendet eine normale Chat-Nachricht.
   * @param {string} message
   */
  sendMessage(message) {
    if (!this.bot || !this.isConnected) {
      logger.warn(`[Minecraft] Kann Nachricht nicht senden (nicht verbunden): ${message}`);
      return false;
    }
    try {
      this.bot.chat(message);
      return true;
    } catch (err) {
      logger.error(`[Minecraft] Fehler beim Senden: ${err.message}`);
      return false;
    }
  }

  /**
   * Fuehrt einen Server-Befehl aus.
   * @param {string} command
   */
  sendCommand(command) {
    const formatted = command.startsWith('/') ? command : `/${command}`;
    return this.sendMessage(formatted);
  }

  /**
   * Gibt den aktuellen Status der Bridge zurueck.
   * @returns {object}
   */
  getStatus() {
    let onlinePlayers = [];
    if (this.bot && this.bot.players) {
      onlinePlayers = Object.keys(this.bot.players);
    }

    return {
      isOnline: this.isConnected,
      host: configService.env.minecraftHost,
      port: configService.env.minecraftPort,
      username: this.bot?.username || configService.env.minecraftUsername,
      ping: this.ping,
      tps: Number(this.tps.toFixed(2)),
      onlinePlayers,
      playerCount: onlinePlayers.length,
      autoReconnect: this.autoReconnect,
    };
  }

  /**
   * Verknuepft alle Ereignisse des Mineflayer-Bots.
   */
  _bindBotEvents() {
    const bot = this.bot;

    bot.on('login', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info(`[Minecraft] Erfolgreich eingeloggt als ${bot.username}.`);
      this._broadcastStatus();
    });

    bot.on('spawn', () => {
      logger.info('[Minecraft] Bot in der Welt gespawnt.');
      this._broadcastStatus();
    });

    bot.on('end', (reason) => {
      this.isConnected = false;
      logger.warn(`[Minecraft] Verbindung getrennt: ${reason}`);
      this._broadcastStatus();
      this._scheduleReconnect();
    });

    bot.on('kicked', (reason) => {
      this.isConnected = false;
      const parsedReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
      logger.warn(`[Minecraft] Vom Server gekickt: ${parsedReason}`);
      this._broadcastStatus();
      this._scheduleReconnect();
    });

    bot.on('error', (err) => {
      logger.error(`[Minecraft] Bot-Fehler: ${err.message}`);
    });

    // TPS- und Ping-Ueberwachung
    bot.on('time', () => {
      const now = Date.now();
      if (this.lastTimePacket) {
        const delta = (now - this.lastTimePacket) / 1000;
        // Normalerweise kommt das Time-Paket alle 1 Sekunde (20 Ticks)
        if (delta > 0) {
          const currentTps = Math.min(20, Math.max(0, 20 / delta));
          this.tickSamples.push(currentTps);
          if (this.tickSamples.length > 10) this.tickSamples.shift();
          const sum = this.tickSamples.reduce((a, b) => a + b, 0);
          this.tps = sum / this.tickSamples.length;
        }
      }
      this.lastTimePacket = now;

      // Ping ueber Spieler-Metadaten abfragen
      if (bot.player && bot.player.ping !== undefined) {
        this.ping = bot.player.ping;
      }
    });

    // Chat-Nachrichten verarbeiten
    bot.on('message', (jsonMsg) => {
      const rawText = this._cleanChatMessage(jsonMsg);
      if (!rawText) return;
      this._handleRawMessage(rawText);
    });
  }

  /**
   * Verarbeitet eine rohe Textnachricht mit Regex-Erkennung und Auto-Detection.
   * Prueft konfigurierbare Patterns, dann Fallback-Heuristik fuer unbekannte Formate.
   * @param {string} text
   */
  async _handleRawMessage(text) {
    const patterns = configService.getCompiledPatterns();
    let handledCategory = MessageCategory.OTHER;
    let author = null;
    let messageContent = text;

    // 1. Spieler-Chat Pruefung
    if (patterns.PLAYER_CHAT && patterns.PLAYER_CHAT.test(text)) {
      const match = text.match(patterns.PLAYER_CHAT);
      author = match[1];
      messageContent = match[2];
      handledCategory = MessageCategory.CHAT;
    }
    // 2. Private Nachricht / Whisper an Bot
    else if (patterns.PRIVATE_MESSAGE && patterns.PRIVATE_MESSAGE.test(text)) {
      handledCategory = MessageCategory.PRIVATE;
      const match = text.match(patterns.PRIVATE_MESSAGE);
      const sender = match ? match[1] : null;
      const body = match ? match[2] : text;
      author = sender;
      messageContent = body;
      await this._checkVerificationCode(body, sender);
    }
    // 3. Join-Erkennung
    else if (patterns.JOIN && patterns.JOIN.test(text)) {
      handledCategory = MessageCategory.JOIN_LEAVE;
      const match = text.match(patterns.JOIN);
      const playerName = match ? match[1] : null;
      if (playerName) {
        author = playerName;
        this._handlePlayerJoin(playerName);
      }
    }
    // 4. Leave-Erkennung
    else if (patterns.LEAVE && patterns.LEAVE.test(text)) {
      handledCategory = MessageCategory.JOIN_LEAVE;
      const match = text.match(patterns.LEAVE);
      const playerName = match ? match[1] : null;
      if (playerName) {
        author = playerName;
        this._handlePlayerLeave(playerName);
      }
    }
    // 5. Team-Einladung gesendet
    else if (patterns.TEAM_INVITED && patterns.TEAM_INVITED.test(text)) {
      handledCategory = MessageCategory.SYSTEM;
      logger.info(`[Minecraft] Team-Einladung erkannt: ${text}`);
    }
    // 6. Team-Beitritt
    else if (patterns.TEAM_JOIN && patterns.TEAM_JOIN.test(text)) {
      handledCategory = MessageCategory.SYSTEM;
      const match = text.match(patterns.TEAM_JOIN);
      const playerName = match ? match[1] : null;
      if (playerName && this.discordClient) {
        await handleTeamJoined(this.discordClient, playerName);
      }
    }
    // 7. Team-Verlassen
    else if (patterns.TEAM_LEFT && patterns.TEAM_LEFT.test(text)) {
      handledCategory = MessageCategory.SYSTEM;
      const match = text.match(patterns.TEAM_LEFT);
      const playerName = match ? match[1] : null;
      if (playerName && this.discordClient) {
        await handleTeamLeft(this.discordClient, playerName);
      }
    }
    // 8. Zahlungs- / Spenden-Erkennung
    else if (patterns.PAYMENT && patterns.PAYMENT.test(text)) {
      handledCategory = MessageCategory.PAYMENT;
      db.addLog({
        category: LogCategory.PAYMENT,
        title: 'Zahlung im Spiel erkannt',
        description: text,
      });
    }
    // 9. Auktion / Handel
    else if (patterns.AUCTION && patterns.AUCTION.test(text)) {
      handledCategory = MessageCategory.AUCTION;
    }
    // 10. Fehler-Erkennung
    else if (patterns.ERROR && patterns.ERROR.test(text)) {
      handledCategory = MessageCategory.ERROR;
    }
    // 11. Command-Ausgabe
    else if (patterns.COMMAND && patterns.COMMAND.test(text)) {
      handledCategory = MessageCategory.COMMAND;
      const match = text.match(patterns.COMMAND);
      if (match) messageContent = match[0];
    }
    // 12. Allgemeine System-Nachricht (konfigurierbares Pattern)
    else if (patterns.SYSTEM && patterns.SYSTEM.test(text)) {
      handledCategory = MessageCategory.SYSTEM;
    }
    // 13. Fallback-Heuristik: intelligente Klassifizierung fuer unbekannte Formate
    else {
      handledCategory = this._classifyByHeuristics(text);
    }

    // Nachricht in DB archivieren
    const msgRecord = db.addMessage({
      category: handledCategory,
      content: text,
      author,
    });

    // Nachricht an Dashboard per WebSocket weiterleiten
    eventBus.emitToDashboard('chatMessage', {
      id: msgRecord.id,
      category: handledCategory,
      content: text,
      author,
      createdAt: msgRecord.created_at,
    });
  }

  /**
   * Intelligente Fallback-Klassifizierung fuer Nachrichten, die auf kein Pattern passen.
   * Prueft Keywords und Struktur, um eine sinnvolle Kategorie zuzuweisen.
   * @param {string} text
   * @returns {string} MessageCategory
   */
  _classifyByHeuristics(text) {
    const lower = text.toLowerCase();

    // Commands: "Command: /rtpqueue" oder "/help"
    if (/^(?:Command:\s*)?\//.test(text)) {
      return MessageCategory.COMMAND;
    }

    // Auktionen / Orders: "ORDERS » ...", "erstellt eine ... order"
    if (/^ORDERS?\s*[»>]/i.test(text) || /created an?\s+.*order/i.test(text)) {
      return MessageCategory.AUCTION;
    }

    // Giveaways / Server-Events
    if (/giveaway|clear\s*lag|xs\s*live|liegt\s*im\s*lager|wurde\s*aus\s*dem\s*lager/i.test(lower)) {
      return MessageCategory.SYSTEM;
    }

    // Spieler-Events: "X is waiting for", "X wants to trade"
    if (/\b(is waiting for|wants to trade|joined the game|left the game)\b/i.test(text)) {
      return MessageCategory.JOIN_LEAVE;
    }

    // Zahlen am Anfang + Server-Aktionen: "200k Giveaway..."
    if (/^\d+[km]?\s+\w/i.test(text)) {
      return MessageCategory.SYSTEM;
    }

    // Nachricht enthaelt typische Server-Prafixe: "[Shop]", "[Auction]", "[Market]"
    if (/^\[[\w]+\]/i.test(text)) {
      return MessageCategory.SYSTEM;
    }

    return MessageCategory.OTHER;
  }

  /**
   * Prueft, ob ein Text einen 6-stelligen Verifizierungscode enthaelt.
   * @param {string} text
   * @param {string|null} senderIgn
   */
  async _checkVerificationCode(text, senderIgn) {
    const codeMatch = text.match(/\b\d{6}\b/);
    if (!codeMatch) return;

    const code = codeMatch[0];
    logger.info(`[Minecraft] Verifizierungscode erkannt: ${code} von "${senderIgn || 'unbekannt'}"`);

    if (!this.discordClient) {
      logger.warn('[Minecraft] Discord-Client noch nicht verfuegbar fuer Verifizierung.');
      return;
    }

    const result = await completeVerification(this.discordClient, code, senderIgn);
    if (result.ok) {
      if (senderIgn) {
        this.sendMessage(`/msg ${senderIgn} Dein Discord-Konto wurde erfolgreich verifiziert!`);
      }
    } else {
      if (senderIgn) {
        if (result.message === 'MISMATCH') {
          this.sendMessage(`/msg ${senderIgn} Verifizierung fehlgeschlagen. Der Code gehoert nicht zu diesem Konto. Bitte pruefe im Discord, ob du den richtigen Minecraft-Namen angegeben hast.`);
          // DM mit Retry-Button senden
          this._sendVerifyRetryDm(result.discordId);
        } else {
          this.sendMessage(`/msg ${senderIgn} Verifizierung fehlgeschlagen: ${result.message}`);
        }
      }
    }
  }

  /**
   * Sendet eine DM mit Retry-Button an den Discord-Nutzer bei Verifizierungsfehler.
   * @param {string} discordId
   */
  async _sendVerifyRetryDm(discordId) {
    if (!this.discordClient || !discordId) return;
    try {
      const user = await this.discordClient.users.fetch(discordId);
      if (!user) return;
      const dm = await user.createDM();
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('modal_verify_retry')
          .setLabel('Erneut versuchen')
          .setStyle(ButtonStyle.Primary),
      );
      await dm.send({
        content: 'Dein Verifizierungscode wurde nicht akzeptiert. Der eingegebene Minecraft-Name passt nicht zum Konto, das den Code gesendet hat.\n\nBitte verifiziere dich mit dem richtigen Minecraft-Namen:',
        components: [row],
      });
    } catch (err) {
      logger.warn(`[Minecraft] Konnte keine DM an ${discordId} senden: ${err.message}`);
    }
  }

  /**
   * Behandelt den Beitritt eines Spielers auf dem Server.
   * @param {string} ign
   */
  _handlePlayerJoin(ign) {
    logger.info(`[Minecraft] Spieler beigetreten: ${ign}`);
    const user = db.findUserByIgn(ign);
    if (user) {
      db.upsertUser({
        discord_id: user.discord_id,
        ign,
        is_online: 1,
      });
    }

    eventBus.emitToDashboard('joinLeave', {
      type: 'join',
      ign,
      timestamp: new Date().toISOString(),
    });
    eventBus.emitToDashboard('playerUpdate', db.listUsers());
    this._broadcastStatus();
  }

  /**
   * Behandelt das Verlassen eines Spielers vom Server.
   * @param {string} ign
   */
  _handlePlayerLeave(ign) {
    logger.info(`[Minecraft] Spieler verlassen: ${ign}`);
    const user = db.findUserByIgn(ign);
    if (user) {
      db.upsertUser({
        discord_id: user.discord_id,
        ign,
        is_online: 0,
      });
    }

    eventBus.emitToDashboard('joinLeave', {
      type: 'leave',
      ign,
      timestamp: new Date().toISOString(),
    });
    eventBus.emitToDashboard('playerUpdate', db.listUsers());
    this._broadcastStatus();
  }

  /**
   * Plant einen Neuverbindungsversuch mit exponentiellem Backoff.
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (!this.autoReconnect) {
      logger.info('[Minecraft] Auto-Reconnect deaktiviert. Kein Neuer Verbindungsversuch.');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelayMs * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelayMs,
    );

    logger.info(`[Minecraft] Neuer Verbindungsversuch in ${Math.round(delay / 1000)}s (Versuch #${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start();
    }, delay);
  }

  /**
   * Sendet Status-Updates an das Dashboard ueber den Event-Bus.
   */
  _broadcastStatus() {
    eventBus.emitToDashboard('statsUpdate', this.getStatus());
  }
}

export const bridgeInstance = new MinecraftBridge();
export default bridgeInstance;