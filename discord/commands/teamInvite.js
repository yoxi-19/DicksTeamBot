// Variable: /team invite - Sendet eine Team-Einladung an einen Spieler.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import eventBus from '../../shared/events.js';
import { sanitizeIgn } from '../../shared/types.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team-invite')
    .setDescription('Sendet eine Team-Einladung an einen Spieler im Spiel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('spieler').setDescription('Minecraft-Name des Spielers').setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const ign = sanitizeIgn(interaction.options.getString('spieler'));
    if (!ign) {
      await interaction.reply({
        embeds: [errorEmbed('Ungueltiger Name', 'Der Minecraft-Name ist ungueltig.')],
        ephemeral: true,
      });
      return;
    }

    eventBus.emit('minecraft:teamInvite', { ign, discordId: null, applicationId: null });

    await interaction.reply({
      embeds: [successEmbed('Einladung gesendet', `Die Team-Einladung fuer **${ign}** wurde im Spiel ausgeloest.`)],
      ephemeral: true,
    });

    logger.info(`[Discord] Admin ${interaction.user.tag} hat Team-Einladung fuer ${ign} gesendet.`);
  },
};