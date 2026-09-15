// Variable: Verifizierungs-Service.
// Verwaltet den vollstaendigen Lebenszyklus der Discord<->Minecraft Verifizierung.

import * as db from '../database/index.js';
import configService from '../server/config.js';
import logger from '../shared/logger.js';
import { generateCode, PlayerStatus, LogCategory } from '../shared/types.js';
import { sanitizeIgn } from '../shared/types.js';
import eventBus from '../shared/events.js';
import { syncNickname, grantRole, removeRole, sendLogEmbed } from './helpers.js';
import { sendPaymentEmbed } from './paymentService.js';
import { removeRankRoles, clearOwnerSlots } from './teamService.js';

/**
 * Startet die Verifizierung fuer einen Discord-Nutzer.
 * Erzeugt einen Code und speichert ihn 5 Minuten gueltig in der DB.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {string} ign
 * @returns {Promise<{ ok: boolean, code?: string, error?: string }>}
 */
export async function startVerification(client, guild, discordId, ign) {
  const cleanIgn = sanitizeIgn(ign);
  if (!cleanIgn) {
    return { ok: false, error: 'Ungueltiger Minecraft-Name. Der Name muss 3-16 Zeichen (Buchstaben, Zahlen, Unterstrich) enthalten.' };
  }

  // Pruefen, ob der IGN bereits von jemand anderem verifiziert wurde.
  const existingByIgn = db.findUserByIgn(cleanIgn);
  if (existingByIgn && existingByIgn.discord_id && existingByIgn.discord_id !== discordId) {
    return { ok: false, error: 'Dieser Minecraft-Name ist bereits mit einem anderen Discord-Konto verknuepft.' };
  }

  const verifySettings = configService.get('verify', {});
  const codeLength = verifySettings.codeLength || 6;
  const ttlMs = verifySettings.codeTtlMs || 5 * 60 * 1000;

  const code = generateCode(codeLength);

  // Alte Codes des Nutzers invalidieren.
  db.invalidateCodesForUser(discordId);

  const record = db.createVerificationCode({
    discordId,
    ign: cleanIgn,
    code,
    ttlMs,
  });

  logger.info(`[Verify] Code ${code} fuer Discord ${discordId} (IGN ${cleanIgn}) erstellt.`);

  return { ok: true, code, ign: cleanIgn, record };
}

/**
 * Schliesst die Verifizierung ab, wenn der Spieler den Code im Spiel eingibt.
 * Aufruf durch die Minecraft-Bridge.
 * @param {import('discord.js').Client} client
 * @param {string} code
 * @param {string} submittedIgn
 * @returns {Promise<{ ok: boolean, message: string, discordId?: string }>}
 */
export async function completeVerification(client, code, submittedIgn) {
  const record = db.findActiveCode(code);
  if (!record) {
    return { ok: false, message: 'Ungueltiger oder abgelaufener Code.' };
  }

  const messageId = record.message_id || null;

  // IGN-Abgleich: Pruefen ob der Spieler, der den Code sendet, der richtige ist.
  if (submittedIgn && record.ign.toLowerCase() !== submittedIgn.toLowerCase()) {
    return { ok: false, message: 'MISMATCH', discordId: record.discord_id, messageId };
  }

  const discordId = record.discord_id;

  // Benutzer upserten (verifizieren).
  const user = db.upsertUser({
    discord_id: discordId,
    ign: record.ign,
    status: PlayerStatus.VERIFIED,
    verified_at: new Date().toISOString(),
  });

  // Code als verwendet markieren.
  db.markCodeUsed(record.id);

  const guild = await resolveGuild(client);
  if (guild) {
    await syncNickname(guild, discordId, record.ign);
    // Keine Verified-Rolle hier: Die gibt es erst mit dem Team-Beitritt.
    // Die Beitrittsanfrage-Rolle bleibt bis dahin ebenfalls erhalten.
  }

  // Log (kein DM - Bridge bearbeitet das origale Embed).
  await sendLogEmbed(client, {
    category: LogCategory.VERIFY,
    title: 'Konto verifiziert',
    description: `<@${discordId}> hat sich als **${record.ign}** verifiziert.`,
    color: 'success',
  });

  // Reihenfolge fuer den Nutzer: erst die erfolgreiche Verifizierung, danach
  // die konkrete Zahlungsaufforderung – beide in derselben DM-Unterhaltung.
  try {
    const { EmbedBuilder } = await import('discord.js');
    const discordUser = await client.users.fetch(discordId);
    const dm = await discordUser.createDM();
    const doneEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Verifizierung erfolgreich')
      .setDescription(`Dein Minecraft-Konto **${record.ign}** wurde erfolgreich verifiziert.`)
      .setTimestamp();
    await dm.send({ embeds: [doneEmbed] });
    await sendPaymentEmbed(client, discordId, record.ign);
  } catch (err) {
    logger.warn(`[Verify] Konnte Abschlussnachrichten nicht senden: ${err.message}`);
  }

  eventBus.emitToDashboard('verificationSuccess', {
    discordId,
    ign: record.ign,
    timestamp: new Date().toISOString(),
  });
  eventBus.emitToDashboard('playerUpdate', db.listUsers());

  logger.info(`[Verify] Verifizierung abgeschlossen: ${discordId} -> ${record.ign}`);
  return { ok: true, message: `Verifiziert als ${record.ign}.`, discordId, ign: record.ign, messageId };
}

/**
 * Erzwingt eine Verifizierung durch einen Admin (ueberschreibt).
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {string} ign
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function forceVerify(client, discordId, ign) {
  const cleanIgn = sanitizeIgn(ign);
  if (!cleanIgn) {
    return { ok: false, message: 'Ungueltiger Minecraft-Name.' };
  }

  const user = db.upsertUser({
    discord_id: discordId,
    ign: cleanIgn,
    status: PlayerStatus.VERIFIED,
    verified_at: new Date().toISOString(),
  });

  const guild = await resolveGuild(client);
  if (guild) {
    await syncNickname(guild, discordId, cleanIgn);
    await grantRole(guild, discordId, 'roleVerified');
    await removeRole(guild, discordId, 'roleJoin');
  }

  await sendLogEmbed(client, {
    category: LogCategory.VERIFY,
    title: 'Konto erzwungen verifiziert',
    description: `<@${discordId}> wurde von einem Admin als **${cleanIgn}** verifiziert.`,
    color: 'warning',
  });

  eventBus.emitToDashboard('playerUpdate', db.listUsers());
  return { ok: true, message: `Benutzer wurde als ${cleanIgn} verifiziert.` };
}

/**
 * Loest die Verknuepfung eines Benutzers (unlink).
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function unlink(client, discordId) {
  const existing = db.findUserByDiscord(discordId);
  if (!existing || !existing.ign) {
    return { ok: false, message: 'Benutzer ist nicht verlinkt.' };
  }
  const ign = existing.ign;
  db.unlinkUser(discordId);

  const guild = await resolveGuild(client);
  if (guild) {
    await removeRole(guild, discordId, 'roleVerified');
    await removeRole(guild, discordId, 'roleTeam');
    await removeRankRoles(guild, discordId);
    await grantRole(guild, discordId, 'roleJoin');
    await syncNickname(guild, discordId, '');
  }
  await clearOwnerSlots(client, discordId);

  await sendLogEmbed(client, {
    category: LogCategory.VERIFY,
    title: 'Verknuepfung entfernt',
    description: `<@${discordId}> wurde von **${ign}** getrennt.`,
    color: 'error',
  });

  eventBus.emitToDashboard('playerUpdate', db.listUsers());
  return { ok: true, message: `Verknuepfung zu ${ign} wurde entfernt.` };
}

/**
 * Hilfsfunktion: ermittelt die Guild anhand der konfigurierten ID.
 * @param {import('discord.js').Client} client
 * @returns {Promise<import('discord.js').Guild|null>}
 */
async function resolveGuild(client) {
  const guildId = configService.env.discordGuildId;
  if (!guildId) return null;
  try {
    return await client.guilds.fetch(guildId);
  } catch {
    return client.guilds.cache.first() || null;
  }
}

export default { startVerification, completeVerification, forceVerify, unlink };
