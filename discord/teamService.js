// Variable: Team-Service (vereinheitlichtes System).
// Verwaltet Team-Bewerbungen (Join Requests) und Einladungen.
// Eine einzige Pipeline: pending -> accepted/rejected.

import * as db from '../database/index.js';
import configService from '../server/config.js';
import logger from '../shared/logger.js';
import { ApplicationStatus, PlayerStatus, LogCategory } from '../shared/types.js';
import { sanitizeIgn } from '../shared/types.js';
import eventBus from '../shared/events.js';
import { syncNickname, grantRole, removeRole, grantRoleById, removeRoleById, sendLogEmbed, sendDm, successEmbed } from './helpers.js';
import { consumePendingPaymentConfirm, cancelRefund } from './paymentService.js';

/**
 * Liefert die Rank-Konfiguration (Anzahl Teams + Rollen je Rang).
 * Rang 1 = hoechstes Team, count = Einstiegsrang.
 * @returns {{ count: number, roles: Record<string,string>, ownerRoles: Record<string,string>, owners: Record<string,string> }}
 */
export function getRankConfig() {
  const raw = configService.get('teamRanks', {});
  const count = Number.isInteger(raw.count) && raw.count >= 1 && raw.count <= 10 ? raw.count : 5;
  const roles = raw.roles && typeof raw.roles === 'object' ? raw.roles : {};
  const ownerRoles = raw.ownerRoles && typeof raw.ownerRoles === 'object' ? raw.ownerRoles : {};
  const owners = raw.owners && typeof raw.owners === 'object' ? raw.owners : {};
  return { count, roles, ownerRoles, owners };
}

/**
 * Rollen-ID fuer einen Rang ('' wenn nicht konfiguriert).
 */
export function getRankRoleId(rank, cfg = null) {
  const { roles } = cfg || getRankConfig();
  const id = roles[String(rank)];
  return id ? String(id) : '';
}

/**
 * Owner-Rollen-ID fuer einen Rang ('' wenn nicht konfiguriert).
 */
export function getOwnerRoleId(rank, cfg = null) {
  const { ownerRoles } = cfg || getRankConfig();
  const id = ownerRoles[String(rank)];
  return id ? String(id) : '';
}

/**
 * Owner-Discord-ID eines Rangs (null wenn keiner gesetzt).
 */
export function getTeamOwner(rank, cfg = null) {
  const { owners } = cfg || getRankConfig();
  const id = owners[String(rank)];
  return id && /^\d{15,20}$/.test(String(id)) ? String(id) : null;
}

/**
 * Rang, dessen Owner ein Discord-User ist (null wenn keiner).
 */
export function findOwnerRank(discordId, cfg = null) {
  const { count } = cfg || getRankConfig();
  for (let r = 1; r <= count; r++) {
    if (getTeamOwner(r, cfg) === discordId) return r;
  }
  return null;
}

/**
 * Aktueller Rang eines Users (aus users.team). Unbekannt -> Einstiegsrang.
 */
export function getUserRank(user, cfg = null) {
  const { count } = cfg || getRankConfig();
  const rank = Number.parseInt(user?.team, 10);
  if (!Number.isInteger(rank) || rank < 1 || rank > count) return count;
  return rank;
}

/**
 * Setzt die Rang-Rollen: entfernt alle Rank-Rollen, gibt die Ziel-Rolle.
 */
export async function syncRankRoles(guild, discordId, rank) {
  if (!guild) return;
  const cfg = getRankConfig();
  for (let r = 1; r <= cfg.count; r++) {
    const roleId = getRankRoleId(r, cfg);
    if (roleId && r !== rank) {
      await removeRoleById(guild, discordId, roleId, 'Rangwechsel');
    }
  }
  const targetId = getRankRoleId(rank, cfg);
  if (targetId) {
    await grantRoleById(guild, discordId, targetId, 'Rangwechsel');
  }
}

/**
 * Entfernt alle Rang-Rollen (bei Leave/Unlink/Remove).
 */
export async function removeRankRoles(guild, discordId) {
  if (!guild) return;
  const cfg = getRankConfig();
  for (let r = 1; r <= cfg.count; r++) {
    const roleId = getRankRoleId(r, cfg);
    if (roleId) {
      await removeRoleById(guild, discordId, roleId, 'Team verlassen');
    }
    const ownerRoleId = getOwnerRoleId(r, cfg);
    if (ownerRoleId) {
      await removeRoleById(guild, discordId, ownerRoleId, 'Team verlassen');
    }
  }
}

/**
 * Setzt den Owner eines Teams (inkl. Extra-Rolle). Der Owner wird
 * automatisch auf den Rang gesetzt. Mit null wird der Slot geleert.
 * @param {import('discord.js').Client} client
 * @param {number} rank - bereits validiert (1..count)
 * @param {string|null} discordId - neuer Owner oder null zum Leeren
 * @param {string} actorTag
 */
export async function setTeamOwner(client, rank, discordId, actorTag = 'System') {
  const cfg = getRankConfig();
  if (!Number.isInteger(rank) || rank < 1 || rank > cfg.count) {
    return { ok: false, error: `Rang muss zwischen 1 und ${cfg.count} liegen.` };
  }

  let target = null;
  if (discordId) {
    target = db.findUserByDiscord(discordId);
    if (!target || !target.ign || target.status !== PlayerStatus.TEAM) {
      return { ok: false, error: 'Der Owner muss ein verlinktes Team-Mitglied sein.' };
    }
  }

  const oldOwnerId = getTeamOwner(rank, cfg);
  const owners = { ...cfg.owners };

  // Alten Owner entrollen
  const guild = await resolveGuild(client);
  if (guild && oldOwnerId && oldOwnerId !== discordId) {
    const oldOwnerRole = getOwnerRoleId(rank, cfg);
    if (oldOwnerRole) {
      await removeRoleById(guild, oldOwnerId, oldOwnerRole, 'Ownerwechsel');
    }
  }

  if (!discordId) {
    delete owners[String(rank)];
    const result = configService.update({ teamRanks: { ...cfg, owners } });
    if (!result.ok) return { ok: false, error: result.errors.join('\n') };
    await sendLogEmbed(client, {
      category: LogCategory.TEAM,
      title: 'Team-Owner entfernt',
      description: `Team **${rank}** hat keinen Owner mehr (durch ${actorTag}).`,
      color: 'warning',
    });
    eventBus.emitToDashboard('playerUpdate', db.listUsers());
    return { ok: true, rank, owner: null };
  }

  // Neuen Owner auf den Rang setzen (inkl. Rang-Rolle), dann Extra-Rolle geben.
  // Danach Config frisch lesen: setUserRank kann Slots veraendert haben.
  const rankResult = await setUserRank(client, discordId, rank, actorTag, { skipLog: true });
  if (!rankResult.ok) return rankResult;

  const fresh = getRankConfig();
  const freshOwners = { ...fresh.owners };
  freshOwners[String(rank)] = discordId;
  const updateResult = configService.update({ teamRanks: { ...fresh, owners: freshOwners } });
  if (!updateResult.ok) return { ok: false, error: updateResult.errors.join('\n') };

  if (guild) {
    const ownerRoleId = getOwnerRoleId(rank, cfg);
    if (ownerRoleId) {
      await grantRoleById(guild, discordId, ownerRoleId, 'Team-Owner');
    }
  }

  await sendLogEmbed(client, {
    category: LogCategory.TEAM,
    title: 'Team-Owner gesetzt',
    description: `<@${discordId}> (**${target.ign}**) ist jetzt Owner von Team **${rank}** (durch ${actorTag}).`,
    color: 'success',
  });

  eventBus.emitToDashboard('playerUpdate', db.listUsers());
  logger.info(`[Team] Owner Team ${rank}: ${target.ign} (durch ${actorTag})`);
  return { ok: true, rank, owner: db.findUserByDiscord(discordId) };
}

/**
 * Synchronisiert die Owner-Rollen eines Users: Owner-Rolle des eigenen
 * Owner-Rangs geben, alle anderen Owner-Rollen entfernen.
 */
export async function syncOwnerRoles(guild, discordId) {
  if (!guild) return;
  const cfg = getRankConfig();
  const ownRank = findOwnerRank(discordId, cfg);
  for (let r = 1; r <= cfg.count; r++) {
    const ownerRoleId = getOwnerRoleId(r, cfg);
    if (!ownerRoleId) continue;
    if (r === ownRank) {
      await grantRoleById(guild, discordId, ownerRoleId, 'Team-Owner Sync');
    } else {
      await removeRoleById(guild, discordId, ownerRoleId, 'Team-Owner Sync');
    }
  }
}

/**
 * Entfernt alle Owner-Rollen eines Users.
 */
export async function removeOwnerRoles(guild, discordId) {
  if (!guild) return;
  const cfg = getRankConfig();
  for (let r = 1; r <= cfg.count; r++) {
    const ownerRoleId = getOwnerRoleId(r, cfg);
    if (ownerRoleId) {
      await removeRoleById(guild, discordId, ownerRoleId, 'Owner entfernt');
    }
  }
}

/**
 * Erkennt Owner automatisch: Owner eines Teams ist das verlinkte
 * Team-Mitglied dieses Rangs, das die Owner-Rolle auf Discord hat.
 * Admins/Mods mit der Rolle (aber ohne Team-Mitgliedschaft) werden ignoriert.
 * Schreibt Aenderungen in die owners-Config (reiner Cache, keine Handarbeit).
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Collection<string, import('discord.js').GuildMember>|null} preFetchedMembers - bereits geladene Member (spart API-Calls)
 * @returns {Promise<Array<{ rank: number, ownerId: string|null, changed: boolean }>>}
 */
export async function detectTeamOwners(guild, preFetchedMembers = null) {
  const cfg = getRankConfig();
  let members = preFetchedMembers || null;
  if (!members) {
    try {
      members = await guild.members.fetch();
    } catch (err) {
      if (/rate limit|opcode 8/i.test(err.message)) {
        logger.debug(`[Team] Owner-Erkennung uebersprungen (Rate-Limit).`);
      } else {
        logger.warn(`[Team] Owner-Erkennung: Mitglieder konnten nicht geladen werden: ${err.message}`);
      }
      return [];
    }
  }

  const results = [];
  const owners = { ...cfg.owners };
  let changed = false;

  for (let r = 1; r <= cfg.count; r++) {
    const ownerRoleId = getOwnerRoleId(r, cfg);
    if (!ownerRoleId) continue;

    // Berechtigte Inhaber: verlinkte Team-Mitglieder DIESES Rangs mit der Rolle
    const eligible = [...members.values()].filter((member) => member.roles.cache.has(ownerRoleId)).map((member) => member.id)
      .filter((id) => {
        const u = db.findUserByDiscord(id);
        return u && u.status === PlayerStatus.TEAM && String(u.team || '') === String(r);
      })
      .sort();

    const current = getTeamOwner(r, cfg);
    let next = current;
    if (current && eligible.includes(current)) {
      next = current; // stabil bleiben
    } else if (eligible.length === 1) {
      next = eligible[0];
    } else if (eligible.length === 0) {
      next = null;
    }
    // Bei mehreren: bisherigen behalten (auch wenn ungueltig), Admin klaert per team-setowner

    const nextStr = next || '';
    if ((owners[String(r)] || '') !== nextStr) {
      if (nextStr) owners[String(r)] = nextStr;
      else delete owners[String(r)];
      changed = true;
    }
    results.push({ rank: r, ownerId: next, changed: (owners[String(r)] || '') !== (cfg.owners?.[String(r)] || '') });
  }

  if (changed) {
    configService.update({ teamRanks: { ...getRankConfig(), owners } });
    logger.info('[Team] Owner-Erkennung: Slots aktualisiert.');
  }
  return results;
}

/**
 * Loescht alle Owner-Slots eines Users (bei Leave/Unlink/Remove).
 * Entfernt auch die Owner-Rollen. Gibt die geraeumten Raenge zurueck.
 */
export async function clearOwnerSlots(client, discordId) {
  const cfg = getRankConfig();
  const cleared = [];
  for (let r = 1; r <= cfg.count; r++) {
    if (getTeamOwner(r, cfg) === discordId) cleared.push(r);
  }
  if (cleared.length === 0) return cleared;

  const guild = client ? await resolveGuild(client) : null;
  if (guild) {
    for (const r of cleared) {
      const ownerRoleId = getOwnerRoleId(r, cfg);
      if (ownerRoleId) {
        await removeRoleById(guild, discordId, ownerRoleId, 'Owner entfernt');
      }
    }
  }

  const owners = { ...cfg.owners };
  for (const r of cleared) delete owners[String(r)];
  configService.update({ teamRanks: { ...cfg, owners } });
  return cleared;
}

/**
 * Gleicht alle Discord-Rollen mit dem Datenbankstatus ab.
 * - Erkennt Owner aus Owner-Rollen
 * - TEAM: Team-Rolle + Rang-Rolle + Owner-Rolle geben, Join-Rolle weg
 * - VERIFIED: Verified-Rolle geben, Team-/Rang-/Owner-Rollen weg
 * Ueberfluessige Rollen (z.B. Reste nach DB-Wipe) werden dabei entfernt.
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ ok: boolean, synced: number, errors: number, detectedOwners: number, error?: string }>}
 */
export async function syncAllMembers(client) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, synced: 0, errors: 0, detectedOwners: 0, error: 'Discord-Server nicht gefunden.' };
  }

  const users = db.listUsers();
  const linkedTeamMembers = new Map();
  await Promise.all(users
    .filter((user) => user.status === PlayerStatus.TEAM && user.discord_id)
    .map(async (user) => {
      const member = await guild.members.fetch({ user: user.discord_id, force: true }).catch(() => null);
      if (member) linkedTeamMembers.set(member.id, member);
    }));

  let detectedOwners = 0;
  try {
    // Owner muessen verknuepfte Team-Mitglieder sein. Deshalb reicht diese
    // kleine Liste und ein langsamer globaler Members-Intent ist nicht noetig.
    const detected = await detectTeamOwners(guild, linkedTeamMembers);
    detectedOwners = detected.filter((d) => d.ownerId).length;
  } catch (err) {
    logger.warn(`[Discord] Owner-Erkennung fehlgeschlagen: ${err.message}`);
  }

  let synced = 0;
  let errors = 0;

  for (let user of users) {
    if (!user.discord_id) continue;

    try {
      if (user.status === PlayerStatus.TEAM) {
        // Alte oder manuell bearbeitete Datensaetze koennen den Team-Status
        // ohne Rang enthalten. Den abgeleiteten Einstiegsrang auch speichern,
        // damit Datenbank und Discord-Anzeige nicht auseinanderlaufen.
        const rank = getUserRank(user);
        if (String(user.team || '') !== String(rank)) {
          user = db.upsertUser({ ...user, team: String(rank) });
          logger.info(`[Team] Fehlenden Rang fuer ${user.ign || user.discord_id} auf Team ${rank} repariert.`);
        }
        await grantRole(guild, user.discord_id, 'roleTeam');
        await grantRole(guild, user.discord_id, 'roleVerified');
        await syncRankRoles(guild, user.discord_id, rank);
        await syncOwnerRoles(guild, user.discord_id);
        await removeRole(guild, user.discord_id, 'roleJoin');
      } else if (user.status === PlayerStatus.VERIFIED) {
        // Verifiziert ohne Team: keine Team-Rollen und auch keine
        // Verified-Rolle (die gibt es erst mit dem Team-Beitritt).
        await removeRole(guild, user.discord_id, 'roleVerified');
        await removeRole(guild, user.discord_id, 'roleTeam');
        await removeRankRoles(guild, user.discord_id);
        await removeOwnerRoles(guild, user.discord_id);
        await removeRole(guild, user.discord_id, 'roleJoin');
      }
      synced++;
    } catch (err) {
      logger.error(`[Discord] Sync-Fehler fuer ${user.discord_id}: ${err.message}`);
      errors++;
    }
  }

  return { ok: true, synced, errors, detectedOwners };
}
export function findRankTarget({ discordId = null, ign = null }) {
  let user = null;
  if (discordId) user = db.findUserByDiscord(discordId);
  else if (ign) user = db.findUserByIgn(ign);
  if (!user || !user.discord_id || !user.ign) {
    return { ok: false, error: 'Spieler nicht gefunden oder nicht verlinkt.' };
  }
  if (user.status !== PlayerStatus.TEAM) {
    return { ok: false, error: `**${user.ign}** ist kein Team-Mitglied (Status: ${user.status}).` };
  }
  return { ok: true, user };
}

/**
 * Setzt den Rang eines Team-Mitglieds (DB + Rollen + Log).
 * Owner-Slots werden hier bewusst NICHT angefasst – Owner vergibt
 * ausschliesslich team-setowner.
 * @param {import('discord.js').Client} client
 * @param {string} discordId
 * @param {number} newRank - bereits validiert (1..count)
 * @param {string} actorTag - wer hat die Aenderung ausgeloest
 * @param {object} opts { skipLog?: boolean }
 * @returns {Promise<{ ok: boolean, user?: object, oldRank?: number, newRank?: number, error?: string }>}
 */
export async function setUserRank(client, discordId, newRank, actorTag = 'System', opts = {}) {
  const cfg = getRankConfig();
  if (!Number.isInteger(newRank) || newRank < 1 || newRank > cfg.count) {
    return { ok: false, error: `Rang muss zwischen 1 und ${cfg.count} liegen.` };
  }

  const user = db.findUserByDiscord(discordId);
  if (!user || !user.ign || user.status !== PlayerStatus.TEAM) {
    return { ok: false, error: 'Spieler ist kein Team-Mitglied.' };
  }

  const oldRank = getUserRank(user, cfg);
  db.upsertUser({ discord_id: discordId, status: PlayerStatus.TEAM, ign: user.ign, team: String(newRank) });

  const guild = await resolveGuild(client);
  if (guild) {
    await syncRankRoles(guild, discordId, newRank);
  }

  if (!opts.skipLog) {
    await sendLogEmbed(client, {
      category: LogCategory.TEAM,
      title: 'Rang geaendert',
      description: `<@${discordId}> (**${user.ign}**) von Team **${oldRank}** auf Team **${newRank}** gesetzt (durch ${actorTag}).`,
      color: 'info',
    });
  }

  eventBus.emitToDashboard('playerUpdate', db.listUsers());
  logger.info(`[Team] Rangwechsel: ${user.ign} ${oldRank} -> ${newRank} (durch ${actorTag})`);
  return { ok: true, user: db.findUserByDiscord(discordId), oldRank, newRank };
}

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

  // Status auf Team setzen, Einstiegsrang = niedrigstes Team (count).
  const startRank = getRankConfig().count;
  db.upsertUser({
    discord_id: user.discord_id,
    status: PlayerStatus.TEAM,
    ign: cleanIgn,
    team: String(startRank),
  });

  // Zugehoerige pending-Bewerbungen akzeptieren.
  db.acceptApplicationsForIgn(cleanIgn);

  const guild = await resolveGuild(client);
  if (guild) {
    await syncNickname(guild, user.discord_id, cleanIgn);
    await grantRole(guild, user.discord_id, 'roleTeam');
    await grantRole(guild, user.discord_id, 'roleVerified');
    await syncRankRoles(guild, user.discord_id, startRank);
    await removeRole(guild, user.discord_id, 'roleJoin');
  }

  await sendLogEmbed(client, {
    category: LogCategory.TEAM,
    title: 'Team beigetreten',
    description: `**${cleanIgn}** ist dem Team beigetreten (Team **${startRank}**).`,
    color: 'success',
  });

  // Falls der Join direkt auf eine Zahlung folgte, die ausstehende
  // Erfolgsmeldung unterdruecken und EINE kombinierte Nachricht schicken.
  // Ein geplanter Refund ist damit ebenfalls hinfällig.
  const pending = consumePendingPaymentConfirm(user.discord_id);
  cancelRefund(user.discord_id);
  if (pending?.payment) {
    await sendDm(client, user.discord_id, {
      embeds: [successEmbed(
        'Zahlung erkannt – Team beigetreten',
        `Deine Zahlung (**$${pending.payment.amount.toLocaleString('de-DE')}**) wurde erkannt.\n\nWillkommen im Team, **${cleanIgn}**! Du startest in Team **${startRank}**.`,
      )],
    });
  } else {
    await sendDm(client, user.discord_id, {
      embeds: [successEmbed('Team beigetreten', `Willkommen im Team, **${cleanIgn}**! Du startest in Team **${startRank}**.`)],
    });
  }

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
    team: null,
  });

  const guild = await resolveGuild(client);
  if (guild) {
    await removeRole(guild, user.discord_id, 'roleTeam');
    await removeRole(guild, user.discord_id, 'roleVerified');
    await removeRankRoles(guild, user.discord_id);
  }
  await clearOwnerSlots(client, user.discord_id);

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

  // Bei Akzeptanz Spieler in Team versetzen (Einstiegsrang).
  if (decision === 'accepted') {
    const user = db.findUserByDiscord(app.discord_id);
    if (user) {
      const startRank = getRankConfig().count;
      db.upsertUser({
        discord_id: app.discord_id,
        status: PlayerStatus.TEAM,
        ign: app.ign,
        team: String(startRank),
      });
      const guild = await resolveGuild(client);
      if (guild) {
        await syncNickname(guild, app.discord_id, app.ign);
        await grantRole(guild, app.discord_id, 'roleTeam');
        await grantRole(guild, app.discord_id, 'roleVerified');
        await syncRankRoles(guild, app.discord_id, startRank);
        await removeRole(guild, app.discord_id, 'roleJoin');
      }
      await sendDm(client, app.discord_id, {
        embeds: [successEmbed('Bewerbung angenommen', `Deine Team-Bewerbung wurde angenommen. Willkommen, **${app.ign}**! Du startest in Team **${startRank}**.`)],
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

export default { requestJoin, handleTeamJoined, handleTeamLeft, reviewApplication, getApplications, getRankConfig, getRankRoleId, getOwnerRoleId, getTeamOwner, findOwnerRank, getUserRank, syncRankRoles, removeRankRoles, syncOwnerRoles, removeOwnerRoles, detectTeamOwners, syncAllMembers, findRankTarget, setUserRank, setTeamOwner, clearOwnerSlots };
