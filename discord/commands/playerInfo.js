// Variable: /player info - Zeigt Informationen ueber einen Spieler.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, buildEmbed } from '../helpers.js';
import * as db from '../../database/index.js';
import { PlayerStatus } from '../../shared/types.js';
import { formatDate } from '../../shared/utils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('player-info')
    .setDescription('Zeigt Informationen ueber einen Spieler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName('nutzer').setDescription('Der Discord-Nutzer (optional)'),
    )
    .addStringOption((opt) =>
      opt.setName('ign').setDescription('Der Minecraft-Name (optional)'),
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
    const ignOption = interaction.options.getString('ign');

    let user = null;
    if (targetUser) {
      user = db.findUserByDiscord(targetUser.id);
    } else if (ignOption) {
      user = db.findUserByIgn(ignOption);
    } else {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', 'Bitte gib entweder einen Nutzer oder einen Minecraft-Namen an.')],
        ephemeral: true,
      });
      return;
    }

    if (!user) {
      await interaction.reply({
        embeds: [errorEmbed('Nicht gefunden', 'Kein Spieler mit diesen Daten gefunden.')],
        ephemeral: true,
      });
      return;
    }

    const statusMap = {
      [PlayerStatus.UNVERIFIED]: 'Nicht verifiziert',
      [PlayerStatus.VERIFIED]: 'Verifiziert',
      [PlayerStatus.WAITING_PAYMENT]: 'Zahlung ausstehend',
      [PlayerStatus.TEAM]: 'Team-Mitglied',
      [PlayerStatus.LEFT]: 'Ausgetreten',
    };

    const statusLabel = statusMap[user.status] || user.status;
    const onlineStatus = user.is_online ? '🟢 Online' : '🔴 Offline';

    const embed = buildEmbed({
      title: `Spieler: ${user.ign || 'Unbekannt'}`,
      color: user.status === PlayerStatus.TEAM ? 'success' : user.status === PlayerStatus.VERIFIED ? 'primary' : 'info',
      fields: [
        { name: 'Discord', value: user.discord_id ? `<@${user.discord_id}>` : 'Nicht verknuepft', inline: true },
        { name: 'IGN', value: user.ign || 'Nicht gesetzt', inline: true },
        { name: 'Status', value: statusLabel, inline: true },
        { name: 'Online', value: onlineStatus, inline: true },
        { name: 'Verifiziert am', value: user.verified_at ? formatDate(user.verified_at) : 'Nie', inline: true },
        { name: 'Erstellt', value: formatDate(user.created_at), inline: true },
      ],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
