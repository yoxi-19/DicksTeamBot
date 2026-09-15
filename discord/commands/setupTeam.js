// Variable: /setup team - Erstellt das Team-Beitritts-Panel.
// Admin-Befehl: Sendet das Embed mit Team-Beitreten-Button.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { buildTeamPanelEmbed, buildTeamPanelRow } from '../panels/teamPanel.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-team')
    .setDescription('Erstellt das Team-Beitritts-Panel im konfigurierten Kanal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
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
      const embed = buildTeamPanelEmbed();
      const row = buildTeamPanelRow();

      await channel.send({ embeds: [embed], components: [row] });

      await interaction.reply({
        embeds: [successEmbed('Panel erstellt', `Das Team-Panel wurde in <#${channel.id}> gesendet.`)],
        ephemeral: true,
      });

      logger.info(`[Discord] Team-Panel in ${channel.name} von ${interaction.user.tag} erstellt.`);
    } catch (err) {
      logger.error(`[Discord] Fehler beim Erstellen des Team-Panels: ${err.message}`);
      await interaction.reply({
        embeds: [errorEmbed('Fehler', `Panel konnte nicht erstellt werden: ${err.message}`)],
        ephemeral: true,
      });
    }
  },
};