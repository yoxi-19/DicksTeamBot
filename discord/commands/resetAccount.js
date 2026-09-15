// Variable: /reset - Setzt den eigenen Account zurueck.
// Erlaubt es Nutzern, sich selbst aus dem System zu entfernen und neu zu starten.

import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import * as db from '../../database/index.js';
import { PlayerStatus } from '../../shared/types.js';

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

    // Account zuruecksetzen
    db.unlinkUser(interaction.user.id);

    await interaction.reply({
      embeds: [successEmbed('Zurueckgesetzt', `Dein Account (**${user.ign}**) wurde entfernt. Du kannst jetzt neu verifizieren.`)],
      ephemeral: true,
    });
  },
};
