// Variable: Minecraft-Bridge mit Mineflayer.
// Verbindet sich mit dem Minecraft-Server, verarbeitet Chat-Nachrichten über
// konfigurierbare Regex-Muster, führt Auto-Detection aus und steuert In-Game-Befehle.

import mineflayer from 'mineflayer';
import logger from '../shared/logger.js';
import eventBus from '../shared/events.js';
import configService from '../server/config.js';
import * as db from '../database/index.js';
import { MessageCategory, LogCategory, PlayerStatus, sanitizeIgn } from '../shared/types.js';
import { completeVerification } from '../discord/verifyService.js';
import { handleTeamJoined, handleTeamLeft, removeRankRoles } from '../discord/teamService.js';
import { validatePayment, confirmPaymentAndInviteTeam, sendPaymentFailedEmbed, consumePendingPaymentConfirm, announcePaymentConfirmed, deleteAnnouncedPaymentMessage, scheduleRefundAfterInviteError } from '../discord/paymentService.js';
import { syncNickname, grantRole, removeRole } from '../discord/helpers.js';

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

    // Bereits verarbeitete Verify-Codes (Code+Sender -> Timestamp).
    // Verhindert: Erfolg + Fehler gleichzeitig, wenn dieselbe Nachricht
    // als Chat-Event UND als Whisper-Event ankommt.
    this.processedCodes = new Map();

    // Sende-Queue gegen chat_validation_failed-Kicks: Nachrichten gehen mit
    // Abstand raus, bei Disconnect geht nichts verloren, nach Spawn wird
    // automatisch nachgesendet.
    this.sendQueue = [];
    this.sendQueueTimer = null;
    this.lastSendAt = 0;
    this.MIN_SEND_INTERVAL_MS = 1500;
    this.MAX_QUEUE_SIZE = 50;
    // Letzte tatsächlich gesendete Nachricht (für Kick-Recovery).
    this.lastSent = null;
    this.KICK_RECOVER_WINDOW_MS = 5000;
    this.MAX_SEND_RETRIES = 2;
    // Zeitpunkt des letzten Disconnects/Kicks. Nach dem Spawn gibt es ein
    // kurzes Fenster, in dem Senden funktioniert – das wird sofort genutzt.
    // Der Refund nutzt den Zeitstempel zur Versandkontrolle.
    this.lastDisconnectAt = 0;

    // Unbestaetigte Team-Einladungen: ignLower -> { discordId, sentAt, acked, resends }
    this.MAX_INVITE_RESENDS = 3;
    this.INVITE_RESEND_WINDOW_MS = 5 * 60 * 1000;

    // Bankstand: per /balance abgefragt, Antwort kommt als Chat-Nachricht.
    this.bankBalance = { amount: null, at: null };
    this.pendingBalanceSince = 0;
    this.BALANCE_WINDOW_MS = 15000;
    this.BALANCE_INTERVAL_MS = 5 * 60 * 1000;
    this.balanceTimer = null;

    // Listener für Event-Bus Aktionen
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
   * Registriert Event-Bus-Abonnements für Befehle von aussen (Discord, Dashboard).
   */
  _setupBusListeners() {
    // Ausstehende Team-Einladungen, um Server-Antworten zuordnen zu können:
    // ignLower -> { discordId, sentAt }
    if (!this.pendingTeamInvites) this.pendingTeamInvites = new Map();

    eventBus.on('minecraft:teamInvite', ({ ign, discordId }) => {
      logger.info(`[Minecraft] Sende Team-Einladung für: ${ign}`);
      if (ign) {
        this.pendingTeamInvites.set(String(ign).toLowerCase(), {
          discordId: discordId || null,
          sentAt: Date.now(),
          acked: false,
          resends: 0,
        });
      }
      const sent = this.sendCommand(`/team invite ${ign}`);
      if (!sent) {
        // Bot offline: Invite ging NICHT raus (liegt aber in der Queue und
        // wird nach dem Spawn automatisch nachgesendet). User ehrlich informieren.
        logger.error(`[Minecraft] Team-Einladung für ${ign} NICHT gesendet (Bot offline, eingereiht).`);
        this._notifyTeamInviteNotSent(ign, discordId);
        return;
      }
      // Erfolgreich angenommen (Queue) -> im Dashboard loggen (kein Channel-Spam,
      // die Zahlung bestätigt-Meldung steht schon im Kanal).
      const entry = db.addLog({
        category: LogCategory.TEAM,
        title: 'Team-Einladung gesendet',
        description: `Einladung für **${ign}** im Spiel gesendet.`,
      });
      eventBus.emitToDashboard('logUpdate', entry);
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
    if (this.balanceTimer) {
      clearInterval(this.balanceTimer);
      this.balanceTimer = null;
    }
    // Bankstand regelmaessig aktualisieren (nur wenn verbunden abgefragt)
    this.balanceTimer = setInterval(() => {
      if (this.isConnected) this.queryBankBalance();
    }, this.BALANCE_INTERVAL_MS);

    const host = configService.env.minecraftHost || 'localhost';
    const port = configService.env.minecraftPort || 25565;
    const username = configService.env.minecraftUsername || 'DicksBot';
    const password = configService.env.minecraftPassword || undefined;
    const auth = configService.env.minecraftAuth || 'offline';
    const version = configService.env.minecraftVersion || false;

    // Session-Cache: prismarine-auth speichert hier die Microsoft-Login-Token.
    // Leer lassen für Standard-Ort (~/.minecraft/nmp-cache).
    // Auf dem VPS: lokal einloggen, dann den Cache-Ordner übertragen.
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
        logger.info(`[Minecraft] Öffne: ${code.verification_uri}?otc=${code.user_code}`);
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
    if (this.balanceTimer) {
      clearInterval(this.balanceTimer);
      this.balanceTimer = null;
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
   * Nutzt prismarine-chat toString() für vollstaendige Extraktion,
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

    // Section-Sign + Farbcode entfernen (§0-§9, §a-§f, §k-§r, §x für hex)
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
   * Rekursive Text-Extraktion (Fallback für toString()).
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
   * Fragt den aktuellen Bankstand per /balance ab.
   * Die Antwort kommt als Chat-Nachricht und wird dort ausgewertet.
   * @returns {boolean} true wenn Befehl abgesetzt
   */
  queryBankBalance() {
    const bank = configService.get('payment', {}).recipient || configService.env.minecraftUsername || 'DicksTeamBank';
    if (!this.bot || !this.isConnected) {
      logger.warn('[Minecraft] Bankstand kann nicht abgefragt werden (nicht verbunden).');
      return false;
    }
    this.pendingBalanceSince = Date.now();
    this.sendCommand(`/balance ${bank}`);
    return true;
  }

  /**
   * Wertet eine mögliche Bankstands-Antwort aus (nur kurz nach eigener Abfrage).
   * @param {string} text
   * @returns {boolean} true wenn Bankstand erkannt
   */
  _checkBankBalance(text) {
    if (!this.pendingBalanceSince || Date.now() - this.pendingBalanceSince > this.BALANCE_WINDOW_MS) return false;
    const match = text.match(/\bbalance\b\s*[:»\-]?\s*\$?\s*([\d.,]+\s*[KkMm]?)/i);
    if (!match) return false;
    const raw = match[1].replace(/\s/g, '');
    const suffix = raw.slice(-1).toLowerCase();
    let amount = NaN;
    if (suffix === 'k' || suffix === 'm') {
      const num = Number.parseFloat(raw.slice(0, -1).replace(',', '.'));
      if (Number.isFinite(num)) amount = Math.round(num * (suffix === 'k' ? 1000 : 1000000));
    } else {
      amount = Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
    }
    if (!Number.isFinite(amount)) return false;
    this.bankBalance = { amount, at: new Date().toISOString() };
    this.pendingBalanceSince = 0;
    logger.info(`[Minecraft] Bankstand: $${amount.toLocaleString('de-DE')}`);
    this._broadcastStatus();
    return true;
  }

  /**
   * Zahlt Geld vom Bank-Account an einen Spieler aus (/pay).
   * Nur für Admin-Aktionen (Dashboard). Validiert strikt, sendet über Queue.
   * @param {string} ign - exakter Empfänger-IGN
   * @param {number} amount - positive ganze Zahl
   * @returns {{ ok: boolean, error?: string }} (Versand, keine Zustellgarantie bei Kick)
   */
  payout(ign, amount) {
    const cleanIgn = sanitizeIgn(ign);
    if (!cleanIgn) {
      return { ok: false, error: 'Ungültiger Minecraft-Name.' };
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, error: 'Betrag muss eine positive ganze Zahl sein.' };
    }
    if (!this.bot || !this.isConnected) {
      return { ok: false, error: 'Bot ist nicht auf dem Server.' };
    }
    const sent = this.sendCommand(`/pay ${cleanIgn} ${amount}`);
    if (!sent) {
      return { ok: false, error: 'Konnte nicht gesendet werden (offline).' };
    }
    logger.info(`[Minecraft] Auszahlung: $${amount.toLocaleString('de-DE')} an ${cleanIgn}`);
    return { ok: true };
  }

  /**
   * Sendet eine normale Chat-Nachricht (über Queue mit Sendeabstand).
   * Bei Disconnect wird eingereiht statt verworfen – nach dem Spawn wird
   * automatisch nachgesendet. Rueckgabe false nur wenn offline angenommen.
   * @param {string} message
   * @returns {boolean} true wenn online angenommen (gesendet oder eingereiht)
   */
  sendMessage(message) {
    if (!this.bot || !this.isConnected) {
      this._enqueueSend(message);
      logger.info(`[Minecraft] Offline eingereiht (${this.sendQueue.length}): ${message}`);
      return false;
    }
    this._enqueueSend(message);
    this._pumpSendQueue();
    return true;
  }

  /** Reiht eine Nachricht ein (mit Längenbegrenzung). */
  _enqueueSend(message, retries = 0) {
    if (this.sendQueue.length >= this.MAX_QUEUE_SIZE) {
      this.sendQueue.shift();
      logger.warn('[Minecraft] Sende-Queue voll – aelteste Nachricht verworfen.');
    }
    this.sendQueue.push({ text: message, retries });
  }

  /**
   * Arbeitet die Sende-Queue mit Mindestabstand ab.
   */
  _pumpSendQueue() {
    if (this.sendQueueTimer) return;
    const tick = () => {
      this.sendQueueTimer = null;
      if (!this.bot || !this.isConnected || this.sendQueue.length === 0) return;
      const wait = this.MIN_SEND_INTERVAL_MS - (Date.now() - this.lastSendAt);
      if (wait > 0) {
        this.sendQueueTimer = setTimeout(tick, wait);
        return;
      }
      const item = this.sendQueue.shift();
      try {
        this.bot.chat(item.text);
        this.lastSendAt = Date.now();
        this.lastSent = { text: item.text, retries: item.retries || 0, at: this.lastSendAt };
        logger.debug(`[Minecraft] Gesendet (${this.sendQueue.length} wartend): ${item.text}`);
      } catch (err) {
        logger.error(`[Minecraft] Fehler beim Senden: ${err.message}`);
        // Nachricht behalten – nach Reconnect geht es weiter.
        this.sendQueue.unshift(item);
        return;
      }
      if (this.sendQueue.length > 0) {
        this.sendQueueTimer = setTimeout(tick, this.MIN_SEND_INTERVAL_MS);
      }
    };
    tick();
  }

  /**
   * Rettet die zuletzt gesendete Nachricht bei Kick/Disconnect.
   * Wurde sie kurz vorher abgeschickt, ist unklar ob sie ankam – nach dem
   * Spawn geht sie automatisch nochmal raus. Ausgenommen: /pay (Bank-Schutz,
   * hat eigene sichere Flows) und /team invite (eigenes Retry-System).
   */
  _recoverLastSend() {
    const last = this.lastSent;
    this.lastSent = null;
    if (!last || Date.now() - last.at > this.KICK_RECOVER_WINDOW_MS) return;
    if ((last.retries || 0) >= this.MAX_SEND_RETRIES) {
      logger.warn(`[Minecraft] Nachricht nach ${last.retries} Versuchen aufgegeben: ${last.text}`);
      return;
    }
    if (/^\s*\/(pay|team\s+invite)\b/i.test(last.text)) return;
    if (this.sendQueue.some((item) => item.text === last.text)) return;
    this.sendQueue.unshift({ text: last.text, retries: (last.retries || 0) + 1 });
    logger.warn(`[Minecraft] Nachricht wegen Disconnect eingereiht (Versuch ${(last.retries || 0) + 1}): ${last.text}`);
  }

  /**
   * Führt einen Server-Befehl aus.
   * @param {string} command
   */
  sendCommand(command) {
    const formatted = command.startsWith('/') ? command : `/${command}`;
    return this.sendMessage(formatted);
  }

  /**
   * Sendet eine private Nachricht an einen Spieler.
   * @param {string} target - Spielername
   * @param {string} message - Nachricht
   */
  sendPrivateMessage(target, message) {
    return this.sendMessage(`/msg ${target} ${message}`);
  }

  /**
   * Gibt den aktuellen Status der Bridge zurück.
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
      bankBalance: this.bankBalance?.amount ?? null,
      bankBalanceAt: this.bankBalance?.at ?? null,
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
      // Sofort senden: Nach dem Spawn gibt es ein Fenster, in dem Senden
      // funktioniert – das wird direkt genutzt (Queue + Invite-Resends).
      this._pumpSendQueue();
      this._resendUnackedInvites();
      // Bankstand nach dem Spawn einmalig abfragen (etwas verzoegert,
      // damit die Chat-Sitzung steht).
      setTimeout(() => {
        if (this.isConnected) this.queryBankBalance();
      }, 10000);
      // Online-Status mit der echten Spielerliste abgleichen (loest
      // veraltete is_online-Werte, z.B. nach verpassten Join/Leave-Events).
      const reconcile = () => {
        try {
          if (!this.isConnected || !this.bot || !this.bot.players) return;
          const onlineIgns = Object.keys(this.bot.players);
          db.reconcileOnlineStates(onlineIgns);
          eventBus.emitToDashboard('playerUpdate', db.listUsers());
        } catch (err) {
          logger.warn(`[Minecraft] Online-Abgleich fehlgeschlagen: ${err.message}`);
        }
      };
      reconcile();
      // Spielerliste ist direkt nach dem Spawn ggf. noch unvollstaendig.
      setTimeout(reconcile, 15000);
      this._broadcastStatus();
    });

    bot.on('end', (reason) => {
      this.isConnected = false;
      this.lastDisconnectAt = Date.now();
      logger.warn(`[Minecraft] Verbindung getrennt: ${reason}`);
      this._recoverLastSend();
      try {
        db.setAllUsersOffline();
        eventBus.emitToDashboard('playerUpdate', db.listUsers());
      } catch {
        // Ignorieren
      }
      this._broadcastStatus();
      this._scheduleReconnect();
    });

    bot.on('kicked', (reason) => {
      this.isConnected = false;
      this.lastDisconnectAt = Date.now();
      const parsedReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
      logger.warn(`[Minecraft] Vom Server gekickt: ${parsedReason}`);
      this._recoverLastSend();
      try {
        db.setAllUsersOffline();
        eventBus.emitToDashboard('playerUpdate', db.listUsers());
      } catch {
        // Ignorieren
      }
      this._broadcastStatus();
      this._scheduleReconnect();
    });

    bot.on('error', (err) => {
      logger.error(`[Minecraft] Bot-Fehler: ${err.message}`);
    });

    // TPS- und Ping-Überwachung
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

      // Ping über Spieler-Metadaten abfragen
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

    // Whisper/Nachrichten an den Bot (z.B. "/msg Bot 123456")
    bot.on('whisper', (username, message) => {
      if (!username) return;
      logger.info(`[Minecraft] Whisper von "${username}": ${message}`);
      this._handleRawMessage(`<${username}> ${message}`);
    });
  }

  /**
   * Verarbeitet eine rohe Textnachricht mit Regex-Erkennung und Auto-Detection.
   * Prüft konfigurierbare Patterns, dann Fallback-Heuristik für unbekannte Formate.
   * @param {string} text
   */
  async _handleRawMessage(text) {
    const patterns = configService.getCompiledPatterns();
    let handledCategory = MessageCategory.OTHER;
    let author = null;
    let messageContent = text;

    // Bankstands-Antwort auf eigene /balance-Abfrage (parallele Erkennung)
    this._checkBankBalance(text);

    // Team-Einladungs-Antworten vom Server immer zuerst prüfen
    // (z.B. "TEAM » xxx is already in a team." oder "No entity was found").
    // Der exakte Server-Text wird mit Error-Code an den Discord-User weitergegeben.
    if (this.discordClient && (await this._handleTeamInviteResponse(text))) {
      handledCategory = MessageCategory.SYSTEM;
    }

    // IMMER zuerst auf Verifizierungscode prüfen (egal welches Format)
    // Code ist nur 5 Minuten gültig und der Absender-IGN wird geprueft.
    // Laenge kommt aus den Settings (Standard 6), damit laengere Codes
    // aus dem Dashboard auch erkannt werden.
    const verifySettings = configService.get('verify', {});
    const verifyCodeLength = verifySettings.codeLength || 6;
    const codeMatch = text.match(new RegExp(`\\b\\d{${verifyCodeLength}}\\b`));
    if (codeMatch && this.discordClient) {
      const senderName = this._extractSenderFromMessage(text, patterns);
      if (senderName) {
        await this._checkVerificationCode(codeMatch[0], senderName);
      }
    }

    // 1. Spieler-Chat Prüfung
    if (patterns.PLAYER_CHAT && patterns.PLAYER_CHAT.test(text)) {
      const match = text.match(patterns.PLAYER_CHAT);
      author = match[1];
      messageContent = match[2];
      handledCategory = MessageCategory.CHAT;
    }
    // 2. Private Nachricht / Whisper an Bot
    // Hinweis: Der Code-Check laeuft bereits universell oben, hier kein
    // zweiter Aufruf (sonst kaemen Erfolg + Fehler gleichzeitig).
    else if (patterns.PRIVATE_MESSAGE && patterns.PRIVATE_MESSAGE.test(text)) {
      handledCategory = MessageCategory.PRIVATE;
      const match = text.match(patterns.PRIVATE_MESSAGE);
      const sender = match ? match[1] : null;
      const body = match ? match[2] : text;
      author = sender;
      messageContent = body;
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
    // 5. Team-Einladung gesendet (Server-Bestätigung -> kein Resend noetig).
    // Erst JETZT kommt das "Zahlung erkannt"-Embed: erst checken, dann melden.
    else if (patterns.TEAM_INVITED && patterns.TEAM_INVITED.test(text)) {
      handledCategory = MessageCategory.SYSTEM;
      logger.info(`[Minecraft] Team-Einladung erkannt: ${text}`);
      const invitedMatch = text.match(/invited\s+(\.?[A-Za-z0-9_]{3,16})/i);
      if (invitedMatch && this.pendingTeamInvites) {
        const tracked = this.pendingTeamInvites.get(invitedMatch[1].toLowerCase());
        if (tracked) tracked.acked = true;
      }
      if (invitedMatch && this.discordClient) {
        const invitedUser = db.findUserByIgnLoose(invitedMatch[1]);
        if (invitedUser?.discord_id) {
          await announcePaymentConfirmed(invitedUser.discord_id);
        }
      }
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
    // 8. Zahlungs- / Transfer-Erkennung. Die Server-Ausgaben unterscheiden
    // sich je nach Sprache/Plugin; die Daten werden deshalb separat robust
    // extrahiert statt auf feste Regex-Gruppen zu vertrauen.
    else if (this._extractPaymentData(text, patterns)) {
      handledCategory = MessageCategory.PAYMENT;
      const payment = this._extractPaymentData(text, patterns);
      if (payment && this.discordClient) {
        await this._handlePayment(payment.sender, payment.amount, payment.recipient, text);
      } else {
        const payEntry = db.addLog({
          category: LogCategory.PAYMENT,
          title: 'Zahlung im Spiel erkannt',
          description: text,
        });
        eventBus.emitToDashboard('logUpdate', payEntry);
      }
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
    // 13. Fallback-Heuristik: intelligente Klassifizierung für unbekannte Formate
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
   * Liest eine Zahlungsbestätigung aus verbreiteten Minecraft-Serverformaten.
   * Beim "You received"-Format sieht der Empfänger-Bot die Transaktion;
   * der konfigurierte Empfänger ist dort daher eindeutig.
   */
  _extractPaymentData(text, patterns) {
    const configuredRecipient = configService.get('payment', {}).recipient || configService.env.minecraftUsername || 'DicksTeamBank';
    // Betraege wie 50, 50.000, $50K oder $2M verstehen (K = Tausend, M = Million).
    const parseAmount = (value) => {
      const str = String(value).trim();
      const suffix = str.slice(-1).toLowerCase();
      if (suffix === 'k' || suffix === 'm') {
        const num = Number.parseFloat(str.slice(0, -1).replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(num)) return NaN;
        return Math.round(num * (suffix === 'k' ? 1000 : 1000000));
      }
      return Number.parseInt(str.replace(/[^\d]/g, ''), 10);
    };
    // Hinweis: Betragsmuster enthalten optional K/M-Suffix (z.B. "$50K").
    let match = text.match(/you\s+received\s+\$?([\d.,]+\s*[KkMm]?)\s+from\s+(\.?[A-Za-z0-9_]{3,16})/i);
    if (match) return { amount: parseAmount(match[1]), sender: match[2], recipient: configuredRecipient };

    match = text.match(/(\.?[A-Za-z0-9_]{3,16})\s+(?:paid|sent|transferred)\s+\$?([\d.,]+\s*[KkMm]?)(?:\s+coins?)?\s+to\s+(\.?[A-Za-z0-9_]{3,16})/i);
    if (match) return { sender: match[1], amount: parseAmount(match[2]), recipient: match[3] };

    match = text.match(/(\.?[A-Za-z0-9_]{3,16})\s+hat\s+\$?([\d.,]+\s*[KkMm]?)(?:\s+coins?)?\s+(?:an\s+)?(\.?[A-Za-z0-9_]{3,16})\s+(?:bezahlt|ueberwiesen|überwiesen)/i);
    if (match) return { sender: match[1], amount: parseAmount(match[2]), recipient: match[3] };

    // Eigene Serverausgabe kann über PAYMENT konfiguriert werden. Das Format
    // muss dabei Sender, Betrag und Empfänger in dieser Reihenfolge enthalten.
    match = patterns.PAYMENT ? text.match(patterns.PAYMENT) : null;
    if (match?.[1] && match?.[2] && match?.[3]) {
      return { sender: match[1], amount: parseAmount(match[2]), recipient: match[3] };
    }
    return null;
  }

  /**
   * Intelligente Fallback-Klassifizierung für Nachrichten, die auf kein Pattern passen.
   * Prüft Keywords und Struktur, um eine sinnvolle Kategorie zuzuweisen.
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
   * Wertet Server-Antworten auf "/team invite <IGN>" aus und schickt dem
   * betroffenen Discord-User den exakten Server-Text plus Error-Code.
   * @param {string} text
   * @returns {Promise<boolean>} true wenn die Nachricht eine Team-Antwort war
   */
  async _handleTeamInviteResponse(text) {
    const lower = text.toLowerCase();
    const isTeamMsg = lower.includes('team »') || lower.includes('team:') || lower.startsWith('team ');
    if (!isTeamMsg) return false;

    let errorCode = null;
    let hint = '';
    let ign = null;

    const alreadyMatch = text.match(/([A-Za-z0-9_]{3,16})\s+is\s+already\s+in\s+a\s+team/i);
    if (alreadyMatch) {
      errorCode = 'TEAM_ALREADY_IN_TEAM';
      ign = alreadyMatch[1];
      hint = 'Der Spieler ist bereits in einem Team. Er muss sein aktuelles Team erst verlassen, danach kann die Einladung erneut gesendet werden.';
    } else if (/no\s+entity\s+(?:was|were)\s+found/i.test(text)) {
      errorCode = 'TEAM_PLAYER_NOT_FOUND';
      const nameMatch = text.match(/([A-Za-z0-9_]{3,16})/);
      // Bei "No entity was found" steht oft kein Name dabei -> letzte Einladung nehmen
      ign = nameMatch && nameMatch[1].toLowerCase() !== 'team' ? nameMatch[1] : this._lastInvitedIgn();
      hint = 'Der Spieler wurde auf dem Server nicht gefunden. Prüfe die Schreibweise und ob der Spieler online ist.';
    } else if (/not\s+found|is\s+not\s+online|unknown\s+player/i.test(text)) {
      errorCode = 'TEAM_PLAYER_NOT_FOUND';
      const nameMatch = text.match(/([A-Za-z0-9_]{3,16})\s+(?:not\s+found|is\s+not\s+online)/i);
      ign = nameMatch ? nameMatch[1] : this._lastInvitedIgn();
      hint = 'Der Spieler wurde auf dem Server nicht gefunden. Prüfe die Schreibweise und ob der Spieler online ist.';
    } else if (/does\s+not\s+accept\s+invit/i.test(text)) {
      errorCode = 'TEAM_INVITES_DISABLED';
      // Kein Name in der Nachricht -> letzte Einladung nehmen
      ign = this._lastInvitedIgn();
      hint = 'Der Spieler hat Team-Einladungen deaktiviert. Er muss Einladungen erst erlauben (z.B. per Team-Einstellungsbefehl im Spiel), danach Nochmal drücken.';
    } else if (/\bteam\b[^.]{0,30}\bfull\b|\bfull\b[^.]{0,30}\bteam\b/i.test(text)) {
      errorCode = 'TEAM_FULL';
      // Meist ohne Name ("TEAM » This team is full.") -> letzte Einladung nehmen
      const fullNameMatch = text.match(/([A-Za-z0-9_]{3,16})'?s?\s+team\s+is\s+full/i);
      ign = (fullNameMatch && !/^team$/i.test(fullNameMatch[1]) ? fullNameMatch[1] : null) || this._lastInvitedIgn();
      hint = 'Das Team ist voll. Es muss erst Platz geschaffen werden (Mitglied entfernen), danach Nochmal drücken.';
    } else if (/invit/i.test(text)) {
      // Erfolg ("invited ...") wird von der bestehenden TEAM_INVITED-Erkennung geloggt.
      return false;
    } else {
      return false;
    }

    // Discord-User aufloesen: erst ausstehende Einladung, dann DB per IGN
    let discordId = null;
    let ownInvite = false;
    if (ign && this.pendingTeamInvites) {
      const pending = this.pendingTeamInvites.get(String(ign).toLowerCase());
      if (pending && Date.now() - pending.sentAt < 5 * 60 * 1000) {
        ownInvite = true;
        if (pending?.discordId) discordId = pending.discordId;
      }
    }
    if (!discordId && ign) {
      const user = db.findUserByIgnLoose(ign);
      if (user?.discord_id) discordId = user.discord_id;
    }
    if (!discordId && this.pendingTeamInvites && this.pendingTeamInvites.size > 0) {
      // Fallback: juengste Einladung (für "No entity was found" ohne Namen)
      let newest = null;
      for (const entry of this.pendingTeamInvites.values()) {
        if (!newest || entry.sentAt > newest.sentAt) newest = entry;
      }
      if (newest?.discordId && Date.now() - newest.sentAt < 2 * 60 * 1000) {
        ownInvite = true;
        discordId = newest.discordId;
      }
    }

    // Schutz: Nur Antworten auf EIGENE Einladungen werten. Fremde
    // TEAM-Nachrichten anderer Spieler dürfen weder DMs noch Refunds ausloesen.
    if (!ownInvite) {
      logger.info(`[Minecraft] TEAM-Nachricht ohne eigene Einladung ignoriert: ${text}`);
      return false;
    }

    // Diese Antwort bestätigt die Einladung (Erfolg ODER Fehler) –
    // kein Resend nach Reconnect mehr noetig.
    if (ign && this.pendingTeamInvites) {
      const tracked = this.pendingTeamInvites.get(String(ign).toLowerCase());
      if (tracked) tracked.acked = true;
    }

    // Alte Eintraege aufräumen
    if (this.pendingTeamInvites) {
      for (const [key, entry] of this.pendingTeamInvites) {
        if (Date.now() - entry.sentAt > 5 * 60 * 1000) this.pendingTeamInvites.delete(key);
      }
    }

    logger.warn(`[Minecraft] Team-Einladung Fehler ${errorCode}: ${text}`);

    const errorEntry = db.addLog({
      category: LogCategory.TEAM,
      title: `Team-Einladung Fehler (${errorCode})`,
      description: `${ign ? `Spieler **${ign}**: ` : ''}\`${text}\``,
    });
    eventBus.emitToDashboard('logUpdate', errorEntry);

    if (discordId && this.discordClient) {
      await this._sendTeamInviteError(discordId, ign, errorCode, text, hint);
    }
    return true;
  }

  /**
   * Sendet die finale Fehler-DM nach fehlgeschlagener Einladung.
   * Unterdrueckt die ausstehende Erfolgsmeldung (EINE finale Nachricht)
   * und startet den Refund-Timer.
   */
  async _sendTeamInviteError(discordId, ign, errorCode, serverText, hint) {
    // Ausstehende Erfolgsmeldung unterdruecken bzw. bereits gesendete
    // "Zahlung erkannt"-Nachricht löschen: Bei einem Invite-Fehler kommt
    // NUR diese EINE finale Nachricht.
    const pending = consumePendingPaymentConfirm(discordId);
    await deleteAnnouncedPaymentMessage(this.discordClient, pending);
    const amountLine = pending?.payment?.amount
      ? `Deine Zahlung (**$${pending.payment.amount.toLocaleString('de-DE')}**) wurde erkannt, aber die Einladung ist fehlgeschlagen.\n\n`
      : `Deine Zahlung wurde erkannt, aber die Einladung ist fehlgeschlagen.\n\n`;

    // Refund-Timer (10 Min): Tut der Spieler nichts, wird die bestätigte
    // Zahlung automatisch per /pay zurückgezahlt. Retry/Join stornieren ihn.
    const confirmedPayment = db.findLatestConfirmedPayment(discordId);
    if (confirmedPayment) {
      scheduleRefundAfterInviteError(this.discordClient, discordId, confirmedPayment);
    }
    try {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      const user = await this.discordClient.users.fetch(discordId);
      if (user) {
        const dm = await user.createDM();
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('Team-Einladung fehlgeschlagen')
          .setDescription(
            amountLine +
            `**Fehlercode:** \`${errorCode}\`\n\n` +
            `**Server-Antwort:**\n\`\`\`\n${serverText}\n\`\`\`\n` +
            `${hint}`,
          )
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_team_invite_retry')
            .setLabel('Nochmal')
            .setStyle(ButtonStyle.Primary),
        );
        await dm.send({ embeds: [embed], components: [row] });
      }
    } catch (err) {
      logger.warn(`[Minecraft] Konnte Team-Fehler-DM nicht senden: ${err.message}`);
    }
  }

  /**
   * Sendet unbestaetigte Einladungen nach (Re-)Spawn erneut.
   * Umgeht Kicks beim Senden (chat_validation_failed): Was wegen dem Kick
   * nie beantwortet wurde, geht nach dem Reconnect automatisch nochmal raus.
   * Nach MAX_INVITE_RESENDS Versuchen ohne Antwort: Aufgabe + Fehler-DM.
   */
  _resendUnackedInvites() {
    if (!this.pendingTeamInvites) return;
    const now = Date.now();
    for (const [key, entry] of this.pendingTeamInvites) {
      if (entry.acked) continue;
      if (now - entry.sentAt > this.INVITE_RESEND_WINDOW_MS) continue;
      if (!entry.discordId) continue;
      if (entry.resends >= this.MAX_INVITE_RESENDS) {
        entry.acked = true;
        logger.error(`[Minecraft] Invite für ${key} nach ${entry.resends} Versuchen aufgegeben.`);
        const errorEntry = db.addLog({
          category: LogCategory.TEAM,
          title: 'Team-Einladung fehlgeschlagen (TEAM_SEND_FAILED)',
          description: `Spieler **${key}**: keine Server-Antwort nach ${entry.resends} Versuchen (Kick beim Senden?).`,
        });
        eventBus.emitToDashboard('logUpdate', errorEntry);
        if (this.discordClient) {
          this._sendTeamInviteError(
            entry.discordId,
            key,
            'TEAM_SEND_FAILED',
            'Keine Server-Antwort (Verbindung beim Senden verloren).',
            'Der Bot wurde beim Senden getrennt. Druecke Nochmal für einen neuen Versuch – passiert 10 Minuten nichts, kommt das Geld automatisch zurück.',
          );
        }
        continue;
      }
      entry.resends += 1;
      entry.sentAt = Date.now();
      logger.warn(`[Minecraft] Sende unbestaetigte Einladung erneut (Versuch ${entry.resends}): ${key}`);
      this.sendCommand(`/team invite ${key}`);
      const logEntry = db.addLog({
        category: LogCategory.TEAM,
        title: 'Team-Einladung erneut gesendet',
        description: `Einladung für **${key}** nach Reconnect erneut gesendet (Versuch ${entry.resends}).`,
      });
      eventBus.emitToDashboard('logUpdate', logEntry);
    }
  }

    /**
   * Meldet dem User, dass die Einladung gar nicht gesendet werden konnte
   * (Bot offline). Unterdrueckt die ausstehende Erfolgsmeldung.
   */
  async _notifyTeamInviteNotSent(ign, discordId) {
    let targetId = discordId || null;
    if (!targetId && ign) {
      const user = db.findUserByIgnLoose(ign);
      if (user?.discord_id) targetId = user.discord_id;
    }
    if (targetId) consumePendingPaymentConfirm(targetId);

    // Auch hier Refund-Timer starten: Passiert 10 Min nichts, kommt das
    // Geld automatisch zurück (mit Offline-Retry im Refund selbst).
    if (targetId && this.discordClient) {
      const confirmedPayment = db.findLatestConfirmedPayment(targetId);
      if (confirmedPayment) {
        scheduleRefundAfterInviteError(this.discordClient, targetId, confirmedPayment);
      }
    }

    const offlineEntry = db.addLog({
      category: LogCategory.TEAM,
      title: 'Team-Einladung nicht gesendet (TEAM_BOT_OFFLINE)',
      description: `Bot ist offline – keine Einladung für **${ign}** gesendet.`,
    });
    eventBus.emitToDashboard('logUpdate', offlineEntry);

    if (targetId && this.discordClient) {
      try {
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
        const user = await this.discordClient.users.fetch(targetId);
        if (user) {
          const dm = await user.createDM();
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Team-Einladung nicht gesendet')
            .setDescription(
              `Deine Zahlung wurde erkannt, aber der Bot ist gerade nicht auf dem Minecraft-Server.\n\n` +
              `**Fehlercode:** \`TEAM_BOT_OFFLINE\`\n\n` +
              `Druecke Nochmal, sobald der Bot wieder online ist.`,
            )
            .setTimestamp();
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_team_invite_retry')
              .setLabel('Nochmal')
              .setStyle(ButtonStyle.Primary),
          );
          await dm.send({ embeds: [embed], components: [row] });
        }
      } catch (err) {
        logger.warn(`[Minecraft] Konnte Offline-Fehler-DM nicht senden: ${err.message}`);
      }
    }
  }

  /** Juengste eingeladene IGN (Fallback wenn Server-Antwort keinen Namen enthaelt). */
  _lastInvitedIgn() {
    if (!this.pendingTeamInvites || this.pendingTeamInvites.size === 0) return null;
    let newestKey = null;
    let newest = null;
    for (const [key, entry] of this.pendingTeamInvites) {
      if (!newest || entry.sentAt > newest.sentAt) {
        newest = entry;
        newestKey = key;
      }
    }
    if (newest && Date.now() - newest.sentAt < 2 * 60 * 1000) return newestKey;
    return null;
  }

  /**
   * Extrahiert den Absender-Namen aus jeder Art von Chat-Nachricht.
   * Funktioniert mit <Name>, [Name -> ...], und freiem Text.
   * @param {string} text
   * @param {object} patterns
   * @returns {string|null}
   */
  _extractSenderFromMessage(text, patterns) {
    // <Spieler> Nachricht
    const chatMatch = text.match(/^<([^>]+)>/);
    if (chatMatch) return chatMatch[1].trim();

    // [Spieler -> Empfänger] Nachricht
    const pmMatch = text.match(/^\[([^\]]+)\s*->/);
    if (pmMatch) return pmMatch[1].trim();

    return null;
  }

  /**
   * Prüft, ob ein Text einen 6-stelligen Verifizierungscode enthaelt.
   * @param {string} text
   * @param {string|null} senderIgn
   */
  async _checkVerificationCode(text, senderIgn) {
    const verifyCodeLength = configService.get('verify', {}).codeLength || 6;
    const codeMatch = text.match(new RegExp(`\\b\\d{${verifyCodeLength}}\\b`));
    if (!codeMatch) return;

    const code = codeMatch[0];
    const cleanSender = senderIgn ? senderIgn.trim() : null;

    // Doppelverarbeitung verhindern (Chat-Event + Whisper-Event für dieselbe Nachricht)
    const dedupeKey = `${code}:${(cleanSender || '').toLowerCase()}`;
    const lastSeen = this.processedCodes.get(dedupeKey);
    if (lastSeen && Date.now() - lastSeen < 15000) {
      logger.info(`[Minecraft] Code ${code} von "${cleanSender || 'unbekannt'}" bereits verarbeitet – Überspringe Doppel.`);
      return;
    }
    this.processedCodes.set(dedupeKey, Date.now());
    for (const [key, ts] of this.processedCodes) {
      if (Date.now() - ts > 60000) this.processedCodes.delete(key);
    }

    logger.info(`[Minecraft] Verifizierungscode erkannt: ${code} von "${cleanSender || 'unbekannt'}"`);

    if (!this.discordClient) {
      logger.warn('[Minecraft] Discord-Client noch nicht verfuegbar für Verifizierung.');
      return;
    }

    const result = await completeVerification(this.discordClient, code, cleanSender);

    if (result.ok) {
      // KEINE Ingame-Bestätigung: Jede gesendete Nachricht kann auf Servern
      // mit Chat-Signierung einen chat_validation_failed-Kick ausloesen.
      // Der User erhaelt Erfolg + Zahlungsaufforderung per Discord-DM.
      // Keine Erfolgs-DM hier: verifyService.completeVerification schickt bereits
      // in der richtigen Reihenfolge erst die Bestätigung, dann die Zahlungsaufforderung.
    } else {
      // Gleicher Grund: kein /msg bei Fehlern, nur Discord-DM.
      // Fehler-DM senden (mit Nochmal-Button für neuen Versuch).
      // Faellt der Code weg (ungültig/abgelaufen), gibt es keine discordId
      // aus dem Code – dann wird der Sender per IGN aufgeloest, damit der
      // User trotzdem eine Fehler-DM bekommt statt gar nichts.
      let targetDiscordId = result.discordId || null;
      if (!targetDiscordId && cleanSender) {
        const userByIgn = db.findUserByIgnLoose(cleanSender);
        if (userByIgn?.discord_id) targetDiscordId = userByIgn.discord_id;
      }
      if (targetDiscordId) {
        const isMismatch = result.message === 'MISMATCH';
        await this._sendVerifyResult(targetDiscordId, {
          title: 'Verifizierung fehlgeschlagen',
          description: isMismatch
            ? `Der eingegebene Minecraft-Name stimmt nicht mit dem Konto ueberein, das den Code gesendet hat.\n\n` +
              `Klicke auf Nochmal und schicke dann deinen exakten Minecraft-Namen.`
            : `Der Code ist ungültig oder abgelaufen.\n\n` +
              `Klicke auf Nochmal und schicke deinen exakten Minecraft-Namen, um einen neuen Code zu bekommen.`,
          color: 'error',
          button: { customId: 'btn_verify_retry', label: 'Nochmal' },
        });
      }
    }
  }

  /**
   * Sendet eine DM mit dem Verifizierungsergebnis.
   * @param {string} discordId
   * @param {object} embedData - { title, description, color }
   */
  async _sendVerifyResult(discordId, embedData) {
    if (!this.discordClient || !discordId) return;
    try {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      const user = await this.discordClient.users.fetch(discordId);
      if (!user) return;
      const dm = await user.createDM();

      const colorMap = { success: 0x57F287, error: 0xED4245, primary: 0xAEC6CF };
      const embed = new EmbedBuilder()
        .setTitle(embedData.title)
        .setDescription(embedData.description)
        .setColor(colorMap[embedData.color] || 0xAEC6CF)
        .setTimestamp();

      const msgOptions = { embeds: [embed] };

      // Optionaler Weiter-Button
      if (embedData.button) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(embedData.button.customId)
            .setLabel(embedData.button.label)
            .setStyle(ButtonStyle.Success),
        );
        msgOptions.components = [row];
      }

      await dm.send(msgOptions);
    } catch (err) {
      logger.warn(`[Minecraft] Konnte keine Verifizierungs-DM senden: ${err.message}`);
    }
  }

  /**
   * Behandelt den Beitritt eines Spielers auf dem Server.
   * @param {string} ign
   */
  _handlePlayerJoin(ign) {
    logger.info(`[Minecraft] Spieler beigetreten: ${ign}`);
    const user = db.findUserByIgnLoose(ign);
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
   * Entfernt Verifizierung, Rollen und setzt den Nickname zurück.
   * @param {string} ign
   */
  async _handlePlayerLeave(ign) {
    logger.info(`[Minecraft] Spieler verlassen: ${ign}`);
    const user = db.findUserByIgnLoose(ign);
    if (user && user.discord_id) {
      // Status auf unverified zuruecksetzen
      db.upsertUser({
        discord_id: user.discord_id,
        ign: null,
        status: PlayerStatus.UNVERIFIED,
        team: null,
        is_online: 0,
      });

      // Discord-Rollen entfernen und Nickname zuruecksetzen
      if (this.discordClient) {
        try {
          const guildId = configService.env.discordGuildId;
          if (guildId) {
            const guild = await this.discordClient.guilds.fetch(guildId);
            if (guild) {
              await removeRole(guild, user.discord_id, 'roleVerified');
              await removeRole(guild, user.discord_id, 'roleTeam');
              await removeRankRoles(guild, user.discord_id);
              await grantRole(guild, user.discord_id, 'roleJoin');
              await syncNickname(guild, user.discord_id, '');
            }
          }
        } catch (err) {
          logger.warn(`[Minecraft] Konnte Discord-Rollen nicht entfernen für ${ign}: ${err.message}`);
        }
      }

      // Benachrichtigung im Log-Kanal
      if (this.discordClient) {
        const { sendLogEmbed } = await import('../discord/helpers.js');
        await sendLogEmbed(this.discordClient, {
          category: LogCategory.VERIFY,
          title: 'Verifizierung entfernt',
          description: `<@${user.discord_id}> (**${ign}**) hat den Server verlassen. Verifizierung wurde automatisch entfernt.`,
          color: 'warning',
        });
      }
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
   * Behandelt eine erkannte Zahlung aus dem Minecraft-Chat.
   * @param {string} senderIgn
   * @param {number} amount
   * @param {string} recipient
   * @param {string} chatMessage
   */
  async _handlePayment(senderIgn, amount, recipient, chatMessage) {
    logger.info(`[Minecraft] Zahlung erkannt: ${senderIgn} -> ${recipient} ($${amount})`);

    if (!this.discordClient) {
      logger.warn('[Minecraft] Discord-Client nicht verfuegbar für Zahlungsverarbeitung.');
      return;
    }

    const result = await validatePayment(this.discordClient, senderIgn, amount, recipient, chatMessage);

    if (result.ok) {
      // Zahlung erfolgreich -> Team-Invite ausloesen
      await confirmPaymentAndInviteTeam(this.discordClient, result.user, result.payment);
    } else if (['WRONG_AMOUNT', 'WRONG_RECIPIENT'].includes(result.error)) {
      // Falscher Betrag oder Empfänger -> präzise Fehler-DM an den Spieler.
      const user = db.findUserByIgnLoose(senderIgn);
      if (user && user.discord_id) {
        await sendPaymentFailedEmbed(this.discordClient, user.discord_id, result.error, {
          amount,
          requiredAmount: result.requiredAmount,
          recipient,
          requiredRecipient: result.requiredRecipient,
        });
      }
    } else {
      // Alle anderen Ablehnungen (UNKNOWN_PLAYER, NOT_WAITING,
      // NO_ACTIVE_PAYMENT, WRONG_IGN) landen im Dashboard-Log, damit ein
      // "er macht nichts" sofort erklaerbar ist (keine DM = kein Spam).
      const reasonMap = {
        UNKNOWN_PLAYER: 'Unbekannter Spieler (nicht verlinkt)',
        NOT_WAITING: 'Keine offene Zahlung (Status passt nicht)',
        NO_ACTIVE_PAYMENT: 'Kein aktives Payment gefunden',
        WRONG_IGN: 'IGN passt nicht zum Payment',
      };
      const entry = db.addLog({
        category: LogCategory.PAYMENT,
        title: 'Zahlung ignoriert',
        description: `**${senderIgn}** -> **${recipient}** ($${amount}): ${reasonMap[result.error] || result.error}. Nachricht: \`${chatMessage}\``,
      });
      eventBus.emitToDashboard('logUpdate', entry);
    }
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
   * Sendet Status-Updates an das Dashboard über den Event-Bus.
   */
  _broadcastStatus() {
    eventBus.emitToDashboard('statsUpdate', this.getStatus());
  }
}

export const bridgeInstance = new MinecraftBridge();
export default bridgeInstance;
