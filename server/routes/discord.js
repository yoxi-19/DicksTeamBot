// Variable: Discord-Live-Route - liest echte Daten vom Discord-Server.
// Damit müssen keine IDs getippt werden: Rollen kommen per Dropdown,
// und der Rank-Check zeigt, wer welche Rolle wirklich hat.

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import * as db from '../../database/index.js';
import { PlayerStatus } from '../../shared/types.js';
import { getDiscordClient } from './services.js';
import { getRankConfig, detectTeamOwners, syncAllMembers } from '../../discord/teamService.js';
import configService from '../config.js';
import logger from '../../shared/logger.js';

const router = Router();

let rolesCache = { at: 0, data: [] };
const ROLES_CACHE_MS = 60 * 1000;
let membersCache = { at: 0, data: [] };
const MEMBERS_CACHE_MS = 60 * 1000;
let rankCheckCache = { at: 0, data: null, errorAt: 0 };
const RANK_CHECK_CACHE_MS = 60 * 1000;
const RANK_CHECK_ERROR_COOLDOWN_MS = 30 * 1000;

function resolveGuild(client) {
  const guildId = configService.env.discordGuildId;
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || null;
}

function serializeMembers(guild, members) {
  return [...members.values()]
    .filter((member) => !member.user.bot)
    .map((member) => ({
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.displayAvatarURL(),
      roles: [...member.roles.cache.values()]
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor })),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'));
}

// Einzelne bekannte Mitglieder lassen sich auch ohne privilegierten
// GuildMembers-Intent abrufen. Das ist der sichere Fallback für verknuepfte
// Konten; nur die Auflistung unbekannter Servermitglieder bleibt dann aus.
async function fetchLinkedMembers(guild) {
  const result = new Map();
  const ids = db.listUsers().map((user) => user.discord_id).filter(Boolean);
  await Promise.all(ids.map(async (id) => {
    // force vermeidet einen veralteten Rollen-Cache nach einer manuellen
    // Rollen-Änderung direkt in Discord.
    const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
    if (member) result.set(member.id, member);
  }));
  return result;
}

// Der globale Member-Download braucht den privilegierten Members-Intent und
// kann ohne ihn den Discord-Gateway-Worker blockieren. Für den Rollen-Sync
// sind ohnehin nur verknuepfte Nutzer relevant; diese werden gezielt geladen.
async function fetchDashboardMembers(guild) {
  return { members: await fetchLinkedMembers(guild), limited: true };
}

async function getGuildRole(guild, roleId) {
  return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
}

// GET /api/discord/roles - Alle Rollen des Servers (für Dropdowns)
router.get('/roles', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ error: 'Discord-Bot ist offline.' });
    }
    if (Date.now() - rolesCache.at < ROLES_CACHE_MS && rolesCache.data.length > 0) {
      return res.json(rolesCache.data);
    }
    const guildId = configService.env.discordGuildId;
    if (!guildId) {
      return res.status(500).json({ error: 'Keine Discord-Guild konfiguriert.' });
    }
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(502).json({ error: 'Discord-Server nicht gefunden.' });
    }
    const roles = await guild.roles.fetch();
    const data = [...roles.values()]
      .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
      .sort((a, b) => b.position - a.position);
    rolesCache = { at: Date.now(), data };
    return res.json(data);
  } catch (err) {
    logger.error(`[Discord-API] Rollen konnten nicht geladen werden: ${err.message}`);
    return res.status(500).json({ error: 'Rollen konnten nicht geladen werden.' });
  }
});

// GET /api/discord/members - Alle echten Servermitglieder inklusive ihrer Rollen.
// Das ist bewusst von rank-check getrennt: Der Rank-Check kennt nur die
// konfigurierten Team-Rollen und kann daher keine normalen Discord-Rollen
// (oder nicht verknuepfte Mitglieder) für das Dashboard liefern.
router.get('/members', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const client = getDiscordClient();
    if (!client?.isReady()) {
      return res.status(503).json({ error: 'Discord-Bot ist offline oder noch nicht bereit.' });
    }
    if (Date.now() - membersCache.at < MEMBERS_CACHE_MS && membersCache.data.length > 0) {
      return res.json(membersCache.data);
    }

    const guildId = configService.env.discordGuildId;
    if (!guildId) {
      return res.status(500).json({ error: 'Keine Discord-Guild konfiguriert.' });
    }
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(502).json({ error: 'Discord-Server nicht gefunden.' });
    }

    const { members } = await fetchDashboardMembers(guild);

    const data = serializeMembers(guild, members);

    membersCache = { at: Date.now(), data };
    return res.json(data);
  } catch (err) {
    logger.error(`[Discord-API] Mitglieder konnten nicht geladen werden: ${err.message}`);
    return res.status(500).json({ error: 'Discord-Mitglieder konnten nicht geladen werden.' });
  }
});

// GET /api/discord/rank-check - Vergleicht DB-Teams mit echten Discord-Rollen.
// Zeigt pro Rang: konfigurierte Rolle, wer sie laut DB haben sollte, wer sie
// auf Discord wirklich hat, plus Owner-Abgleich. Ergebnis 60s gecached.
router.get('/rank-check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const fresh = req.query.fresh === '1';
    if (!fresh && rankCheckCache.data && Date.now() - rankCheckCache.at < RANK_CHECK_CACHE_MS) {
      return res.json(rankCheckCache.data);
    }
    // Nach einem Fehlschlag kurz pausieren statt Discord zuzuspammen
    if (!fresh && !rankCheckCache.data && Date.now() - rankCheckCache.errorAt < RANK_CHECK_ERROR_COOLDOWN_MS) {
      return res.status(503).json({ error: 'Abgleich kurz pausiert (Rate-Limit). Bitte in 30 Sekunden erneut versuchen.' });
    }
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ error: 'Discord-Bot ist offline.' });
    }
    const guildId = configService.env.discordGuildId;
    if (!guildId) {
      return res.status(500).json({ error: 'Keine Discord-Guild konfiguriert.' });
    }
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(502).json({ error: 'Discord-Server nicht gefunden.' });
    }

    const { members, limited: membersLimited } = await fetchDashboardMembers(guild);

    // Owner automatisch aus den Owner-Rollen erkennen (nutzt die
    // bereits geladenen Member, kein zweiter API-Call). Laeuft auch im
    // Limited-Modus: verknuepfte Member reichen für die Erkennung.
    try {
      await detectTeamOwners(guild, members);
    } catch (err) {
      logger.warn(`[Discord-API] Owner-Erkennung fehlgeschlagen: ${err.message}`);
    }

    const cfg = getRankConfig();
    const usersByDiscord = new Map();
    const ignByDiscord = new Map();
    for (const u of db.listUsers()) {
      if (u.discord_id) {
        usersByDiscord.set(u.discord_id, u);
        ignByDiscord.set(u.discord_id, u.ign || u.discord_id);
      }
    }

    const result = [];
    for (let rank = 1; rank <= cfg.count; rank++) {
      const roleId = cfg.roles?.[String(rank)] || '';
      const ownerRoleId = cfg.ownerRoles?.[String(rank)] || '';
      const ownerId = cfg.owners?.[String(rank)] || '';

      const dbMembers = db.listUsers().filter((u) => u.status === PlayerStatus.TEAM && String(u.team || '') !== '' && Number(u.team) === rank);
      const dbIds = new Set(dbMembers.map((u) => u.discord_id).filter(Boolean));

      let roleName = null;
      let liveIds = [];
      if (roleId) {
        const role = await getGuildRole(guild, roleId);
        if (role) {
          roleName = role.name;
          liveIds = [...members.values()].filter((member) => member.roles.cache.has(roleId)).map((member) => member.id);
        }
      }

      const liveSet = new Set(liveIds);
      const missing = [...dbIds]
        .filter((id) => !liveSet.has(id))
        .map((id) => ({ id, ign: ignByDiscord.get(id) || id }));
      // Extra: Rolle vorhanden, aber laut DB nicht für diesen Rang vorgesehen.
      // Mit Status, damit klar ist ob es ein verlinkter (z.B. nur verifizierter)
      // User mit Rollenrest ist oder ein voellig Unbekannter.
      const extra = liveIds
        .filter((id) => !dbIds.has(id))
        .map((id) => {
          const m = members.get(id);
          const u = usersByDiscord.get(id);
          return {
            id,
            name: m ? m.user.username : id,
            ign: u?.ign || null,
            status: u?.status || 'unbekannt',
          };
        });

      let ownerRoleName = null;
      let ownerHasRole = null;
      let ownerLiveIds = [];
      if (ownerRoleId) {
        const ownerRole = await getGuildRole(guild, ownerRoleId);
        if (ownerRole) {
          ownerRoleName = ownerRole.name;
          ownerLiveIds = [...members.values()].filter((member) => member.roles.cache.has(ownerRoleId)).map((member) => member.id);
        }
      }
      if (ownerId) {
        if (ownerRoleId && ownerRoleName) {
          const ownerMember = members.get(ownerId);
          ownerHasRole = ownerMember ? ownerMember.roles.cache.has(ownerRoleId) : null;
        } else {
          ownerHasRole = null;
        }
      }

      result.push({
        rank,
        roleId: roleId || null,
        roleName,
        liveIds,
        ownerRoleId: ownerRoleId || null,
        ownerRoleName,
        ownerLiveIds,
        ownerId: ownerId || null,
        ownerIgn: ownerId ? ignByDiscord.get(ownerId) || null : null,
        ownerHasRole,
        dbCount: dbIds.size,
        liveCount: liveIds.length,
        membersLimited,
        missing,
        extra,
      });
    }

    rankCheckCache = { at: Date.now(), data: result };
    return res.json(result);
  } catch (err) {
    rankCheckCache.errorAt = Date.now();
    logger.error(`[Discord-API] Rank-Check fehlgeschlagen: ${err.message}`);
    return res.status(500).json({ error: 'Rank-Check fehlgeschlagen.' });
  }
});

// POST /api/discord/sync-roles - Gleicht alle Discord-Rollen mit der DB ab.
// Entfernt dabei auch überflüssige Rollen (z.B. Reste nach DB-Wipe).
router.post('/sync-roles', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const client = getDiscordClient();
    if (!client) {
      return res.status(503).json({ error: 'Discord-Bot ist offline.' });
    }
    const result = await syncAllMembers(client);
    if (!result.ok) {
      return res.status(502).json({ error: result.error || 'Synchronisierung fehlgeschlagen.' });
    }
    // Rank-Check-Cache entwerten, damit der nächste Check frisch laeuft
    rankCheckCache = { at: 0, data: null, errorAt: 0 };
    membersCache = { at: 0, data: [] };
    return res.json(result);
  } catch (err) {
    logger.error(`[Discord-API] Rollen-Sync fehlgeschlagen: ${err.message}`);
    return res.status(500).json({ error: 'Rollen-Sync fehlgeschlagen.' });
  }
});

export default router;
