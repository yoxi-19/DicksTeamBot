// Variable: Team-Service (vereinheitlichtes System).
// Verwaltet Team-Bewerbungen (Join Requests) und Einladungen.
// Eine einzige Pipeline: pending -> accepted/rejected.

import * as db from '../database/index.js';
import configService from '../server/config.js';
import logger from '../shared/logger.js';
import { ApplicationStatus, PlayerStatus, LogCategory } from '../shared/types.js';
import { sanitizeIgn } from '../shared/types.js';
import eventBus from '../shared/events.js';
import { syncNickname, grantRole, removeRole, sendLogEmbed, sendDm, successEmbed } from './helpers.js';

/**
 * Ein Player moechte dem Team beitreten (aus Discord).
 * Erzeugt eine Bewerbung und sendet die Einladung im Spiel.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {string} ign
 * @returns {Promise<{ ok: boolean, application?: object, error?: string }>}
 */
export async function requestJoin(client, discordId, ign) {
  const cleanIgn = sanitizeIgn(ign);
  if (!cleanIgn) {
    return { ok: false, error: 'Ungueltiger Minecraft-Name.' };
  }

  // Nur verifizierte Nutzer duerfen beitreten.
  const user = db.findUserByDiscord(discordId);
  if (!user || user.status !== PlayerStatus.VERIFIED) {
    return { ok: false, error: 'Du musst zuerst verifiziert sein, bevor du dem Team beitreten kannst.' };
  }

  // Ign muss mit dem verifizierten IGN uebereinstimmen.
  if (user.ign && user.ign.toLowerCase() !== cleanIgn.toLowerCase()) {
    return { ok: false, error: `Der Name stimmt nicht mit deinem verifizierten Namen (${user.ign}) ueberein.` };
  }

  const application = db.createApplication({ discordId, ign: cleanIgn });

  // Befehl an die Minecraft-Bridge senden, den Spieler einzuladen.
  eventBus.emit('minecraft:teamInvite', { ign: cleanIgn, discordId, applicationId: application.id });

  await sendLogEmbed(client, {
    category: LogCategory.TEAM,
    title: 'Team-Bewerbung',
    description: `<@${discordId}> moechte dem Team beitreten (IGN **${cleanIgn}**).`,
    color: 'info',
  });

  eventBus.emitToDashboard('teamUpdate', db.listApplications());
  return { ok: true, application, ign: cleanIgn };
}

/**
 * Ein Player hat die Team-Einladung im Spiel angenommen (oder beigetreten).
 * Wird von der Minecraft-Bridge aufgerufen.
 * @param {import('discord.js').Client} client
 * @param {string} ign
 * @returns {Promise<boolean>}
 */
export async function handleTeamJoined(client, ign) {
  const cleanIgn = sanitizeIgn(ign);
  if (!cleanIgn) return false;

  const user = db.findUserByIgn(cleanIgn);
  if (!user || !user.discord_id) {
    logger.warn(`[Team] Kein Discord-Konto fuer ${cleanIgn} gefunden.`);
    return false;
  }

  // Status auf Team setzen.
  db.upsertUser({
    discord_id: user.discord_id,
    status: PlayerStatus.TEAM,
    ign: cleanIgn,
  });

  // Zugehoerige pending-Bewerbungen akzeptieren.
  db.acceptApplicationsForIgn(cleanIgn);

  const guild = await resolveGuild(client);
  if (guild) {
    await syncNickname(guild, user.discord_id, cleanIgn);
    await grantRole(guild, user.discord_id, 'roleTeam');
    await removeRole(guild, user.discord_id, 'roleJoin');
  }

  await sendLogEmbed(client, {
    category: LogCategory.TEAM,
    title: 'Team beigetreten',
    description: `**${cleanIgn}** ist dem Team beigetreten.`,
    color: 'success',
  });

  await sendDm(client, user.discord_id, {
    embeds: [successEmbed('Team beigetreten', `Willkommen im Team, **${cleanIgn}**!`)],
  });

  eventBus.emitToDashboard('teamUpdate', db.listApplications());
  eventBus.emitToDashboard('playerUpdate', db.listUsers());
  return true;
}

/**
 * Ein Spieler hat das Team verlassen.
 * @param {import('discord.js').Client} client
 * @param {string} ign
 * @returns {Promise<boolean>}
 */
export async function handleTeamLeft(client, ign) {
  const cleanIgn = sanitizeIgn(ign);
  if (!cleanIgn) return false;

  const user = db.findUserByIgn(cleanIgn);
  if (!user || !user.discord_id) return false;

  db.upsertUser({
    discord_id: user.discord_id,
    status: PlayerStatus.VERIFIED,
    ign: cleanIgn,
  });

  const guild = await resolveGuild(client);
  if (guild) {
    await removeRole(guild, user.discord_id, 'roleTeam');
  }

  await sendLogEmbed(client, {
    category: LogCategory.TEAM,
    title: 'Team verlassen',
    description: `**${cleanIgn}** hat das Team verlassen.`,
    color: 'warning',
  });

  eventBus.emitToDashboard('playerUpdate', db.listUsers());
  return true;
}

/**
 * Admin-Zustimmung/Ablehnung einer Bewerbung.
 * @param {import('discord.js').Client} client
 * @param {number} applicationId
 * @param {'accepted'|'rejected'} decision
 * @param {string} reviewerId
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function reviewApplication(client, applicationId, decision, reviewerId) {
  const app = db.findApplicationById(applicationId);
  if (!app) {
    return { ok: false, message: 'Bewerbung nicht gefunden.' };
  }
  if (app.status !== ApplicationStatus.PENDING) {
    return { ok: false, message: 'Diese Bewerbung wurde bereits bearbeitet.' };
  }

  const status = decision === 'accepted' ? ApplicationStatus.ACCEPTED : ApplicationStatus.REJECTED;
  db.updateApplicationStatus(applicationId, status, reviewerId);

  // Bei Akzeptanz Spieler in Team versetzen.
  if (decision === 'accepted') {
    const user = db.findUserByDiscord(app.discord_id);
    if (user) {
      db.upsertUser({
        discord_id: app.discord_id,
        status: PlayerStatus.TEAM,
        ign: app.ign,
      });
      const guild = await resolveGuild(client);
      if (guild) {
        await syncNickname(guild, app.discord_id, app.ign);
        await grantRole(guild, app.discord_id, 'roleTeam');
        await removeRole(guild, app.discord_id, 'roleJoin');
      }
      await sendDm(client, app.discord_id, {
        embeds: [successEmbed('Bewerbung angenommen', `Deine Team-Bewerbung wurde angenommen. Willkommen, **${app.ign}**!`)],
      });
    }
  } else {
    await sendDm(client, app.discord_id, `Deine Team-Bewerbung wurde leider abgelehnt.`);
  }

  await sendLogEmbed(client, {
    category: LogCategory.TEAM,
    title: status === ApplicationStatus.ACCEPTED ? 'Bewerbung angenommen' : 'Bewerbung abgelehnt',
    description: `Bewerbung von **${app.ign}** wurde ${status === ApplicationStatus.ACCEPTED ? 'angenommen' : 'abgelehnt'}.`,
    color: status === ApplicationStatus.ACCEPTED ? 'success' : 'error',
  });

  eventBus.emitToDashboard('teamUpdate', db.listApplications());
  eventBus.emitToDashboard('playerUpdate', db.listUsers());
  return { ok: true, message: `Bewerbung wurde ${status === ApplicationStatus.ACCEPTED ? 'angenommen' : 'abgelehnt'}.` };
}

/**
 * Ruft alle Bewerbungen ab.
 * @param {string|null} status
 * @returns {object[]}
 */
export function getApplications(status = null) {
  return db.listApplications(status);
}

async function resolveGuild(client) {
  const guildId = configService.env.discordGuildId;
  if (!guildId) return null;
  try {
    return await client.guilds.fetch(guildId);
  } catch {
    return client.guilds.cache.first() || null;
  }
}

export default { requestJoin, handleTeamJoined, handleTeamLeft, reviewApplication, getApplications };