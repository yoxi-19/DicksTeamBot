// Variable: /reload config - Laedt die Konfiguration neu.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('reload-config')
    .setDescription('Laedt die Bot-Konfiguration neu aus der Datenbank.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    try {
      configService.load();
      await interaction.reply({
        embeds: [successEmbed('Konfiguration neu geladen', 'Alle Einstellungen wurden aus der Datenbank neu geladen.')],
        ephemeral: true,
      });
      logger.info(`[Discord] Konfiguration neu geladen von ${interaction.user.tag}.`);
    } catch (err) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', `Konfiguration konnte nicht neu geladen werden: ${err.message}`)],
        ephemeral: true,
      });
    }
  },
};