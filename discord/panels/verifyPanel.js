// Variable: Verifizierungs-Panel Embed und Buttons.
// Erstellt die interaktive Benutzeroberflaeche fuer /setup verify.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import configService from '../../server/config.js';
import { hexToDecimal } from '../../shared/types.js';

/**
 * Erstellt die Embed-Nachricht fuer das Verifizierungs-Panel.
 * @returns {EmbedBuilder}
 */
export function buildVerifyPanelEmbed() {
  const colors = configService.getColors();
  const primaryColor = colors.primary || 'AEC6CF';

  return new EmbedBuilder()
    .setColor(hexToDecimal(primaryColor))
    .setTitle('🔐 DICKS | Konto-Verifizierung')
    .setDescription(
      'Willkommen auf dem offiziellen **DICKS** Discord-Server!\n\n' +
      'Um Zugriff auf alle Kanaele zu erhalten und deine Team-Funktionen freizuschalten, ' +
      'musst du dein Discord-Konto mit deinem Minecraft-Konto verbinden.\n\n' +
      '**So funktioniert es:**\n' +
      '1. Klicke unten auf den Button **"Verbinden"**.\n' +
      '2. Gib deinen exakten Minecraft-Namen (IGN) ein.\n' +
      '3. Du erhaeltst einen 6-stelligen Code (gueltig fuer 5 Minuten).\n' +
      '4. Verbinde dich mit dem Minecraft-Server und schreibe im Chat:\n' +
      '   `/msg WindBot <DEIN_CODE>`\n\n' +
      '*Dein Discord-Nickname wird automatisch an deinen Spielernamen angepasst.*',
    )
    .setFooter({ text: 'Team DICKS Bot • Automatische Verifizierung' })
    .setTimestamp();
}

/**
 * Erstellt die ActionRow mit dem Verbinden-Button.
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function buildVerifyPanelRow() {
  const button = new ButtonBuilder()
    .setCustomId('btn_verify_start')
    .setLabel('Verbinden')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🔗');

  return new ActionRowBuilder().addComponents(button);
}