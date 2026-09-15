// Variable: Discord MessageCreate-Event.
// Behandelt DM-Nachrichten für Verifizierung und Team-Beitritt.

import { Events } from 'discord.js';
import { handleDmMessage } from '../components/dmHandler.js';
import logger from '../../shared/logger.js';

export default {
  name: Events.MessageCreate,
  once: false,
  /**
   * @param {import('discord.js').Message} message
   * @param {import('../bot.js').DiscordBot} bot
   */
  async execute(message, bot) {
    try {
      await handleDmMessage(message, bot.getClient());
    } catch (err) {
      logger.error(`[Discord] Fehler bei DM-Verarbeitung: ${err.message}`);
    }
  },
};
