// Variable: Discord InteractionCreate-Event.
// Zentraler Dispatcher für alle Slash-Befehle, Buttons, Modals und Select Menus.

import { Events } from 'discord.js';
import logger from '../../shared/logger.js';
import { handleButtonInteraction } from '../components/buttons.js';
import { handleVerifyModalSubmit, handleTeamModalSubmit } from '../components/modals.js';

export default {
  name: Events.InteractionCreate,
  once: false,
  /**
   * @param {import('discord.js').Interaction} interaction
   * @param {import('../bot.js').DiscordBot} bot
   */
  async execute(interaction, bot) {
    // Slash-Befehle
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction, bot);
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction, bot.getClient());
      return;
    }

    // Modals
    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, bot.getClient());
      return;
    }

    // Select Menus
    if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
      await handleSelectMenu(interaction, bot.getClient());
      return;
    }
  },
};

/**
 * Verarbeitet Slash-Befehle.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('../bot.js').DiscordBot} bot
 */
async function handleChatInputCommand(interaction, bot) {
  const command = bot.commands.get(interaction.commandName);
  if (!command) {
    logger.warn(`[Discord] Unbekannter Befehl: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction, bot);
  } catch (err) {
    logger.error(`[Discord] Fehler bei Befehl /${interaction.commandName}: ${err.message}`);
    const reply = {
      content: 'Ein interner Fehler ist beim Ausführen dieses Befehls aufgetreten.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

/**
 * Verarbeitet Modal-Submissions.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleModalSubmit(interaction, client) {
  try {
    if (interaction.customId === 'modal_verify') {
      await handleVerifyModalSubmit(interaction, client);
    } else if (interaction.customId === 'modal_team_join') {
      await handleTeamModalSubmit(interaction, client);
    } else {
      logger.warn(`[Discord] Unbekanntes Modal: ${interaction.customId}`);
      await interaction.reply({ content: 'Unbekanntes Formular.', ephemeral: true });
    }
  } catch (err) {
    logger.error(`[Discord] Fehler bei Modal ${interaction.customId}: ${err.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Fehler beim Verarbeiten des Formulars.', ephemeral: true });
    }
  }
}

/**
 * Verarbeitet Select Menus.
 * @param {import('discord.js').StringSelectMenuInteraction|import('discord.js').RoleSelectMenuInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleSelectMenu(interaction, client) {
  logger.debug(`[Discord] Select Menu ${interaction.customId} von ${interaction.user.tag}`);
  // Für spätere Erweiterungen (z.B. Log-Filter, Config-Auswahl)
}