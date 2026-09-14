// Variable: /verify user - Erzwingt Verifizierung oder entfernt Verknuepfung fuer einen Nutzer.
// Admin-Befehl mit Sub-Commands: force-unlink

import { SlashCommandBuilder, PermissionFlagsBits, User } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import { forceVerify, unlink } from '../verifyService.js';
import * as db from '../../database/index.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verify-user')
    .setDescription('Verwaltet die Verifizierung eines Discord-Nutzers.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName('nutzer').setDescription('Der Discord-Nutzer').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('aktion')
        .setDescription('Aktion: verify oder unlink')
        .setRequired(true)
        .addChoices(
          { name: 'verify (erzwingen)', value: 'verify' },
          { name: 'unlink (Verknuepfung entfernen)', value: 'unlink' },
        ),
    )
    .addStringOption((opt) =>
      opt.setName('minecraft-name').setDescription('Minecraft-Name (nur bei verify noetig)'),
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
    const action = interaction.options.getString('aktion');
    const ign = interaction.options.getString('minecraft-name');

    await interaction.deferReply({ ephemeral: true });

    if (action === 'unlink') {
      const result = await unlink(interaction.client, targetUser.id);
      if (result.ok) {
        await interaction.editReply({
          embeds: [successEmbed('Verknuepfung entfernt', `Die Verknuepfung von <@${targetUser.id}> wurde entfernt.`)],
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Fehler', result.message)],
        });
      }
      return;
    }

    // verify (erzwingen)
    if (!ign) {
      await interaction.editReply({
        embeds: [errorEmbed('Fehler', 'Bei der erzwungenen Verifizierung muss ein Minecraft-Name angegeben werden.')],
      });
      return;
    }

    const result = await forceVerify(interaction.client, targetUser.id, ign);
    if (result.ok) {
      await interaction.editReply({
        embeds: [successEmbed('Verifizierung erzwungen', `<@${targetUser.id}> wurde als **${ign}** verifiziert.`)],
      });
    } else {
      await interaction.editReply({
        embeds: [errorEmbed('Fehler', result.message)],
      });
    }
  },
};