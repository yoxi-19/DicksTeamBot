// Variable: Verifizierungs-Panel Embed und Buttons.
// Erstellt die interaktive Benutzeroberflaeche für /setup verify.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import configService from '../../server/config.js';
import { hexToDecimal } from '../../shared/types.js';

/**
 * Erstellt die Embed-Nachricht für das Verifizierungs-Panel.
 * @returns {EmbedBuilder}
 */
export function buildVerifyPanelEmbed() {
  const colors = configService.getColors();
  const primaryColor = colors.primary || 'AEC6CF';
  const botName = configService.env.minecraftUsername || 'DicksBot';

  return new EmbedBuilder()
    .setColor(hexToDecimal(primaryColor))
    .setTitle('DICKS | Team-Beitritt')
    .setDescription(
      'Du willst ins Team? Alles läuft über deine **Direct Messages mit dem Bot** – schreibe nichts hier in den Kanal.\n\n' +
      '**So geht es:**\n' +
      '1. Klicke unten auf **Beitreten**.\n' +
      '2. Der Bot schreibt dich per **DM auf Discord** an – schicke ihm dort deinen Minecraft-Namen.\n' +
      '3. Du bekommst einen persönlichen Code per **DM** – gib ihn **im Spiel (Minecraft-Chat)** ein:\n' +
      '```\n' +
      `/msg ${botName} 123456\n` +
      '```\n' +
      '*(Beispiel – dein echter Code steht in der DM, nicht hier.)*\n' +
      '4. Bezahle die Team-Gebühr im Spiel.\n' +
      '5. Nimm die Team-Einladung im Spiel an.\n\n' +
      '**Bedrock-Spieler (Geyser):** Dein Name beginnt mit einem Punkt (.) – gib ihn exakt so **mit Punkt** an.',
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