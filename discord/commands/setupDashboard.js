// Variable: /setup dashboard - Sendet den Dashboard-Link.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-dashboard')
    .setDescription('Sendet den Link zum DICKS Dashboard.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const url = configService.env.dashboardUrl || 'http://localhost:5173';
    await interaction.reply({
      embeds: [
        successEmbed(
          'DICKS Dashboard',
          `Das Dashboard ist hier erreichbar:\n[${url}](${url})\n\nHier kannst du Einstellungen bearbeiten, Spieler verwalten und Logs einsehen.`,
        ),
      ],
      ephemeral: true,
    });
  },
};