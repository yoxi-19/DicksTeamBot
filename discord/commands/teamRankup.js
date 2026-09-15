// Variable: /team rankup - Stuft ein Team-Mitglied einen Rang hoch (z.B. Team 5 -> Team 4).

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import { sanitizeIgn } from '../../shared/types.js';
import { findRankTarget, setUserRank, getRankConfig, getUserRank } from '../teamService.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team-rankup')
    .setDescription('Stuft ein Team-Mitglied einen Rang hoch (z.B. Team 5 -> Team 4).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

    const found = findRankTarget({ discordId: targetUser?.id || null, ign: cleanIgn });
    if (!found.ok) {
      await interaction.reply({ embeds: [errorEmbed('Fehler', found.error)], ephemeral: true });
      return;
    }

    const cfg = getRankConfig();
    const oldRank = getUserRank(found.user, cfg);
    if (oldRank <= 1) {
      await interaction.reply({
        embeds: [errorEmbed('Bereits oben', `**${found.user.ign}** ist bereits in Team **1** (höchster Rang).`)],
        ephemeral: true,
      });
      return;
    }

    const result = await setUserRank(interaction.client, found.user.discord_id, oldRank - 1, interaction.user.tag);
    if (!result.ok) {
      await interaction.reply({ embeds: [errorEmbed('Fehler', result.error)], ephemeral: true });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed('Rank up', `**${found.user.ign}** wurde von Team **${result.oldRank}** auf Team **${result.newRank}** hochgestuft.`)],
      ephemeral: true,
    });

    logger.info(`[Discord] Admin ${interaction.user.tag} hat ${found.user.ign} auf Team ${result.newRank} hochgestuft.`);
  },
};
