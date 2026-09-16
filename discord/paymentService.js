// Variable: Payment-Service.
// Verwaltet den Zahlungsprozess nach der Verifizierung.

import * as db from '../database/index.js';
import configService from '../server/config.js';
import logger from '../shared/logger.js';
import { PlayerStatus, PaymentStatus, LogCategory, sanitizeIgn, normalizeIgn } from '../shared/types.js';
import eventBus from '../shared/events.js';
import { syncNickname, grantRole, removeRole, sendLogEmbed, sendDm } from './helpers.js';

/**
 * Erstellt einen aktiven Payment-Eintrag falls keiner existiert und setzt
 * den User auf WAITING_PAYMENT. Idempotent – rueckgabewert ist immer gültig.
 */
function ensureActivePayment(discordId, ign) {
  const existing = db.findActivePayment(discordId);
  if (existing) return existing;

  const paymentSettings = configService.get('payment', {});
  const amount = paymentSettings.amount || 250000;
  const recipient = paymentSettings.recipient || 'DicksTeamBank';
  const timeoutMs = configService.get('timeouts', {}).paymentTimeoutMs || 10 * 60 * 1000;

  const user = db.findUserByDiscord(discordId);
  const finalIgn = ign || user?.ign;

  db.upsertUser({
    discord_id: discordId,
    status: PlayerStatus.WAITING_PAYMENT,
  });

  const payment = db.createPayment({
    discordId,
    ign: finalIgn,
    amount,
    recipient,
    timeoutMs,
  });

  eventBus.emitToDashboard('paymentUpdate', db.listPayments());
  logger.info(`[Payment] Zahlung erwartet für ${finalIgn} (${discordId}): $${amount} an ${recipient}`);
  return payment;
}

/**
 * Sendet das Payment-Embed an einen verifizierten Nutzer.
 * Erstellt dabei SOFORT den Payment-Eintrag und setzt WAITING_PAYMENT,
 * damit die Zahlung auch erkannt wird, wenn direkt ohne Button-Klick gezahlt wird.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {string} ign
 */
export async function sendPaymentEmbed(client, discordId, ign) {
  const payment = ensureActivePayment(discordId, ign);
  const { amount, recipient } = payment;

  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('Team-Beitritt – Einzahlung erforderlich')
    .setDescription(
      `Um dem Team beizutreten, überweise jetzt im Minecraft-Server:\n\n` +
      `**Betrag:** $${amount.toLocaleString('de-DE')}\n` +
      `**Empfänger:** \`${recipient}\`\n\n` +
      `Die Zahlung wird ab jetzt automatisch überwacht. Klicke auf **Zahlung starten**, um die genaue Änweisung zu sehen.`,
    )
    .setFooter({ text: `Payment-ID: ${payment.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_payment_start')
      .setLabel('Zahlung starten')
      .setStyle(ButtonStyle.Success),
  );

  try {
    const user = await client.users.fetch(discordId);
    if (!user) return;
    const dm = await user.createDM();
    await dm.send({ embeds: [embed], components: [row] });
  } catch (err) {
    logger.warn(`[Payment] Konnte Payment-Embed nicht senden an ${discordId}: ${err.message}`);
  }
}

/**
 * Startet die Zahlungsüberwachung. Die Änweisung wird vom Button-Handler in
 * derselben Discord-Interaktion angezeigt, damit keine verwirrenden DM-Hinweise entstehen.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {string} ign
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function handlePaymentButton(client, discordId, ign) {
  const user = db.findUserByDiscord(discordId);
  if (!user || (user.status !== PlayerStatus.VERIFIED && user.status !== PlayerStatus.WAITING_PAYMENT)) {
    return { ok: false, error: 'Du musst zuerst verifiziert sein.' };
  }

  // Idempotent: vorhandenen aktiven Payment-Eintrag weiterverwenden,
  // sonst neu anlegen. Dadurch funktioniert auch "direkt zahlen ohne Klick".
  const alreadyWaiting = !!db.findActivePayment(discordId);
  const payment = ensureActivePayment(discordId, ign || user.ign);

  if (!alreadyWaiting) {
    // Neustart nach Invite-Fehler: Ein alter Refund-Timer für eine fruehere
    // bestätigte Zahlung wird verworfen (manuell im Log prüfen).
    if (pendingRefunds.has(discordId)) {
      cancelRefund(discordId);
      logger.warn(`[Payment] Alter Refund-Timer für ${discordId} durch Neuzahlung verworfen (Payment #${payment.id} neu). Altes Payment manuell prüfen.`);
      await sendLogEmbed(client, {
        category: LogCategory.PAYMENT,
        title: 'Refund verworfen',
        description: `<@${discordId}> hat neu gezahlt – ein alter Refund-Timer wurde gestoppt. Alte bestätigte Payments bitte manuell prüfen.`,
        color: 'warning',
      });
    }
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Zahlung erwartet',
      description: `<@${discordId}> (${payment.ign}) soll $${payment.amount.toLocaleString('de-DE')} an **${payment.recipient}** überweisen.`,
      color: 'info',
    });
  }

  return { ok: true, payment, alreadyWaiting };
}

/** Baut die endgültige Änweisung nach dem Start der Zahlungsüberwachung. */
export async function buildPaymentInstructionEmbed(payment) {
  const { EmbedBuilder } = await import('discord.js');
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Zahlung wird überwacht')
    .setDescription(
      `Überweise jetzt genau:\n\n\`\`\`\n/pay ${payment.recipient} ${payment.amount}\n\`\`\`\n\n` +
      'Der Bot erkennt die Zahlung automatisch. Sobald sie bestätigt ist, erhaeltst du direkt eine Team-Einladung im Spiel.',
    )
    .setFooter({ text: `Payment-ID: ${payment.id} · Läuft bis ${new Date(payment.timeout_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` })
    .setTimestamp();
}

/**
 * Validiert eine erkannte Zahlung aus dem Minecraft-Chat.
 * Prüft: Sender = verifizierter IGN, Empfänger = TeamBank, Betrag >= erforderlich.
 * @param {import('discord.js').Client} client
 * @param {string} senderIgn
 * @param {number} amount
 * @param {string} recipient
 * @param {string} chatMessage
 * @returns {Promise<{ ok: boolean, payment?: object, error?: string }>}
 */
export async function validatePayment(client, senderIgn, amount, recipient, chatMessage) {
  // Spieler finden (tolerant: Case + Bedrock-Punkt egal)
  const user = db.findUserByIgnLoose(senderIgn);
  if (!user || !user.discord_id) {
    logger.info(`[Payment] Kein verifizierter Spieler für IGN: ${senderIgn}`);
    return { ok: false, error: 'UNKNOWN_PLAYER' };
  }

  // Status prüfen
  if (user.status !== PlayerStatus.WAITING_PAYMENT) {
    logger.info(`[Payment] Spieler ${senderIgn} hat Status ${user.status}, erwartet: waiting_payment`);
    return { ok: false, error: 'NOT_WAITING' };
  }

  // Aktives Payment finden
  const payment = db.findActivePayment(user.discord_id);
  if (!payment) {
    logger.info(`[Payment] Kein aktives Payment für ${senderIgn}`);
    return { ok: false, error: 'NO_ACTIVE_PAYMENT' };
  }

  if (normalizeIgn(user.ign) !== normalizeIgn(payment.ign)) {
    return { ok: false, error: 'WRONG_IGN' };
  }

  if (recipient && recipient.toLowerCase() !== payment.recipient.toLowerCase()) {
    logger.info(`[Payment] Falscher Empfänger: ${recipient} (erwartet: ${payment.recipient})`);
    return { ok: false, error: 'WRONG_RECIPIENT', recipient, requiredRecipient: payment.recipient };
  }

  // Betrag muss mindestens dem erforderlichen entsprechen (mehr ist ok).
  if (!Number.isFinite(amount) || amount < payment.amount) {
    logger.info(`[Payment] Zu wenig: $${amount} (erforderlich: $${payment.amount})`);
    return { ok: false, error: 'WRONG_AMOUNT', amount, requiredAmount: payment.amount };
  }
  if (amount > payment.amount) {
    logger.info(`[Payment] Überzahlt: $${amount} statt $${payment.amount} – akzeptiert.`);
  }

  // Payment als bestätigt markieren
  const confirmed = db.updatePaymentStatus(payment.id, PaymentStatus.CONFIRMED, {
    confirmedAt: new Date().toISOString(),
    chatMessage,
  });

  // Status des Spielers aktualisieren
  db.upsertUser({
    discord_id: user.discord_id,
    status: PlayerStatus.VERIFIED, // Zurück auf verified, Team-Invite folgt
    team: null,
  });

  logger.info(`[Payment] Zahlung bestätigt: ${senderIgn} hat $${amount} an ${recipient} überwiesen.`);

  return { ok: true, payment: confirmed, user };
}

/**
 * Sendet Erfolgs-Embed nach bestaegigter Zahlung und loest Team-Invite aus.
 * Ablauf: Invite wird SOFORT gesendet, die Erfolgs-DM aber erst nach kurzer
 * Wartezeit – damit bei einem Server-Fehler (z.B. "already in a team") NUR
 * die Fehlernachricht kommt und keine widerspruechliche Erfolgsmeldung.
 * @param {import('discord.js').Client} client
 * @param {object} user
 * @param {object} payment
 */
const pendingPaymentConfirms = new Map();

/** Baut das Standard-Embed "Zahlung erkannt" (Normalzustand nach der Zahlung). */
export async function buildPaymentConfirmedEmbed(payment) {
  const { EmbedBuilder } = await import('discord.js');
  const teamName = configService.get('team', {}).name || 'Dicks5';
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Zahlung erkannt')
    .setDescription(
      `Deine Einzahlung wurde erkannt.\n\n` +
      `**Betrag:** $${payment.amount.toLocaleString('de-DE')}\n\n` +
      `**Die Team-Einladung wird jetzt im Spiel gesendet.** ` +
      `Tippe im Chat auf **join Team** oder benutze diesen Command:\n\n` +
      '```\n' +
      `/team join ${teamName}\n` +
      '```',
    )
    .setTimestamp();
}

export function registerPendingPaymentConfirm(client, user, payment, { alreadyAnnounced = false, channelId = null, messageId = null } = {}) {
  const old = pendingPaymentConfirms.get(user.discord_id);
  if (old?.timer) clearTimeout(old.timer);
  // Erst checken, dann das Embed: Die Erfolgsmeldung kommt erst, wenn der
  // Server die Einladung bestätigt (TEAM_INVITED) oder nach 15s ohne
  // Antwort (Fallback). Kommt vorher ein Fehler, gibt es nur die EINE
  // Fehlernachricht und niemals ein Erfolgs-Embed davor.
  const entry = { payment, user, timer: null, client, channelId, messageId, announced: alreadyAnnounced };
  const timer = setTimeout(async () => {
    entry.timer = null;
    // Wurde der Normalzustand schon angezeigt (z.B. nach Nochmal-Klick),
    // dann nichts doppelt senden – nur auf Server-Antwort warten.
    // Der Eintrag bleibt bestehen, damit Fehler/Join die Nachricht finden.
    if (entry.announced) return;
    entry.announced = true;
    try {
      const discordUser = await client.users.fetch(user.discord_id);
      if (!discordUser) return;
      const dm = await discordUser.createDM();
      const sent = await dm.send({ embeds: [await buildPaymentConfirmedEmbed(payment)] });
      // Nachricht merken, damit spätere Uebergaenge (Fehler/Join) sie
      // löschen können statt ein zweites "Zahlung erkannt" zu schicken.
      entry.channelId = dm.id;
      entry.messageId = sent.id;
    } catch (err) {
      logger.warn(`[Payment] Konnte verzoegerte Erfolgs-DM nicht senden: ${err.message}`);
    }
  }, 15000);
  entry.timer = timer;
  pendingPaymentConfirms.set(user.discord_id, entry);
  return entry;
}

/** Holt und löscht eine ausstehende Payment-Bestätigung (für Invite-Fehler/Join). */
export function consumePendingPaymentConfirm(discordId) {
  const entry = pendingPaymentConfirms.get(discordId);
  if (!entry) return null;
  if (entry.timer) clearTimeout(entry.timer);
  pendingPaymentConfirms.delete(discordId);
  return entry;
}

/**
 * Sendet das "Zahlung erkannt"-Embed sofort, weil der Server die Einladung
 * bestätigt hat. Bricht den Fallback-Timer ab, behaelt den Eintrag aber
 * für spätere Uebergaenge (Fehler/Join löschen dann genau diese Nachricht).
 * @returns {Promise<boolean>} true wenn gesendet
 */
export async function announcePaymentConfirmed(discordId) {
  const entry = pendingPaymentConfirms.get(discordId);
  if (!entry || entry.announced) return false;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.announced = true;
  try {
    const discordUser = await entry.client.users.fetch(discordId);
    if (!discordUser) return false;
    const dm = await discordUser.createDM();
    const sent = await dm.send({ embeds: [await buildPaymentConfirmedEmbed(entry.payment)] });
    entry.channelId = dm.id;
    entry.messageId = sent.id;
    return true;
  } catch (err) {
    logger.warn(`[Payment] Konnte Bestätigungs-DM nicht senden: ${err.message}`);
    return false;
  }
}

/**
 * Löscht die angezeigte "Zahlung erkannt"-Nachricht, falls bekannt.
 * Damit steht zu jedem Zeitpunkt nur EINE davon in den DMs.
 */
export async function deleteAnnouncedPaymentMessage(client, entry) {
  if (!entry?.channelId || !entry?.messageId || !client) return;
  try {
    const channel = await client.channels.fetch(entry.channelId);
    if (!channel?.messages) return;
    const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (msg?.deletable) {
      await msg.delete();
    }
  } catch {
    // Bereits weg oder keine Rechte – egal.
  }
}

export async function confirmPaymentAndInviteTeam(client, user, payment) {
  const amount = payment.amount;

  // Team-Invite im Spiel ausloesen (mit discordId, damit Server-Fehler
  // wie "already in a team" dem richtigen User zugeordnet werden).
  // Die Erfolgs-DM folgt erst nach 10s – ausser der Server meldet vorher
  // einen Fehler oder der Join klappt, dann kommt EINE finale Nachricht.
  registerPendingPaymentConfirm(client, user, payment);
  eventBus.emit('minecraft:teamInvite', { ign: user.ign, discordId: user.discord_id });

  await sendLogEmbed(client, {
    category: LogCategory.PAYMENT,
    title: 'Zahlung bestätigt',
      description: `<@${user.discord_id}> (${user.ign}) hat **$${amount.toLocaleString('de-DE')}** gezahlt. Team-Invite gesendet.`,
    color: 'success',
  });

  eventBus.emitToDashboard('paymentUpdate', db.listPayments());
}

/**
 * Sendet ein Fehler-Embed bei fehlgeschlagener Zahlung.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {string} reason
 */
export async function sendPaymentFailedEmbed(client, discordId, reason, extra = {}) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

  let title = 'Zahlung fehlgeschlagen';
  let description = '';

  switch (reason) {
    case 'WRONG_AMOUNT': {
      const required = (extra.requiredAmount || configService.get('payment', {}).amount || 250000).toLocaleString('de-DE');
      const got = (extra.amount || 0).toLocaleString('de-DE');
      description = `Du hast **$${got}** überwiesen, aber erforderlich sind **$${required}**.\n\nÜberweise den richtigen Betrag, um fortzufahren.`;
      break;
    }
    case 'WRONG_RECIPIENT':
      description = `Die Zahlung ging an **${extra.recipient || 'einen falschen Empfänger'}**. Bitte überweise an **${extra.requiredRecipient}**.`;
      break;
    default:
      description = 'Zahlung konnte nicht zugeordnet werden.';
  }

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_payment_retry')
      .setLabel('Nochmal')
      .setStyle(ButtonStyle.Primary),
  );

  try {
    const user = await client.users.fetch(discordId);
    if (!user) return;
    const dm = await user.createDM();
    await dm.send({ embeds: [embed], components: [row] });
  } catch (err) {
    logger.warn(`[Payment] Konnte Fehler-Embed nicht senden: ${err.message}`);
  }
}

/**
 * Sendet Timeout-Embed wenn Zahlung nicht erfolgt ist.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 */
export async function sendPaymentTimeoutEmbed(client, discordId) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

  const timeoutMin = Math.round((configService.get('timeouts', {}).paymentTimeoutMs || 10 * 60 * 1000) / 60000);
  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('Zahlung nicht erkannt')
    .setDescription(
      `Die Zahlung wurde nicht innerhalb von ${timeoutMin} Minuten erkannt.\n\n` +
      'Klicke auf „Zahlung starten“, um einen neuen Zahlungsversuch zu beginnen.',
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_payment_start')
      .setLabel('Zahlung starten')
      .setStyle(ButtonStyle.Success),
  );

  try {
    const user = await client.users.fetch(discordId);
    if (!user) return;
    const dm = await user.createDM();
    await dm.send({ embeds: [embed], components: [row] });
  } catch (err) {
    logger.warn(`[Payment] Konnte Timeout-Embed nicht senden: ${err.message}`);
  }
}

/**
 * Prüft und setzt abgelaufene Payments auf Timeout.
 * @param {import('discord.js').Client} client
 */
export async function checkPaymentTimeouts(client) {
  const expired = db.timeoutExpiredPayments();
  for (const payment of expired) {
    // Spieler-Status zuruecksetzen – aber nur wenn er noch auf DIESE Zahlung
    // wartet. Sonst wuerde ein entlinkter User faelschlich auf VERIFIED oder
    // sogar ein Team-Mitglied zurückgesetzt.
    const linkedUser = db.findUserByDiscord(payment.discord_id);
    if (linkedUser && linkedUser.status === PlayerStatus.WAITING_PAYMENT) {
      db.upsertUser({
        discord_id: payment.discord_id,
        status: linkedUser.ign ? PlayerStatus.VERIFIED : PlayerStatus.UNVERIFIED,
      });
    }

    await sendPaymentTimeoutEmbed(client, payment.discord_id);

    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Zahlung abgelaufen',
      description: `Zahlung von **${payment.ign}** ($${payment.amount.toLocaleString('de-DE')}) ist abgelaufen.`,
      color: 'warning',
    });

    logger.info(`[Payment] Timeout für ${payment.ign}: Zahlung abgelaufen.`);
  }

  if (expired.length > 0) {
    eventBus.emitToDashboard('paymentUpdate', db.listPayments());
  }
}

// ---------------------------------------------------------------------------
// Automatischer Refund nach fehlgeschlagener Team-Einladung
// ---------------------------------------------------------------------------
// Sicherheitsmodell (kein Exploit möglich):
// - Es gibt KEINEN User-Command für Refunds. Nur dieser interne Timer.
// - Empfänger und Betrag kommen AUSSCHLIESSLICH aus der bestätigten
//   DB-Zeile (payment.ign, payment.amount), nie aus Chat oder User-Input.
// - Der IGN wird erneut per sanitizeIgn geprueft, der Betrag muss eine
//   positive ganze Zahl sein.
// - claimPaymentForRefund() markiert die Zeile atomar (nur wenn noch
//   'confirmed'). Nur wer den Claim gewinnt, darf zahlen -> kein Doppel-Refund.
// - Vor dem Senden wird geprueft: User ist NICHT im Team, Bot ist online.
// - Schlaegt das Senden fehl, wird der Claim zurückgegeben (kein Geld
//   verloren, kein Status verbrannt) und später erneut versucht.

const pendingRefunds = new Map();

/** Nach Invite-Fehler: 10 Minuten auf Retry/Join warten, dann refunden. */
const REFUND_GRACE_MS = 10 * 60 * 1000;
/** Bot offline: nach 5 Minuten erneut versuchen, max. 3 Versuche. */
const REFUND_RETRY_MS = 5 * 60 * 1000;
const REFUND_MAX_ATTEMPTS = 3;

/**
 * Plant einen Refund, falls der User nach einem Invite-Fehler nichts mehr tut.
 * Jeder neue Fehler startet die 10 Minuten neu, Retry/Join stornieren.
 */
export function scheduleRefundAfterInviteError(client, discordId, payment) {
  cancelRefund(discordId);
  pendingRefunds.set(discordId, {
    paymentId: payment.id,
    attempts: 0,
    timer: setTimeout(() => executeRefund(client, discordId, payment.id, 0), REFUND_GRACE_MS),
  });
  logger.info(`[Payment] Refund-Timer gestartet für Payment #${payment.id} (${payment.ign}, $${payment.amount}) – 10 Minuten.`);
}

/** Storniert einen geplanten Refund (Retry, Team-Join, Neuzahlung). */
export function cancelRefund(discordId) {
  const entry = pendingRefunds.get(discordId);
  if (entry?.timer) clearTimeout(entry.timer);
  pendingRefunds.delete(discordId);
}

/**
 * Führt den Refund aus: /pay <verifizierter IGN> <bestätigter Betrag>.
 * Alle Guards werden zum Ausfuehrzeitpunkt erneut aus der DB geprueft.
 */
async function executeRefund(client, discordId, paymentId, attempts) {
  pendingRefunds.delete(discordId);

  const payment = db.findPaymentById(paymentId);
  if (!payment) {
    logger.warn(`[Refund] Payment #${paymentId} nicht gefunden – kein Refund.`);
    return;
  }
  // Nur bestätigte (also wirklich erhaltene) Zahlungen dürfen refunden.
  if (payment.status === PaymentStatus.REFUNDED || payment.status === PaymentStatus.REFUNDING) {
    logger.info(`[Refund] Payment #${paymentId} bereits ${payment.status} – kein Doppel-Refund.`);
    return;
  }
  if (payment.status !== PaymentStatus.CONFIRMED) {
    logger.info(`[Refund] Payment #${paymentId} hat Status ${payment.status} – kein Refund.`);
    return;
  }
  if (payment.discord_id !== discordId) {
    logger.error(`[Refund] Discord-ID passt nicht zu Payment #${paymentId} – ABBRUCH (Sicherheit).`);
    return;
  }

  // Altersgrenze: Nur Zahlungen der letzten 24h automatisch refunden.
  // Aeltere (z.B. Team wieder verlassen) sind Faelle für Admin-Review.
  const confirmedAt = payment.confirmed_at ? new Date(payment.confirmed_at).getTime() : 0;
  if (!confirmedAt || Date.now() - confirmedAt > 24 * 60 * 60 * 1000) {
    logger.warn(`[Refund] Payment #${paymentId} ist aelter als 24h – kein Auto-Refund, Admin prüfen.`);
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Refund manuell prüfen',
      description: `Payment #${paymentId} (**${payment.ign}**, $${Number(payment.amount).toLocaleString('de-DE')}) ist bestätigt aber aelter als 24h. Bitte manuell prüfen statt automatisch zu zahlen.`,
      color: 'warning',
    });
    return;
  }

  // User im Team? Dann braucht es keinen Refund (manuell geloest).
  const user = db.findUserByDiscord(discordId);
  if (user && user.status === PlayerStatus.TEAM) {
    logger.info(`[Refund] User ${payment.ign} ist im Team – kein Refund noetig.`);
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Refund uebersprungen',
      description: `**${payment.ign}** ist im Team – Payment #${payment.id} bleibt bestätigt (manuell prüfen).`,
      color: 'warning',
    });
    return;
  }

  // Empfänger strikt aus der DB-Zeile, erneut validiert. NIEMALS aus Chat/Input.
  const cleanIgn = sanitizeIgn(payment.ign);
  const amount = Number(payment.amount);
  if (!cleanIgn || !Number.isInteger(amount) || amount <= 0) {
    logger.error(`[Refund] Ungültige Refund-Daten bei Payment #${paymentId} – ABBRUCH, Admin prüfen.`);
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Refund blockiert',
      description: `Payment #${paymentId} hat ungültige Daten (IGN/Betrag). Manuell prüfen – NICHT automatisch gezahlt.`,
      color: 'error',
    });
    return;
  }

  // Atomar beanspruchen: Nur bei Erfolg darf gezahlt werden.
  if (!db.claimPaymentForRefund(paymentId)) {
    logger.info(`[Refund] Payment #${paymentId} konnte nicht beansprucht werden – bereits verarbeitet.`);
    return;
  }

  // Bot-Verbindung prüfen (dynamischer Import: kein Modul-Zyklus).
  // sendCommand reiht nur ein – ob es wirklich rausging, prüft die
  // Versandkontrolle unten (Kick beim Senden ist jederzeit möglich).
  let sent = false;
  let sendTime = 0;
  try {
    const { bridgeInstance } = await import('../minecraft/bridge.js');
    if (bridgeInstance?.isConnected) {
      sendTime = Date.now();
      sent = bridgeInstance.sendCommand(`/pay ${cleanIgn} ${amount}`);
    }
  } catch (err) {
    logger.error(`[Refund] Bridge-Fehler: ${err.message}`);
  }

  if (!sent) {
    // NICHT als refunden markieren: Claim zurückgeben und später erneut versuchen.
    db.releaseRefundClaim(paymentId);
    const nextAttempts = attempts + 1;
    if (nextAttempts < REFUND_MAX_ATTEMPTS) {
      logger.warn(`[Refund] Bot offline – Payment #${paymentId} erneut in 5 Minuten (Versuch ${nextAttempts + 1}/${REFUND_MAX_ATTEMPTS}).`);
      pendingRefunds.set(discordId, {
        paymentId,
        attempts: nextAttempts,
        timer: setTimeout(() => executeRefund(client, discordId, paymentId, nextAttempts), REFUND_RETRY_MS),
      });
    } else {
      logger.error(`[Refund] Bot dauerhaft offline – Payment #${paymentId} manuell refunden!`);
      await sendLogEmbed(client, {
        category: LogCategory.PAYMENT,
        title: 'Refund fehlgeschlagen',
        description: `Bot offline – **$${amount.toLocaleString('de-DE')}** an **${cleanIgn}** (Payment #${paymentId}) bitte MANUELL per \`/pay ${cleanIgn} ${amount}\` zurückzahlen.`,
        color: 'error',
      });
    }
    return;
  }

  // Versandkontrolle: Falls der Bot kurz nach dem Einreihen gekickt wurde,
  // ist unklar ob /pay rauskam. Dann NICHT als refunden markieren, sondern
  // Admin-Review (kein Doppel-Pay riskieren, kein Geld unterschlagen).
  await new Promise((resolve) => setTimeout(resolve, 30000));
  try {
    const { bridgeInstance } = await import('../minecraft/bridge.js');
    if (!bridgeInstance?.isConnected || (bridgeInstance.lastDisconnectAt || 0) >= sendTime) {
      logger.error(`[Refund] Kick nach Refund-Versand (Payment #${paymentId}) – manuell prüfen, NICHT erneut senden.`);
      await sendLogEmbed(client, {
        category: LogCategory.PAYMENT,
        title: 'Refund unklar – manuell prüfen',
        description: `Bot wurde nach \`/pay ${cleanIgn} ${amount}\` (Payment #${paymentId}) getrennt. Unklar ob es ankam – bitte Kontostand prüfen und ggf. MANUELL nachzahlen. KEIN Auto-Retry (Doppel-Pay vermeiden).`,
        color: 'error',
      });
      return;
    }
  } catch (err) {
    logger.error(`[Refund] Versandkontrolle fehlgeschlagen (Payment #${paymentId}): ${err.message}`);
    return;
  }

  // Erneut validieren: Falls der User waehrenddessen per Retry doch noch
  // ins Team kam, NICHTS automatisch abschliessen (kein Demote, keine
  // falsche DM) – Admin klaert, ob Geld rausging.
  const freshPayment = db.findPaymentById(paymentId);
  const freshUser = db.findUserByDiscord(discordId);
  if (!freshPayment || freshPayment.status !== PaymentStatus.REFUNDING) {
    logger.info(`[Refund] Payment #${paymentId} nicht mehr refunding – Abbruch.`);
    return;
  }
  if (freshUser && freshUser.status === PlayerStatus.TEAM) {
    logger.error(`[Refund] User ${cleanIgn} ist waehrend Refund ins Team gekommen (Payment #${paymentId}) – manuell prüfen.`);
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Refund + Join gleichzeitig – manuell prüfen',
      description: `**${cleanIgn}** ist waehrend des Refunds (Payment #${paymentId}, $${amount.toLocaleString('de-DE')}) ins Team gekommen. Bitte prüfen ob Geld rausging – ggf. zurückfordern oder behalten lassen. Status bleibt zur Klaerung auf 'refunding'.`,
      color: 'error',
    });
    return;
  }

  db.completeRefund(paymentId);
  if (db.findUserByDiscord(discordId)) {
    db.upsertUser({ discord_id: discordId, status: PlayerStatus.VERIFIED });
  }

  logger.info(`[Refund] $${amount} an ${cleanIgn} zurückgezahlt (Payment #${paymentId}).`);

  try {
    const { EmbedBuilder } = await import('discord.js');
    const discordUser = await client.users.fetch(discordId);
    if (discordUser) {
      const dm = await discordUser.createDM();
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Vorgang abgebrochen – Geld zurückgezahlt')
        .setDescription(
          `Die Team-Einladung hat nicht geklappt und du hast nichts weiter unternommen.\n\n` +
          `**$${amount.toLocaleString('de-DE')}** wurden an **${cleanIgn}** zurückgezahlt.\n\n` +
          `Du kannst jederzeit über den Button im Server neu starten.`,
        )
        .setTimestamp();
      await dm.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.warn(`[Refund] Konnte Refund-DM nicht senden: ${err.message}`);
  }

  await sendLogEmbed(client, {
    category: LogCategory.PAYMENT,
    title: 'Zahlung zurückgezahlt',
    description: `**$${amount.toLocaleString('de-DE')}** an **${cleanIgn}** zurückgezahlt (Payment #${paymentId}, <@${discordId}>). Befehl: \`/pay ${cleanIgn} ${amount}\``,
    color: 'warning',
  });

  eventBus.emitToDashboard('paymentUpdate', db.listPayments());
}

/**
 * Selbstheilung nach Neustart: lange tote CONFIRMED-Payments (User nicht im
 * Team) bekommen einen Refund-Timer, da In-Memory-Timer Neustarts verlieren.
 * Nur Zahlungen der letzten 24h – aeltere sind Admin-Faelle.
 */
export async function reconcileStaleRefunds(client) {
  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const newest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stale = db.findStaleConfirmedPayments(cutoff, newest);
  for (const payment of stale) {
    const user = db.findUserByDiscord(payment.discord_id);
    if (user && user.status === PlayerStatus.TEAM) continue;
    if (pendingRefunds.has(payment.discord_id)) continue;
    logger.warn(`[Refund] Altes totes Payment #${payment.id} (${payment.ign}) gefunden – Refund-Timer gestartet.`);
    pendingRefunds.set(payment.discord_id, {
      paymentId: payment.id,
      attempts: 0,
      timer: setTimeout(() => executeRefund(client, payment.discord_id, payment.id, 0), 2 * 60 * 1000),
    });
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Altes Payment gefunden',
      description: `Payment #${payment.id} (**${payment.ign}**, $${payment.amount.toLocaleString('de-DE')}) war bestätigt aber nie abgeschlossen. Refund startet in 2 Minuten, falls kein Join erfolgt.`,
      color: 'warning',
    });
  }
}

export default {
  sendPaymentEmbed,
  handlePaymentButton,
  buildPaymentInstructionEmbed,
  buildPaymentConfirmedEmbed,
  validatePayment,
  confirmPaymentAndInviteTeam,
  registerPendingPaymentConfirm,
  consumePendingPaymentConfirm,
  announcePaymentConfirmed,
  deleteAnnouncedPaymentMessage,
  sendPaymentFailedEmbed,
  sendPaymentTimeoutEmbed,
  checkPaymentTimeouts,
  scheduleRefundAfterInviteError,
  cancelRefund,
  reconcileStaleRefunds,
};
