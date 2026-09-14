// Variable: /status - Zeigt den aktuellen Bot-Status.
// Zeigt Discord, Minecraft, Server- und Systeminformationen an.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, buildEmbed } from '../helpers.js';
import configService from '../../server/config.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import logger from '../../shared/logger.js';
import { formatDuration } from '../../shared/utils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Zeigt den aktuellen Status des TeamBots.'),

  async execute(interaction, bot) {
    const uptime = formatDuration(process.uptime() * 1000);
    const memUsage = process.memoryUsage();
    const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rss = (memUsage.rss / 1024 / 1024).toFixed(2);

    const mcStatus = bridgeInstance.getStatus();
    const discordOnline = bot.isReady;
    const discordTag = interaction.client.user?.tag || 'Unbekannt';

    const embed = buildEmbed({
      title: '🟢 Team DICKS - Status',
      color: 'success',
      fields: [
        { name: 'Discord', value: discordOnline ? `🟢 Online (${discordTag})` : '🔴 Offline', inline: true },
        { name: 'Minecraft', value: mcStatus.isOnline ? `🟢 Verbunden (${mcStatus.username})` : '🔴 Offline', inline: true },
        { name: 'Uptime', value: uptime, inline: true },
        { name: 'Minecraft-Spieler', value: `${mcStatus.playerCount} online`, inline: true },
        { name: 'Minecraft-Ping', value: `${mcStatus.ping}ms`, inline: true },
        { name: 'TPS (geschätzt)', value: `${mcStatus.tps}`, inline: true },
        { name: 'RAM (Heap)', value: `${heapUsed}MB / ${heapTotal}MB`, inline: true },
        { name: 'RAM (RSS)', value: `${rss}MB`, inline: true },
        { name: 'Node.js', value: process.version, inline: true },
      ],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};