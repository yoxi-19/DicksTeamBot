// Variable: Discord-Hilfsfunktionen (Rollen, Nicknames, Logging, Embeds).
// Alle benutzersichtbaren Texte sind auf Deutsch.

import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import * as db from '../database/index.js';
import configService from '../server/config.js';
import logger from '../shared/logger.js';
import { LogCategory } from '../shared/types.js';
import { hexToDecimal } from '../shared/types.js';
import { formatDate } from '../shared/utils.js';
import eventBus from '../shared/events.js';

/**
 * Erstellt einen standardisierten Team DICKS Embed.
 * @param {object} opts { title, description, color, fields, thumbnail }
 * @returns {EmbedBuilder}
 */
export function buildEmbed({ title, description, color = 'primary', fields = [], footer = null, timestamp = true }) {
  const colors = configService.getColors();
  const colorHex = colors[color] || colors.primary || 'AEC6CF';
  const embed = new EmbedBuilder()
    .setColor(hexToDecimal(colorHex))
    .setTitle(title);

  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  if (timestamp) embed.setTimestamp();

  return embed;
}

/**
 * Aktualisiert den Discord-Nickname eines Mitglieds auf den IGN.
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {string} ign
 * @returns {Promise<boolean>} true bei Erfolg.
 */
export async function syncNickname(guild, discordId, ign) {
  try {
    const member = await guild.members.fetch(discordId);
    if (!member) {
      logger.warn(`[Discord] Nickname-Sync: Member ${discordId} nicht gefunden.`);
      return false;
    }
    const nickname = ign?.trim() || null;
    if (member.nickname === nickname || (nickname && member.user.username === nickname)) {
      return true; // Nickname stimmt schon
    }
    await member.setNickname(nickname, nickname ? 'IGN-Synchronisierung' : 'Verifizierung entfernt');
    logger.info(`[Discord] Nickname geändert: ${member.user.tag} -> ${nickname || 'zurückgesetzt'}`);
    return true;
  } catch (err) {
    logger.warn(`[Discord] Nickname-Sync fehlgeschlagen für ${discordId}: ${err.message}`);
    return false;
  }
}

/**
 * Gibt einem Mitglied eine Rolle, wenn konfiguriert.
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {string} roleKey 'roleVerified' | 'roleTeam' | 'roleJoin' | 'roleAdmin'
 * @returns {Promise<boolean>}
 */
export async function grantRole(guild, discordId, roleKey) {
  const roleId = configService.getRoleId(roleKey);
  if (!roleId) return false;
  try {
    const member = await guild.members.fetch(discordId);
    const role = await guild.roles.fetch(roleId);
    if (member && role) {
      await member.roles.add(role, 'Automatische Rollenvergabe');
      return true;
    }
  } catch (err) {
    logger.warn(`[Discord] Rolle ${roleKey} konnte nicht vergeben werden: ${err.message}`);
  }
  return false;
}

/**
 * Entfernt eine Rolle von einem Mitglied.
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {string} roleKey
 * @returns {Promise<boolean>}
 */
export async function removeRole(guild, discordId, roleKey) {
  const roleId = configService.getRoleId(roleKey);
  if (!roleId) return false;
  try {
    const member = await guild.members.fetch(discordId);
    const role = await guild.roles.fetch(roleId);
    if (member && role) {
      await member.roles.remove(role, 'Automatische Rollenentfernung');
      return true;
    }
  } catch (err) {
    logger.warn(`[Discord] Rolle ${roleKey} konnte nicht entfernt werden: ${err.message}`);
  }
  return false;
}

/**
 * Gibt einem Mitglied eine Rolle per direkter Rollen-ID.
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {string} roleId
 * @param {string} reason
 * @returns {Promise<boolean>}
 */
export async function grantRoleById(guild, discordId, roleId, reason = 'Automatische Rollenvergabe') {
  if (!roleId) return false;
  try {
    const member = await guild.members.fetch(discordId);
    const role = await guild.roles.fetch(roleId);
    if (member && role) {
      await member.roles.add(role, reason);
      return true;
    }
  } catch (err) {
    logger.warn(`[Discord] Rolle ${roleId} konnte nicht vergeben werden: ${err.message}`);
  }
  return false;
}

/**
 * Entfernt eine Rolle per direkter Rollen-ID.
 * @param {import('discord.js').Guild} guild
 * @param {string} discordId
 * @param {string} roleId
 * @param {string} reason
 * @returns {Promise<boolean>}
 */
export async function removeRoleById(guild, discordId, roleId, reason = 'Automatische Rollenentfernung') {
  if (!roleId) return false;
  try {
    const member = await guild.members.fetch(discordId);
    const role = await guild.roles.fetch(roleId);
    if (member && role) {
      await member.roles.remove(role, reason);
      return true;
    }
  } catch (err) {
    logger.warn(`[Discord] Rolle ${roleId} konnte nicht entfernt werden: ${err.message}`);
  }
  return false;
}

/**
 * Prüft, ob ein Nutzer eine Admin-Rolle besitzt.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
export function isAdmin(member) {
  const adminRoleId = configService.getRoleId('roleAdmin');
  if (adminRoleId) {
    if (member.roles.cache.has(adminRoleId)) return true;
  }
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Sendet eine Benachrichtigung in den Log-Channel.
 * @param {import('discord.js').Client} client
 * @param {object} data { category, title, description, color, fields }
 */
export async function sendLogEmbed(client, { category, title, description = null, color = 'info', fields = [] }) {
  // DB-Log immer schreiben.
  const logEntry = db.addLog({ category, title, description });
  eventBus.emitToDashboard('logUpdate', logEntry);

  // Channel-Routing: Join/Leave -> channelJoinLogs, Rest -> channelLogs
  const isJoinLeave = category === LogCategory.JOIN_LEAVE;
  const channelId = isJoinLeave
    ? configService.getChannelId('channelJoinLogs')
    : configService.getChannelId('channelLogs');
  if (!channelId) return logEntry;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const embed = buildEmbed({
        title: `[${categoryLabel(category)}] ${title}`,
        description,
        color,
        fields,
      });
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.warn(`[Discord] Log-Embed senden fehlgeschlagen: ${err.message}`);
  }
  return logEntry;
}

/**
 * Übersetzt Log-Kategorien in deutsche Labels.
 * @param {string} category
 * @returns {string}
 */
export function categoryLabel(category) {
  const map = {
    [LogCategory.VERIFY]: 'Verifizierung',
    [LogCategory.TEAM]: 'Team',
    [LogCategory.PAYMENT]: 'Zahlung',
    [LogCategory.SYSTEM]: 'System',
    [LogCategory.ERROR]: 'Fehler',
    [LogCategory.COMMAND]: 'Command',
  };
  return map[category] || category;
}

/**
 * Sendet eine private Nachricht (DM) an einen Nutzer.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {string|object} content
 * @returns {Promise<boolean>}
 */
export async function sendDm(client, discordId, content) {
  try {
    const user = await client.users.fetch(discordId);
    if (!user) return false;
    if (typeof content === 'string') {
      await user.send(content);
    } else if (content.embeds || content.content) {
      await user.send({ content: content.content, embeds: content.embeds });
    }
    return true;
  } catch (err) {
    logger.warn(`[Discord] DM senden fehlgeschlagen: ${err.message}`);
    return false;
  }
}

/**
 * Erstellt einen Erfolgs-Embed (Gruen).
 * @param {string} title
 * @param {string} description
 * @returns {EmbedBuilder}
 */
export function successEmbed(title, description) {
  return buildEmbed({ title, description, color: 'success' });
}

/**
 * Erstellt einen Fehler-Embed (Rot).
 * @param {string} title
 * @param {string} description
 * @returns {EmbedBuilder}
 */
export function errorEmbed(title, description) {
  return buildEmbed({ title, description, color: 'error' });
}

/**
 * Erstellt einen deutschen Zeitstempel-String für Embeds.
 * @param {Date} date
 * @returns {string}
 */
export function deDateTime(date = new Date()) {
  return formatDate(date);
}
