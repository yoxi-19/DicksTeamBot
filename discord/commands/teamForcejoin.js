// Variable: /team forcejoin - Fuegt einen Spieler direkt ins Team ein (Admin-Notfalltool).
// Setzt DB-Status, Rollen, Rang, Nickname und loggt alles – ohne dass der
// Spieler im Spiel beitreten muss. Danach funktionieren team-setteam & Co.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, syncNickname, grantRole, removeRole, sendLogEmbed, sendDm } from '../helpers.js';
import { sanitizeIgn } from '../../shared/types.js';
import * as db from '../../database/index.js';
import { PlayerStatus, LogCategory } from '../../shared/types.js';
import { getRankConfig, syncRankRoles } from '../teamService.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team-forcejoin')
    .setDescription('Fuegt einen Spieler direkt ins Team ein (ohne Spiel-Beitritt).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName('nutzer').setDescription('Der Discord-Nutzer').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('ign').setDescription('Minecraft-Name (Pflicht falls Nutzer nicht verlinkt)').setRequired(false),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('nutzer');
    const ignOption = interaction.options.getString('ign');
    const cleanIgnOption = ignOption ? sanitizeIgn(ignOption) : null;
    if (ignOption && !cleanIgnOption) {
      await interaction.reply({
        embeds: [errorEmbed('Ungueltiger Name', 'Der Minecraft-Name ist ungueltig.')],
        ephemeral: true,
      });
      return;
    }

    const existing = db.findUserByDiscord(targetUser.id);
    const ign = cleanIgnOption || existing?.ign;
    if (!ign) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', 'Der Nutzer ist nicht verlinkt – gib zusätzlich einen Minecraft-Namen (`ign`) an.')],
        ephemeral: true,
      });
      return;
    }

    if (existing && existing.status === PlayerStatus.TEAM) {
      await interaction.reply({
        embeds: [successEmbed('Bereits im Team', `**${existing.ign}** ist bereits im Team. Nutze \`team-setteam\` für Rangänderungen.`)],
        ephemeral: true,
      });
      return;
    }

    const startRank = getRankConfig().count;
    db.upsertUser({
      discord_id: targetUser.id,
      ign,
      status: PlayerStatus.TEAM,
      team: String(startRank),
      verified_at: new Date().toISOString(),
    });

    const guild = interaction.guild;
    if (guild) {
      await syncNickname(guild, targetUser.id, ign);
      await grantRole(guild, targetUser.id, 'roleTeam');
      await grantRole(guild, targetUser.id, 'roleVerified');
      await syncRankRoles(guild, targetUser.id, startRank);
      await removeRole(guild, targetUser.id, 'roleJoin');
    }

    await sendLogEmbed(interaction.client, {
      category: LogCategory.TEAM,
      title: 'Team-Forcejoin',
      description: `<@${targetUser.id}> (**${ign}**) wurde von ${interaction.user.tag} per Forcejoin in Team **${startRank}** gesetzt (ohne Spiel-Beitritt).`,
      color: 'warning',
    });

    await sendDm(interaction.client, targetUser.id, {
      embeds: [successEmbed('Team beigetreten', `Du wurdest von einem Admin direkt ins Team aufgenommen. Willkommen, **${ign}**! Du startest in Team **${startRank}**.`)],
    });

    eventBus.emitToDashboard('playerUpdate', db.listUsers());

    await interaction.reply({
      embeds: [successEmbed('Forcejoin', `**${ign}** ist jetzt im Team (Team **${startRank}**). Befehle wie \`team-setteam\` funktionieren ab sofort.`)],
      ephemeral: true,
    });

    logger.info(`[Discord] Admin ${interaction.user.tag} hat ${ign} per Forcejoin ins Team gesetzt.`);
  },
};
