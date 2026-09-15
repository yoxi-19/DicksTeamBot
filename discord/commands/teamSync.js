// Variable: /team sync - Synchronisiert alle Team-Rollen basierend auf dem Datenbankstatus.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import { syncAllMembers } from '../teamService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team-sync')
    .setDescription('Synchronisiert alle Team-Rollen mit dem Datenbankstatus.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await syncAllMembers(interaction.client);
    if (!result.ok) {
      await interaction.editReply({
        embeds: [errorEmbed('Fehler', result.error || 'Synchronisierung fehlgeschlagen.')],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Synchronisierung abgeschlossen',
          `**${result.synced}** Nutzer synchronisiert${result.errors > 0 ? `, **${result.errors}** Fehler` : ''}.\n**${result.detectedOwners}** Owner aus Owner-Rollen erkannt.`,
        ),
      ],
    });
  },
};
