// Variable: /team remove - Entfernt einen Spieler aus dem Team.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, grantRole, removeRole, syncNickname, sendLogEmbed } from '../helpers.js';
import { removeRankRoles, clearOwnerSlots } from '../teamService.js';
import * as db from '../../database/index.js';
import { PlayerStatus, LogCategory } from '../../shared/types.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team-remove')
    .setDescription('Entfernt einen Spieler aus dem Team.')
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
    const user = db.findUserByDiscord(targetUser.id);

    if (!user || user.status !== PlayerStatus.TEAM) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', 'Dieser Nutzer ist kein Team-Mitglied.')],
        ephemeral: true,
      });
      return;
    }

    db.upsertUser({
      discord_id: targetUser.id,
      status: PlayerStatus.VERIFIED,
    });

    const guild = interaction.guild;
    if (guild) {
      await removeRole(guild, targetUser.id, 'roleTeam');
      await removeRankRoles(guild, targetUser.id);
    }
    await clearOwnerSlots(interaction.client, targetUser.id);

    if (user.ign) {
      eventBus.emit('minecraft:sendCommand', `/team remove ${user.ign}`);
    }

    await sendLogEmbed(interaction.client, {
      category: LogCategory.TEAM,
      title: 'Team entfernt',
      description: `<@${targetUser.id}> wurde aus dem Team entfernt.`,
      color: 'warning',
    });

    eventBus.emitToDashboard('playerUpdate', db.listUsers());

    await interaction.reply({
      embeds: [successEmbed('Team entfernt', `<@${targetUser.id}> wurde aus dem Team entfernt.`)],
      ephemeral: true,
    });
  },
};
