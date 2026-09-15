// Variable: /team setteam - Setzt ein Team-Mitglied direkt auf einen Rang.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import { sanitizeIgn } from '../../shared/types.js';
import { findRankTarget, setUserRank, getRankConfig, getUserRank } from '../teamService.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team-setteam')
    .setDescription('Setzt ein Team-Mitglied direkt auf ein Team (Rang).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((opt) =>
      opt.setName('team').setDescription('Ziel-Team (1 = höchstes)').setRequired(true).setMinValue(1).setMaxValue(10),
    )
    .addUserOption((opt) =>
      opt.setName('nutzer').setDescription('Der Discord-Nutzer').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('ign').setDescription('Der Minecraft-Name').setRequired(false),
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
    const team = interaction.options.getInteger('team');
    if (!targetUser && !ignOption) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', 'Bitte gib entweder einen Nutzer oder einen Minecraft-Namen an.')],
        ephemeral: true,
      });
      return;
    }

    const cleanIgn = ignOption ? sanitizeIgn(ignOption) : null;
    if (ignOption && !cleanIgn) {
      await interaction.reply({
        embeds: [errorEmbed('Ungültiger Name', 'Der Minecraft-Name ist ungültig.')],
        ephemeral: true,
      });
      return;
    }

    const cfg = getRankConfig();
    if (team < 1 || team > cfg.count) {
      await interaction.reply({
        embeds: [errorEmbed('Ungültiges Team', `Es gibt aktuell **${cfg.count}** Teams. Waehle 1 bis ${cfg.count}.`)],
        ephemeral: true,
      });
      return;
    }

    const found = findRankTarget({ discordId: targetUser?.id || null, ign: cleanIgn });
    if (!found.ok) {
      await interaction.reply({ embeds: [errorEmbed('Fehler', found.error)], ephemeral: true });
      return;
    }

    const oldRank = getUserRank(found.user, cfg);
    if (oldRank === team) {
      await interaction.reply({
        embeds: [successEmbed('Keine Änderung', `**${found.user.ign}** ist bereits in Team **${team}**.`)],
        ephemeral: true,
      });
      return;
    }

    const result = await setUserRank(interaction.client, found.user.discord_id, team, interaction.user.tag);
    if (!result.ok) {
      await interaction.reply({ embeds: [errorEmbed('Fehler', result.error)], ephemeral: true });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed('Team gesetzt', `**${found.user.ign}** wurde von Team **${result.oldRank}** auf Team **${result.newRank}** gesetzt.`)],
      ephemeral: true,
    });

    logger.info(`[Discord] Admin ${interaction.user.tag} hat ${found.user.ign} auf Team ${result.newRank} gesetzt.`);
  },
};
