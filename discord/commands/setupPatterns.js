import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';
import { DEFAULT_SETTINGS } from '../../shared/types.js';

const PATTERN_KEYS = Object.keys(DEFAULT_SETTINGS.patterns);

export default {
  data: new SlashCommandBuilder()
    .setName('setuppatterns')
    .setDescription('Minecraft-Chat-Patterns anzeigen, aendern oder zuruecksetzen.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('pattern')
        .setDescription('Welches Pattern aendern?')
        .setRequired(false)
        .addChoices(...PATTERN_KEYS.map((k) => ({ name: k, value: k }))),
    )
    .addStringOption((opt) =>
      opt
        .setName('regex')
        .setDescription('Neuer Regex (z.B. ^Command:\\s*/([\\w]+))')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('zuruecksetzen')
        .setDescription('Alle Patterns auf Standard zuruecksetzen?')
        .setRequired(false)
        .addChoices({ name: 'Ja', value: 'ja' }),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const patternKey = interaction.options.getString('pattern');
    const regexStr = interaction.options.getString('regex');
    const reset = interaction.options.getString('zuruecksetzen');

    // Keine Optionen: Alle Patterns anzeigen
    if (!patternKey && !regexStr && !reset) {
      const current = configService.get('patterns', {});
      const lines = PATTERN_KEYS.map((k) => {
        const val = current[k] || DEFAULT_SETTINGS.patterns[k];
        return `**${k}**\n\`${val}\``;
      });

      for (let i = 0; i < lines.length; i += 4) {
        const chunk = lines.slice(i, i + 4).join('\n\n');
        await interaction.reply({
          embeds: [successEmbed(
            i === 0 ? 'Chat-Patterns' : `Patterns (Fortsetzung ${Math.floor(i / 4) + 1})`,
            chunk + '\n\n*Ändern mit: `/setuppatterns pattern:PATTERN regex:REGEX`*',
          )],
          ephemeral: true,
        });
      }
      return;
    }

    // Zuruecksetzen
    if (reset === 'ja') {
      const result = configService.update({ patterns: DEFAULT_SETTINGS.patterns });
      if (!result.ok) {
        await interaction.reply({
          embeds: [errorEmbed('Fehler', result.errors.join('\n'))],
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        embeds: [successEmbed('Zurueckgesetzt', 'Alle Patterns wurden auf die Standardwerte zurueckgesetzt.')],
        ephemeral: true,
      });
      return;
    }

    // Pattern setzen
    if (patternKey && regexStr) {
      const error = validateRegexSource(regexStr);
      if (error) {
        await interaction.reply({
          embeds: [errorEmbed('Ungueltiger Regex', error)],
          ephemeral: true,
        });
        return;
      }

      const current = configService.get('patterns', {});
      const updated = { ...current, [patternKey]: regexStr };
      const result = configService.update({ patterns: updated });
      if (!result.ok) {
        await interaction.reply({
          embeds: [errorEmbed('Fehler', result.errors.join('\n'))],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        embeds: [successEmbed(
          'Pattern aktualisiert',
          `**${patternKey}** gesetzt auf:\n\`${regexStr}\`\n\nÄnderung ist sofort aktiv.`,
        )],
        ephemeral: true,
      });
      return;
    }

    // Nur Pattern angegeben: aktuellen Wert anzeigen
    if (patternKey && !regexStr) {
      const current = configService.get('patterns', {});
      const val = current[patternKey] || DEFAULT_SETTINGS.patterns[patternKey];
      await interaction.reply({
        embeds: [successEmbed(
          `Pattern: ${patternKey}`,
          `\`${val}\`\n\nÄndern mit: \`/setuppatterns pattern:${patternKey} regex:NEUER_REGEX\``,
        )],
        ephemeral: true,
      });
      return;
    }

    // Nur regex ohne pattern: Fehler
    await interaction.reply({
      embeds: [errorEmbed('Fehlende Angaben', 'Gib ein `pattern` UND einen `regex` an, oder nutze `/setuppatterns` zum Anzeigen.')],
      ephemeral: true,
    });
  },
};

function validateRegexSource(source) {
  try {
    new RegExp(source);
    return null;
  } catch (err) {
    return err.message;
  }
}
