// Variable: /team sync - Synchronisiert alle Team-Rollen basierend auf dem Datenbankstatus.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, grantRole, removeRole } from '../helpers.js';
import * as db from '../../database/index.js';
import { PlayerStatus } from '../../shared/types.js';
import logger from '../../shared/logger.js';

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

    const guild = interaction.guild;
    const users = db.listUsers();
    let synced = 0;
    let errors = 0;

    for (const user of users) {
      if (!user.discord_id) continue;

      try {
        if (user.status === PlayerStatus.TEAM) {
          await grantRole(guild, user.discord_id, 'roleTeam');
          await removeRole(guild, user.discord_id, 'roleJoin');
        } else if (user.status === PlayerStatus.VERIFIED) {
          await grantRole(guild, user.discord_id, 'roleVerified');
          await removeRole(guild, user.discord_id, 'roleTeam');
          await removeRole(guild, user.discord_id, 'roleJoin');
        }
        synced++;
      } catch (err) {
        logger.error(`[Discord] Sync-Fehler fuer ${user.discord_id}: ${err.message}`);
        errors++;
      }
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Synchronisierung abgeschlossen',
          `**${synced}** Nutzer synchronisiert${errors > 0 ? `, **${errors}** Fehler` : ''}.`,
        ),
      ],
    });
  },
};