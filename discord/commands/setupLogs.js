// Variable: /setup logs - Sendet den Logs-Kanal-Status oder setzt ihn.

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-logs')
    .setDescription('Zeigt oder setzt den Log-Kanal fuer Bot-Events.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName('kanal')
        .setDescription('Der Kanal fuer Logs (optional, wenn leer则Zeige aktuellen Kanal)')
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

    const channel = interaction.options.getChannel('kanal');
    const currentLogChannel = configService.getChannelId('channelLogs');

    if (!channel) {
      if (currentLogChannel) {
        await interaction.reply({
          embeds: [successEmbed('Aktueller Log-Kanal', `Der Log-Kanal ist: <#${currentLogChannel}>`)],
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          embeds: [errorEmbed('Kein Log-Kanal', 'Es ist noch kein Log-Kanal konfiguriert. Gib einen Kanal als Option an.')],
          ephemeral: true,
        });
      }
      return;
    }

    const result = configService.update({ channelLogs: channel.id });
    if (!result.ok) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', result.errors.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed('Log-Kanal gesetzt', `Der Log-Kanal wurde auf <#${channel.id}> gesetzt.`)],
      ephemeral: true,
    });
  },
};