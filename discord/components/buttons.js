// Variable: Button-Interaktions-Router fuer Discord.
// Leitet Button-Klicks auf die jeweiligen Aktionen oder Modals weiter.

import { showVerifyModal, showTeamModal } from './modals.js';
import logger from '../../shared/logger.js';

/**
 * Behandelt Klicks auf Buttons in Panels.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleButtonInteraction(interaction, client) {
  const customId = interaction.customId;

  try {
    if (customId === 'btn_verify_start' || customId === 'modal_verify_retry') {
      await showVerifyModal(interaction);
    } else if (customId === 'btn_team_join') {
      await showTeamModal(interaction);
    } else {
      logger.warn(`[Discord] Unbekannter Button-Klick: ${customId}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Dieser Button wird nicht unterstuetzt.', ephemeral: true });
      }
    }
  } catch (err) {
    logger.error(`[Discord] Fehler bei Button-Interaktion (${customId}): ${err.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ein interner Fehler ist aufgetreten.', ephemeral: true });
    }
  }
}