// Variable: /setup roles - Zeigt oder setzt die Discord-Rollen-IDs.

import { SlashCommandBuilder, PermissionFlagsBits, Role } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-roles')
    .setDescription('Zeigt oder setzt die Rollen fuer Verified, Team, Join und Admin.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt.setName('verified-rolle').setDescription('Rolle fuer verifizierte Spieler'),
    )
    .addRoleOption((opt) =>
      opt.setName('team-rolle').setDescription('Rolle fuer Team-Mitglieder'),
    )
    .addRoleOption((opt) =>
      opt.setName('join-rolle').setDescription('Rolle fuer neue Spieler'),
    )
    .addRoleOption((opt) =>
      opt.setName('admin-rolle').setDescription('Rolle fuer Administratoren'),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const verifiedRole = interaction.options.getRole('verified-rolle');
    const teamRole = interaction.options.getRole('team-rolle');
    const joinRole = interaction.options.getRole('join-rolle');
    const adminRole = interaction.options.getRole('admin-rolle');

    // Wenn keine Optionen angegeben: aktuellen Status anzeigen
    if (!verifiedRole && !teamRole && !joinRole && !adminRole) {
      const current = {
        Verified: configService.getRoleId('roleVerified'),
        Team: configService.getRoleId('roleTeam'),
        Join: configService.getRoleId('roleJoin'),
        Admin: configService.getRoleId('roleAdmin'),
      };
      const lines = Object.entries(current).map(([name, id]) =>
        id ? `**${name}:** <@&${id}>` : `**${name}:** Nicht gesetzt`,
      );
      await interaction.reply({
        embeds: [successEmbed('Aktuelle Rollen', lines.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    const updates = {};
    if (verifiedRole) updates.roleVerified = verifiedRole.id;
    if (teamRole) updates.roleTeam = teamRole.id;
    if (joinRole) updates.roleJoin = joinRole.id;
    if (adminRole) updates.roleAdmin = adminRole.id;

    const result = configService.update(updates);
    if (!result.ok) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', result.errors.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    const updated = Object.keys(updates)
      .map((k) => `**${k.replace('role', '')}:** <@&${updates[k]}>`)
      .join('\n');

    await interaction.reply({
      embeds: [successEmbed('Rollen aktualisiert', updated)],
      ephemeral: true,
    });
  },
};