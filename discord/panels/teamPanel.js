// Variable: Team-Panel Embed und Buttons.
// Erstellt die interaktive Benutzeroberflaeche für /setup team.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import configService from '../../server/config.js';
import { hexToDecimal } from '../../shared/types.js';

/**
 * Erstellt die Embed-Nachricht für das Team-Panel.
 * @returns {EmbedBuilder}
 */
export function buildTeamPanelEmbed() {
  const colors = configService.getColors();
  const primaryColor = colors.primary || 'AEC6CF';

  return new EmbedBuilder()
    .setColor(hexToDecimal(primaryColor))
    .setTitle('⚔️ Team DICKS | Team-Beitritt')
    .setDescription(
      'Moechtest du dem offiziellen **Team DICKS** beitreten?\n\n' +
      '**Voraussetzungen:**\n' +
      '• Dein Discord-Konto muss bereits verifiziert sein.\n' +
      '• Du musst dich auf dem Minecraft-Server befinden.\n\n' +
      '**Ablauf:**\n' +
      '1. Klicke auf **"Team beitreten"**.\n' +
      '2. Verifiziere deinen Minecraft-Namen per Code in deiner DM mit dem Bot.\n' +
      '3. Starte die Zahlungsüberwachung und überweise die angezeigte Team-Gebühr.\n' +
      '4. Nach bestätigter Zahlung sendet der Bot automatisch `/team invite`.\n' +
      '5. Nimm die Einladung im Spiel an, um Team-Rolle und Nickname zu erhalten!',
    )
    .setFooter({ text: 'Team DICKS Bot • Team-Verwaltung' })
    .setTimestamp();
}

/**
 * Erstellt die ActionRow mit dem Beitritt-Button.
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function buildTeamPanelRow() {
  const button = new ButtonBuilder()
    .setCustomId('btn_team_join')
    .setLabel('Team beitreten')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder().addComponents(button);
}
