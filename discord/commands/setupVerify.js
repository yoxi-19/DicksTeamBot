// Variable: /setup verify - Erstellt das Verifizierungs-Panel.
// Admin-Befehl: Sendet das Embed mit Verbinden-Button in den konfigurierten Kanal.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { buildVerifyPanelEmbed, buildVerifyPanelRow } from '../panels/verifyPanel.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Erstellt das Verifizierungs-Panel im konfigurierten Kanal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Berechtigungspruefung
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren können diesen Befehl ausführen.')],
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', 'Dieser Befehl muss in einem Textkanal ausgefuehrt werden.')],
        ephemeral: true,
      });
      return;
    }

    try {
      const embed = buildVerifyPanelEmbed();
      const row = buildVerifyPanelRow();

      await channel.send({ embeds: [embed], components: [row] });

      await interaction.reply({
        embeds: [successEmbed('Panel erstellt', `Das Verifizierungs-Panel wurde in <#${channel.id}> gesendet.`)],
        ephemeral: true,
      });

      logger.info(`[Discord] Verifizierungs-Panel in ${channel.name} von ${interaction.user.tag} erstellt.`);
    } catch (err) {
      logger.error(`[Discord] Fehler beim Erstellen des Panels: ${err.message}`);
      await interaction.reply({
        embeds: [errorEmbed('Fehler', `Panel konnte nicht erstellt werden: ${err.message}`)],
        ephemeral: true,
      });
    }
  },
};