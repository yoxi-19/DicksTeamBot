// Variable: /reset - Setzt den eigenen Account zurueck.
// Erlaubt es Nutzern, sich selbst aus dem System zu entfernen und neu zu starten.

import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import * as db from '../../database/index.js';
import { PlayerStatus } from '../../shared/types.js';
import { unlink } from '../verifyService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Setzt deinen Account zurueck. Du kannst danach neu verifizieren.'),

  async execute(interaction) {
    const user = db.findUserByDiscord(interaction.user.id);

    if (!user || !user.ign) {
      await interaction.reply({
        embeds: [errorEmbed('Nicht verknuepft', 'Du bist noch nicht im System. Klicke auf "Beitreten" im Server.')],
        ephemeral: true,
      });
      return;
    }

    if (user.status === PlayerStatus.TEAM) {
      await interaction.reply({
        embeds: [errorEmbed('Team-Mitglied', 'Du bist Team-Mitglied. Bitte wende dich an einen Admin, um dich zurueckzusetzen.')],
        ephemeral: true,
      });
      return;
    }

    // Account zuruecksetzen (inkl. Rollen, Nickname, Owner-Slots, Logs)
    const result = await unlink(interaction.client, interaction.user.id);
    if (!result.ok) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', result.message)],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed('Zurueckgesetzt', `${result.message} Du kannst jetzt neu verifizieren.`)],
      ephemeral: true,
    });
  },
};
