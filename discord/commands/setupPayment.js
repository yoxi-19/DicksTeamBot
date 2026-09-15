// Variable: /setup payment - Zeigt oder aktualisiert Payment-Einstellungen.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-payment')
    .setDescription('Zeigt oder setzt die Payment-Einstellungen (Empfänger, Betrag).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('empfaenger')
        .setDescription('IGN des Empfängers (z.B. DicksTeamBank)')
        .setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('betrag')
        .setDescription('Erforderlicher Betrag in $ (z.B. 250000)')
        .setRequired(false)
        .setMinValue(0),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('timeout')
        .setDescription('Timeout in Minuten (Standard: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(60),
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [errorEmbed('Keine Berechtigung', 'Nur Administratoren.')],
        ephemeral: true,
      });
      return;
    }

    const empfaenger = interaction.options.getString('empfaenger');
    const betrag = interaction.options.getInteger('betrag');
    const timeout = interaction.options.getInteger('timeout');

    // Keine Optionen: Aktuelle Werte anzeigen
    if (!empfaenger && betrag === null && timeout === null) {
      const payment = configService.get('payment', {});
      const timeouts = configService.get('timeouts', {});
      const timeoutMin = Math.round((timeouts.paymentTimeoutMs || 600000) / 60000);

      await interaction.reply({
        embeds: [successEmbed(
          'Payment-Einstellungen',
          `**Empfänger:** \`${payment.recipient || 'DicksTeamBank'}\`\n` +
          `**Betrag:** \`$${(payment.amount || 250000).toLocaleString('de-DE')}\`\n` +
          `**Timeout:** \`${timeoutMin} Minuten\``,
        )],
        ephemeral: true,
      });
      return;
    }

    const updates = {};
    const lines = [];

    if (empfaenger) {
      updates.payment = { ...(configService.get('payment', {})), recipient: empfaenger };
      lines.push(`**Empfänger:** \`${empfaenger}\``);
    }
    if (betrag !== null) {
      updates.payment = { ...(updates.payment || configService.get('payment', {})), amount: betrag };
      lines.push(`**Betrag:** \`$${betrag.toLocaleString('de-DE')}\``);
    }
    if (timeout !== null) {
      updates.timeouts = { ...(configService.get('timeouts', {})), paymentTimeoutMs: timeout * 60000 };
      lines.push(`**Timeout:** \`${timeout} Minuten\``);
    }

    const result = configService.update(updates);
    if (!result.ok) {
      await interaction.reply({
        embeds: [errorEmbed('Fehler', result.errors.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed('Payment-Einstellungen aktualisiert', lines.join('\n'))],
      ephemeral: true,
    });
  },
};
