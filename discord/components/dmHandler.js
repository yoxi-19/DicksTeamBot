// Variable: DM-Interaktions-Handler.
// Verarbeitet DM-Nachrichten für die Verifizierung (IGN-Eingabe).
// Der DM-Handler ist NUR für einen Zweck zustaendig: den IGN entgegennehmen und einen Code generieren.
// Alle anderen Schritte (Payment, Team) werden über Buttons im Server gesteuert.

import { startVerification } from '../verifyService.js';
import { buildEmbed, errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';
import * as db from '../../database/index.js';
import { PlayerStatus } from '../../shared/types.js';
import logger from '../../shared/logger.js';

// Pending DM-Interaktionen: userId -> { action, guild, createdAt }
const pendingDms = new Map();

const TIMEOUT_MS = 5 * 60 * 1000; // 5 Minuten

/**
 * Registriert eine DM-Aktion für einen Nutzer.
 * @param {string} userId
 * @param {string} action - 'verify'
 * @param {import('discord.js').Guild} guild
 */
export function registerPendingDm(userId, action, guild) {
  pendingDms.set(userId, { action, guild, createdAt: Date.now() });
}

/**
 * Behandelt eingehende DM-Nachrichten.
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').Client} client
 */
export async function handleDmMessage(message, client) {
  if (message.author.bot) return;
  if (message.guild) return;

  const userId = message.author.id;
  const pending = pendingDms.get(userId);

  if (!pending) return;

  if (Date.now() - pending.createdAt > TIMEOUT_MS) {
    pendingDms.delete(userId);
    await message.reply({
      embeds: [errorEmbed('Abgelaufen', 'Die Aktion ist abgelaufen. Bitte klicke erneut auf den Button im Server.')],
    });
    return;
  }

  const ign = message.content.trim();
  pendingDms.delete(userId);

  if (pending.action === 'verify') {
    await handleVerifyDmReply(message, client, pending.guild, userId, ign);
  }
}

/**
 * Verarbeitet die IGN-Antwort für die Verifizierung.
 * Prüft den aktuellen Status und leitet zum nächsten Schritt.
 * Korrupte DB-Zustaende (VERIFIED ohne ign) werden automatisch bereinigt.
 *
 * UNVERIFIED / new / korrupt -> Code generieren
 * VERIFIED (mit ign)         -> Hinweis: Button im Server nutzen
 * WAITING_PAYMENT (mit ign)  -> Hinweis: Button im Server nutzen
 * TEAM (mit ign)             -> Hinweis: Bereits im Team
 * LEFT                       -> Hinweis: Admin kontaktieren
 */
async function handleVerifyDmReply(message, client, guild, userId, ign) {
  const existingUser = db.findUserByDiscord(userId);

  // Bereits im Team (nur wenn IGN gesetzt)
  if (existingUser && existingUser.status === PlayerStatus.TEAM && existingUser.ign) {
    await message.reply({
      embeds: [successEmbed('Bereits im Team', 'Du bist bereits im Team!')],
    });
    return;
  }

  // Team verlassen
  if (existingUser && existingUser.status === PlayerStatus.LEFT) {
    await message.reply({
      embeds: [errorEmbed('Team verlassen', 'Du hast das Team bereits verlassen. Bitte wende dich an einen Admin.')],
    });
    return;
  }

  // Bereits verifiziert (nur wenn IGN gesetzt) -> Button im Server nutzen
  if (existingUser && existingUser.status === PlayerStatus.VERIFIED && existingUser.ign) {
    await message.reply({
      embeds: [successEmbed('Bereits verifiziert', 'Du bist bereits verifiziert! Klicke auf "Beitreten" im Server, um fortzufahren.')],
    });
    return;
  }

  // Zahlung ausstehend (nur wenn IGN gesetzt) -> Button im Server nutzen
  if (existingUser && existingUser.status === PlayerStatus.WAITING_PAYMENT && existingUser.ign) {
    await message.reply({
      embeds: [successEmbed('Zahlung ausstehend', 'Du hast bereits eine offene Zahlung. Klicke auf "Beitreten" im Server, um fortzufahren.')],
    });
    return;
  }

  // Korrupter Zustand (VERIFIED/WAITING_PAYMENT aber kein IGN) -> Zurücksetzen und neu starten
  if (existingUser && !existingUser.ign) {
    db.unlinkUser(userId);
    logger.info(`[DM] Korrupter DB-Eintrag für ${userId} bereinigt (status=${existingUser.status}, ign=null).`);
  }

  // NICHT verifiziert -> Code generieren
  const result = await startVerification(client, guild, userId, ign);

  if (!result.ok) {
    await message.reply({
      embeds: [errorEmbed('Verifizierung fehlgeschlagen', result.error)],
    });
    return;
  }

  const botName = configService.env.minecraftUsername || 'DicksBot';
  const embed = buildEmbed({
    title: 'Dein Verifizierungs-Code',
    description:
      `Öffne Minecraft, verbinde dich mit dem Server und führe diesen Befehl aus:\n\n` +
      '```\n' +
      `/msg ${botName} ${result.code}\n` +
      '```\n' +
      `Gültig für 5 Minuten.`,
    color: 'primary',
  });

  await message.reply({ embeds: [embed] });
}

/**
 * Raeumt abgelaufene DM-Aktionen auf.
 */
export function cleanupPendingDms() {
  const now = Date.now();
  for (const [userId, data] of pendingDms) {
    if (now - data.createdAt > TIMEOUT_MS) {
      pendingDms.delete(userId);
    }
  }
}

setInterval(cleanupPendingDms, 60_000);
