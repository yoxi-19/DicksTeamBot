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
 * Mit Wiederholung: Werden parallele Sessions/Session-Kills dazwischen,
 * wird es nach 30s und 60s erneut versucht statt still zu scheitern.
 */
async function registerCommands(client, bot, attempt = 1) {
  const MAX_ATTEMPTS = 3;
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
    if (!client.token || !client.isReady()) {
      throw new Error('Client-Session nicht bereit (parallele Anmeldung?)');
    }
    if (guildId) {
      // Guild-spezifisch (schneller, für Development)
      const guild = await client.guilds.fetch(guildId);
      await guild.commands.set(commandsData);
      logger.info(`[Discord] ${commandsData.length} Befehle für Guild ${guild.name} registriert.`);
    } else {
      // Global
      await client.application.commands.set(commandsData);
      logger.info(`[Discord] ${commandsData.length} globale Befehle registriert.`);
    }
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delayMs = attempt * 30000;
      logger.warn(`[Discord] Befehlsregistrierung fehlgeschlagen (Versuch ${attempt}/${MAX_ATTEMPTS}), neuer Versuch in ${delayMs / 1000}s: ${err.message}`);
      setTimeout(() => {
        registerCommands(client, bot, attempt + 1).catch((retryErr) => {
          logger.error(`[Discord] Fehler bei Befehlsregistrierung: ${retryErr.message}`);
        });
      }, delayMs);
    } else {
      logger.error(`[Discord] Befehlsregistrierung fehlgeschlagen: ${err.message}`);
    }
  }
}