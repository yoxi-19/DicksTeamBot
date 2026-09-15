// Variable: /setup logs - Sendet den Logs-Kanal-Status oder setzt ihn.

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-logs')
    .setDescription('Zeigt oder setzt die Log-Kanaele.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName('logs-kanal')
        .setDescription('Kanal fuer Verify/Team/System Logs')
        .addChannelTypes(ChannelType.GuildText),
    )
    .addChannelOption((opt) =>
      opt
        .setName('join-kanal')
        .setDescription('Kanal fuer Join/Leave-Transkripte')
        .addChannelTypes(ChannelType.GuildText),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const logsChannel = interaction.options.getChannel('logs-kanal');
    const joinChannel = interaction.options.getChannel('join-kanal');

    // Nur anzeigen
    if (!logsChannel && !joinChannel) {
      const currentLogs = configService.getChannelId('channelLogs');
      const currentJoin = configService.getChannelId('channelJoinLogs');
      const lines = [];
      lines.push(currentLogs ? `**Verify/Team/System:** <#${currentLogs}>` : '**Verify/Team/System:** nicht gesetzt');
      lines.push(currentJoin ? `**Join/Leave:** <#${currentJoin}>` : '**Join/Leave:** nicht gesetzt');

      await interaction.reply({
        embeds: [successEmbed('Aktuelle Log-Kanaele', lines.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    const updates = {};
    const set = [];

    if (logsChannel) {
      updates.channelLogs = logsChannel.id;
      set.push(`Verify/Team/System → <#${logsChannel.id}>`);
    }
    if (joinChannel) {
      updates.channelJoinLogs = joinChannel.id;
      set.push(`Join/Leave → <#${joinChannel.id}>`);
    }

    const result = configService.update(updates);
    if (!result.ok) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', result.errors.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed('Log-Kanaele aktualisiert', set.join('\n'))],
      ephemeral: true,
    });
  },
};
