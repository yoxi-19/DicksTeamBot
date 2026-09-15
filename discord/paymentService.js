// Variable: Payment-Service.
// Verwaltet den Zahlungsprozess nach der Verifizierung.

import * as db from '../database/index.js';
import configService from '../server/config.js';
import logger from '../shared/logger.js';
import { PlayerStatus, PaymentStatus, LogCategory, sanitizeIgn } from '../shared/types.js';
import eventBus from '../shared/events.js';
import { syncNickname, grantRole, removeRole, sendLogEmbed, sendDm } from './helpers.js';

/**
 * Erstellt einen aktiven Payment-Eintrag falls keiner existiert und setzt
 * den User auf WAITING_PAYMENT. Idempotent – rueckgabewert ist immer gueltig.
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
  logger.info(`[Payment] Zahlung erwartet fuer ${finalIgn} (${discordId}): $${amount} an ${recipient}`);
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
      `Um dem Team beizutreten, ueberweise jetzt im Minecraft-Server:\n\n` +
      `**Betrag:** $${amount.toLocaleString('de-DE')}\n` +
      `**Empfaenger:** \`${recipient}\`\n\n` +
      `Die Zahlung wird ab jetzt automatisch ueberwacht. Klicke auf **Zahlung starten**, um die genaue Anweisung zu sehen.`,
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
 * Startet die Zahlungsüberwachung. Die Anweisung wird vom Button-Handler in
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
    // Neustart nach Invite-Fehler: Ein alter Refund-Timer fuer eine fruehere
    // bestaetigte Zahlung wird verworfen (manuell im Log pruefen).
    if (pendingRefunds.has(discordId)) {
      cancelRefund(discordId);
      logger.warn(`[Payment] Alter Refund-Timer fuer ${discordId} durch Neuzahlung verworfen (Payment #${payment.id} neu). Altes Payment manuell pruefen.`);
      await sendLogEmbed(client, {
        category: LogCategory.PAYMENT,
        title: 'Refund verworfen',
        description: `<@${discordId}> hat neu gezahlt – ein alter Refund-Timer wurde gestoppt. Alte bestaetigte Payments bitte manuell pruefen.`,
        color: 'warning',
      });
    }
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Zahlung erwartet',
      description: `<@${discordId}> (${payment.ign}) soll $${payment.amount.toLocaleString('de-DE')} an **${payment.recipient}** ueberweisen.`,
      color: 'info',
    });
  }

  return { ok: true, payment, alreadyWaiting };
}

/** Baut die endgültige Anweisung nach dem Start der Zahlungsüberwachung. */
export async function buildPaymentInstructionEmbed(payment) {
  const { EmbedBuilder } = await import('discord.js');
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Zahlung wird ueberwacht')
    .setDescription(
      `Ueberweise jetzt genau:\n\n\`\`\`\n/pay ${payment.recipient} ${payment.amount}\n\`\`\`\n\n` +
      'Der Bot erkennt die Zahlung automatisch. Sobald sie bestaetigt ist, erhaeltst du direkt eine Team-Einladung im Spiel.',
    )
    .setFooter({ text: `Payment-ID: ${payment.id} · Läuft bis ${new Date(payment.timeout_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` })
    .setTimestamp();
}

/**
 * Validiert eine erkannte Zahlung aus dem Minecraft-Chat.
 * Prueft: Sender = verifizierter IGN, Empfaenger = TeamBank, Betrag >= erforderlich.
 * @param {import('discord.js').Client} client
 * @param {string} senderIgn
 * @param {number} amount
 * @param {string} recipient
 * @param {string} chatMessage
 * @returns {Promise<{ ok: boolean, payment?: object, error?: string }>}
 */
export async function validatePayment(client, senderIgn, amount, recipient, chatMessage) {
  // Spieler finden
  const user = db.findUserByIgn(senderIgn);
  if (!user || !user.discord_id) {
    logger.info(`[Payment] Kein verifizierter Spieler fuer IGN: ${senderIgn}`);
    return { ok: false, error: 'UNKNOWN_PLAYER' };
  }

  // Status pruefen
  if (user.status !== PlayerStatus.WAITING_PAYMENT) {
    logger.info(`[Payment] Spieler ${senderIgn} hat Status ${user.status}, erwartet: waiting_payment`);
    return { ok: false, error: 'NOT_WAITING' };
  }

  // Aktives Payment finden
  const payment = db.findActivePayment(user.discord_id);
  if (!payment) {
    logger.info(`[Payment] Kein aktives Payment fuer ${senderIgn}`);
    return { ok: false, error: 'NO_ACTIVE_PAYMENT' };
  }

  if (user.ign.toLowerCase() !== payment.ign.toLowerCase()) {
    return { ok: false, error: 'WRONG_IGN' };
  }

  if (recipient && recipient.toLowerCase() !== payment.recipient.toLowerCase()) {
    logger.info(`[Payment] Falscher Empfaenger: ${recipient} (erwartet: ${payment.recipient})`);
    return { ok: false, error: 'WRONG_RECIPIENT', recipient, requiredRecipient: payment.recipient };
  }

  // Genau der für diesen Vorgang gespeicherte Betrag ist maßgeblich.
  if (amount !== payment.amount) {
    logger.info(`[Payment] Falscher Betrag: $${amount} (erforderlich: $${payment.amount})`);
    return { ok: false, error: 'WRONG_AMOUNT', amount, requiredAmount: payment.amount };
  }

  // Payment als bestaetigt markieren
  const confirmed = db.updatePaymentStatus(payment.id, PaymentStatus.CONFIRMED, {
    confirmedAt: new Date().toISOString(),
    chatMessage,
  });

  // Status des Spielers aktualisieren
  db.upsertUser({
    discord_id: user.discord_id,
    status: PlayerStatus.VERIFIED, // Zurueck auf verified, Team-Invite folgt
    team: null,
  });

  logger.info(`[Payment] Zahlung bestaetigt: ${senderIgn} hat $${amount} an ${recipient} ueberwiesen.`);

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

export function registerPendingPaymentConfirm(client, user, payment, { alreadyAnnounced = false } = {}) {
  const old = pendingPaymentConfirms.get(user.discord_id);
  if (old?.timer) clearTimeout(old.timer);
  // Kurze Wartezeit (4s): Der Server antwortet auf das Invite normalerweise
  // in 1-2s. Kommt in der Zeit ein Fehler, wird die Erfolgsmeldung
  // unterdrueckt und es kommt nur die EINE finale Fehlernachricht.
  const timer = setTimeout(async () => {
    pendingPaymentConfirms.delete(user.discord_id);
    // Wurde der Normalzustand schon angezeigt (z.B. nach Nochmal-Klick),
    // dann nichts doppelt senden – nur auf Server-Antwort warten.
    if (alreadyAnnounced) return;
    try {
      const discordUser = await client.users.fetch(user.discord_id);
      if (!discordUser) return;
      const dm = await discordUser.createDM();
      await dm.send({ embeds: [await buildPaymentConfirmedEmbed(payment)] });
    } catch (err) {
      logger.warn(`[Payment] Konnte verzoegerte Erfolgs-DM nicht senden: ${err.message}`);
    }
  }, 4000);
  pendingPaymentConfirms.set(user.discord_id, { payment, user, timer, client });
}

/** Holt und loescht eine ausstehende Payment-Bestaetigung (fuer Invite-Fehler/Join). */
export function consumePendingPaymentConfirm(discordId) {
  const entry = pendingPaymentConfirms.get(discordId);
  if (!entry) return null;
  if (entry.timer) clearTimeout(entry.timer);
  pendingPaymentConfirms.delete(discordId);
  return entry;
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
    title: 'Zahlung bestaetigt',
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
      description = `Du hast **$${got}** ueberwiesen, aber erforderlich sind **$${required}**.\n\nUeberweise den richtigen Betrag, um fortzufahren.`;
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
 * Prueft und setzt abgelaufene Payments auf Timeout.
 * @param {import('discord.js').Client} client
 */
export async function checkPaymentTimeouts(client) {
  const expired = db.timeoutExpiredPayments();
  for (const payment of expired) {
    // Spieler-Status zuruecksetzen – aber nur wenn er noch auf DIESE Zahlung
    // wartet. Sonst wuerde ein entlinkter User faelschlich auf VERIFIED oder
    // sogar ein Team-Mitglied zurueckgesetzt.
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

    logger.info(`[Payment] Timeout fuer ${payment.ign}: Zahlung abgelaufen.`);
  }

  if (expired.length > 0) {
    eventBus.emitToDashboard('paymentUpdate', db.listPayments());
  }
}

// ---------------------------------------------------------------------------
// Automatischer Refund nach fehlgeschlagener Team-Einladung
// ---------------------------------------------------------------------------
// Sicherheitsmodell (kein Exploit moeglich):
// - Es gibt KEINEN User-Command fuer Refunds. Nur dieser interne Timer.
// - Empfaenger und Betrag kommen AUSSCHLIESSLICH aus der bestaetigten
//   DB-Zeile (payment.ign, payment.amount), nie aus Chat oder User-Input.
// - Der IGN wird erneut per sanitizeIgn geprueft, der Betrag muss eine
//   positive ganze Zahl sein.
// - claimPaymentForRefund() markiert die Zeile atomar (nur wenn noch
//   'confirmed'). Nur wer den Claim gewinnt, darf zahlen -> kein Doppel-Refund.
// - Vor dem Senden wird geprueft: User ist NICHT im Team, Bot ist online.
// - Schlaegt das Senden fehl, wird der Claim zurueckgegeben (kein Geld
//   verloren, kein Status verbrannt) und spaeter erneut versucht.

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
  logger.info(`[Payment] Refund-Timer gestartet fuer Payment #${payment.id} (${payment.ign}, $${payment.amount}) – 10 Minuten.`);
}

/** Storniert einen geplanten Refund (Retry, Team-Join, Neuzahlung). */
export function cancelRefund(discordId) {
  const entry = pendingRefunds.get(discordId);
  if (entry?.timer) clearTimeout(entry.timer);
  pendingRefunds.delete(discordId);
}

/**
 * Fuehrt den Refund aus: /pay <verifizierter IGN> <bestaetigter Betrag>.
 * Alle Guards werden zum Ausfuehrzeitpunkt erneut aus der DB geprueft.
 */
async function executeRefund(client, discordId, paymentId, attempts) {
  pendingRefunds.delete(discordId);

  const payment = db.findPaymentById(paymentId);
  if (!payment) {
    logger.warn(`[Refund] Payment #${paymentId} nicht gefunden – kein Refund.`);
    return;
  }
  // Nur bestaetigte (also wirklich erhaltene) Zahlungen duerfen refunden.
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
  // Aeltere (z.B. Team wieder verlassen) sind Faelle fuer Admin-Review.
  const confirmedAt = payment.confirmed_at ? new Date(payment.confirmed_at).getTime() : 0;
  if (!confirmedAt || Date.now() - confirmedAt > 24 * 60 * 60 * 1000) {
    logger.warn(`[Refund] Payment #${paymentId} ist aelter als 24h – kein Auto-Refund, Admin pruefen.`);
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Refund manuell pruefen',
      description: `Payment #${paymentId} (**${payment.ign}**, $${Number(payment.amount).toLocaleString('de-DE')}) ist bestaetigt aber aelter als 24h. Bitte manuell pruefen statt automatisch zu zahlen.`,
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
      description: `**${payment.ign}** ist im Team – Payment #${payment.id} bleibt bestaetigt (manuell pruefen).`,
      color: 'warning',
    });
    return;
  }

  // Empfaenger strikt aus der DB-Zeile, erneut validiert. NIEMALS aus Chat/Input.
  const cleanIgn = sanitizeIgn(payment.ign);
  const amount = Number(payment.amount);
  if (!cleanIgn || !Number.isInteger(amount) || amount <= 0) {
    logger.error(`[Refund] Ungueltige Refund-Daten bei Payment #${paymentId} – ABBRUCH, Admin pruefen.`);
    await sendLogEmbed(client, {
      category: LogCategory.PAYMENT,
      title: 'Refund blockiert',
      description: `Payment #${paymentId} hat ungueltige Daten (IGN/Betrag). Manuell pruefen – NICHT automatisch gezahlt.`,
      color: 'error',
    });
    return;
  }

  // Atomar beanspruchen: Nur bei Erfolg darf gezahlt werden.
  if (!db.claimPaymentForRefund(paymentId)) {
    logger.info(`[Refund] Payment #${paymentId} konnte nicht beansprucht werden – bereits verarbeitet.`);
    return;
  }

  // Bot-Verbindung pruefen (dynamischer Import: kein Modul-Zyklus).
  let sent = false;
  try {
    const { bridgeInstance } = await import('../minecraft/bridge.js');
    if (bridgeInstance?.isConnected) {
      sent = bridgeInstance.sendCommand(`/pay ${cleanIgn} ${amount}`);
    }
  } catch (err) {
    logger.error(`[Refund] Bridge-Fehler: ${err.message}`);
  }

  if (!sent) {
    // NICHT als refunden markieren: Claim zurueckgeben und spaeter erneut versuchen.
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
        description: `Bot offline – **$${amount.toLocaleString('de-DE')}** an **${cleanIgn}** (Payment #${paymentId}) bitte MANUELL per \`/pay ${cleanIgn} ${amount}\` zurueckzahlen.`,
        color: 'error',
      });
    }
    return;
  }

  db.completeRefund(paymentId);
  if (db.findUserByDiscord(discordId)) {
    db.upsertUser({ discord_id: discordId, status: PlayerStatus.VERIFIED });
  }

  logger.info(`[Refund] $${amount} an ${cleanIgn} zurueckgezahlt (Payment #${paymentId}).`);

  try {
    const { EmbedBuilder } = await import('discord.js');
    const discordUser = await client.users.fetch(discordId);
    if (discordUser) {
      const dm = await discordUser.createDM();
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Vorgang abgebrochen – Geld zurueckgezahlt')
        .setDescription(
          `Die Team-Einladung hat nicht geklappt und du hast nichts weiter unternommen.\n\n` +
          `**$${amount.toLocaleString('de-DE')}** wurden an **${cleanIgn}** zurueckgezahlt.\n\n` +
          `Du kannst jederzeit ueber den Button im Server neu starten.`,
        )
        .setTimestamp();
      await dm.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.warn(`[Refund] Konnte Refund-DM nicht senden: ${err.message}`);
  }

  await sendLogEmbed(client, {
    category: LogCategory.PAYMENT,
    title: 'Zahlung zurueckgezahlt',
    description: `**$${amount.toLocaleString('de-DE')}** an **${cleanIgn}** zurueckgezahlt (Payment #${paymentId}, <@${discordId}>). Befehl: \`/pay ${cleanIgn} ${amount}\``,
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
      description: `Payment #${payment.id} (**${payment.ign}**, $${payment.amount.toLocaleString('de-DE')}) war bestaetigt aber nie abgeschlossen. Refund startet in 2 Minuten, falls kein Join erfolgt.`,
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
  sendPaymentFailedEmbed,
  sendPaymentTimeoutEmbed,
  checkPaymentTimeouts,
  scheduleRefundAfterInviteError,
  cancelRefund,
  reconcileStaleRefunds,
};
