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
  const botName = configService.env.minecraftUsername || 'DicksBot';

  return new EmbedBuilder()
    .setColor(hexToDecimal(primaryColor))
    .setTitle('DICKS | Konto-Verifizierung')
    .setDescription(
      'Willkommen auf dem offiziellen **DICKS** Discord-Server!\n\n' +
      'Um dem Team beizutreten, musst du deinen Minecraft-Account verknuepfen und die Team-Gebuehr bezahlen.\n\n' +
      '**So funktioniert es:**\n' +
      '1. Klicke unten auf **Beitreten**.\n' +
      '2. Schreib deinen Minecraft-Namen (IGN) in die DM.\n' +
      '3. Sende den Code im Spiel per DM an den Bot:\n' +
      '```\n' +
      `/msg ${botName} CODE\n` +
      '```\n' +
      '4. Bezahle die Team-Gebuehr im Spiel.\n' +
      '5. Nimm die Team-Einladung im Spiel an.\n\n' +
      '*Alles weitere passiert in deinen Direct Messages.*',
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
    .setLabel('Beitreten')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder().addComponents(button);
}