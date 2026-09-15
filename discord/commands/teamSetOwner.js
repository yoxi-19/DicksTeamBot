// Variable: /team setowner - Setzt den Owner eines Teams (inkl. Extra-Rolle).
// Ohne Nutzer/IGN wird der Owner-Slot geleert.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import { sanitizeIgn } from '../../shared/types.js';
import * as db from '../../database/index.js';
import { setTeamOwner, getRankConfig } from '../teamService.js';
import logger from '../../shared/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('team-setowner')
    .setDescription('Setzt den Owner eines Teams (ohne Nutzer zum Leeren).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((opt) =>
      opt.setName('team').setDescription('Team (1 = hoechstes)').setRequired(true).setMinValue(1).setMaxValue(10),
    )
    .addUserOption((opt) =>
      opt.setName('nutzer').setDescription('Der Discord-Nutzer (leer = Slot leeren)').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('ign').setDescription('Der Minecraft-Name (leer = Slot leeren)').setRequired(false),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const team = interaction.options.getInteger('team');
    const cfg = getRankConfig();
    if (team < 1 || team > cfg.count) {
      await interaction.reply({
        embeds: [errorEmbed('Ungueltiges Team', `Es gibt aktuell **${cfg.count}** Teams. Waehle 1 bis ${cfg.count}.`)],
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('nutzer');
    const ignOption = interaction.options.getString('ign');

    let discordId = null;
    if (targetUser) {
      discordId = targetUser.id;
    } else if (ignOption) {
      const cleanIgn = sanitizeIgn(ignOption);
      if (!cleanIgn) {
        await interaction.reply({
          embeds: [errorEmbed('Ungueltiger Name', 'Der Minecraft-Name ist ungueltig.')],
          ephemeral: true,
        });
        return;
      }
      const user = db.findUserByIgn(cleanIgn);
      if (!user?.discord_id) {
        await interaction.reply({
          embeds: [errorEmbed('Fehler', 'Spieler nicht gefunden oder nicht verlinkt.')],
          ephemeral: true,
        });
        return;
      }
      discordId = user.discord_id;
    }

    const result = await setTeamOwner(interaction.client, team, discordId, interaction.user.tag);
    if (!result.ok) {
      await interaction.reply({ embeds: [errorEmbed('Fehler', result.error)], ephemeral: true });
      return;
    }

    if (!discordId) {
      await interaction.reply({
        embeds: [successEmbed('Owner entfernt', `Team **${team}** hat keinen Owner mehr.`)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        embeds: [successEmbed('Owner gesetzt', `**${result.owner.ign}** ist jetzt Owner von Team **${team}**.`)],
        ephemeral: true,
      });
    }

    logger.info(`[Discord] Admin ${interaction.user.tag} hat Owner von Team ${team} gesetzt/entfernt.`);
  },
};
