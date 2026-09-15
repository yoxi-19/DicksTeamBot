// Variable: /setup config - Zeigt oder aktualisiert eine Einstellung.
// Erlaubt Admins, Einstellungen direkt über Discord zu ändern.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';
import { SETTING_KEYS } from '../../shared/types.js';
import { validateRegex } from '../../shared/types.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-config')
    .setDescription('Zeigt oder aktualisiert eine Bot-Einstellung.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('schluessel')
        .setDescription('Der Name der Einstellung')
        .setRequired(false)
        .addChoices(
          ...SETTING_KEYS.map((k) => ({ name: k, value: k })),
        ),
    )
    .addStringOption((opt) =>
      opt.setName('wert').setDescription('Der neue Wert (JSON-Format für komplexe Werte)'),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const key = interaction.options.getString('schluessel');
    const valueStr = interaction.options.getString('wert');

    // Keine Optionen: Alle Einstellungen anzeigen
    if (!key) {
      const allSettings = configService.getAll();
      const lines = [];
      for (const [k, v] of Object.entries(allSettings)) {
        const displayValue = typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : String(v);
        lines.push(`**${k}:** \`${displayValue}\``);
      }
      // Aufteilen falls zu lang
      const chunks = [];
      for (let i = 0; i < lines.length; i += 10) {
        chunks.push(lines.slice(i, i + 10).join('\n'));
      }

      for (let i = 0; i < chunks.length; i++) {
        const title = i === 0 ? 'Alle Einstellungen' : `Einstellungen (Fortsetzung ${i + 1})`;
        await interaction.reply({
          embeds: [successEmbed(title, chunks[i])],
          ephemeral: true,
        });
      }
      if (chunks.length === 0) {
        await interaction.reply({
          embeds: [errorEmbed('Keine Einstellungen', 'Es sind keine Einstellungen konfiguriert.')],
          ephemeral: true,
        });
      }
      return;
    }

    // Nur Key angegeben: aktuellen Wert anzeigen
    if (!valueStr) {
      const current = configService.get(key);
      const displayValue = typeof current === 'object' ? JSON.stringify(current, null, 2) : String(current);
      await interaction.reply({
        embeds: [successEmbed(`Einstellung: ${key}`, `\`\`\`${displayValue}\`\`\``)],
        ephemeral: true,
      });
      return;
    }

    // Key + Wert: aktualisieren
    let parsedValue;
    try {
      parsedValue = JSON.parse(valueStr);
    } catch {
      // Wenn kein JSON, als String verwenden
      parsedValue = valueStr;
    }

    const result = configService.update({ [key]: parsedValue });
    if (!result.ok) {
      await interaction.reply({
        embeds: [errorEmbed('Ungültiger Wert', result.errors.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    const displayValue = typeof parsedValue === 'object' ? JSON.stringify(parsedValue) : String(parsedValue);
    await interaction.reply({
      embeds: [successEmbed('Einstellung aktualisiert', `**${key}** wurde auf \`${displayValue}\` gesetzt.`)],
      ephemeral: true,
    });
  },
};