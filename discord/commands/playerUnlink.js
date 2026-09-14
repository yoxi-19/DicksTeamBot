// Variable: /player unlink - Entfernt die Verknuepfung eines Spielers.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import { unlink } from '../verifyService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('player-unlink')
    .setDescription('Entfernt die Verknuepfung eines Discord-Nutzers mit einem Minecraft-Konto.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName('nutzer').setDescription('Der Discord-Nutzer').setRequired(true),
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
    const result = await unlink(interaction.client, targetUser.id);

    if (result.ok) {
      await interaction.reply({
        embeds: [successEmbed('Verknuepfung entfernt', result.message)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', result.message)],
        ephemeral: true,
      });
    }
  },
};