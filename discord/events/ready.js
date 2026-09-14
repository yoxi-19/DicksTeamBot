// Variable: Discord Ready-Event.
// Wird einmal ausgefuehrt, wenn der Bot erfolgreich eingeloggt ist.

import { Events, ActivityType } from 'discord.js';
import logger from '../../shared/logger.js';
import eventBus from '../../shared/events.js';

export default {
  name: Events.ClientReady,
  once: true,
  /**
   * @param {import('discord.js').Client} client
   * @param {import('../bot.js').DiscordBot} bot
   */
  execute(client, bot) {
    bot.isReady = true;
    logger.info(`[Discord] Bot eingeloggt als ${client.user.tag} (${client.user.id})`);

    // Status setzen
    client.user.setPresence({
      activities: [
        {
          name: 'DICKS',
          type: ActivityType.Watching,
        },
      ],
      status: 'online',
    });

    // Slash-Befehle registrieren
    registerCommands(client, bot).catch((err) => {
      logger.error(`[Discord] Fehler bei Befehlsregistrierung: ${err.message}`);
    });

    eventBus.emitToDashboard('statsUpdate', {
      discordOnline: true,
      discordTag: client.user.tag,
    });
  },
};

/**
 * Registriert alle Slash-Befehle beim Discord-API.
 */
async function registerCommands(client, bot) {
  const guildId = process.env.DISCORD_GUILD_ID;

  const commandsData = [];
  for (const [, command] of bot.commands) {
    commandsData.push(command.data.toJSON());
  }

  if (commandsData.length === 0) {
    logger.warn('[Discord] Keine Befehle zum Registrieren vorhanden.');
    return;
  }

  try {
    if (guildId) {
      // Guild-spezifisch (schneller, fuer Development)
      const guild = await client.guilds.fetch(guildId);
      await guild.commands.set(commandsData);
      logger.info(`[Discord] ${commandsData.length} Befehle fuer Guild ${guild.name} registriert.`);
    } else {
      // Global
      await client.application.commands.set(commandsData);
      logger.info(`[Discord] ${commandsData.length} globale Befehle registriert.`);
    }
  } catch (err) {
    logger.error(`[Discord] Befehlsregistrierung fehlgeschlagen: ${err.message}`);
  }
}