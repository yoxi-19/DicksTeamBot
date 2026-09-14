// Variable: Modal-Dialoge und deren Auswertung.
// Verwaltet die Popups fuer die Eingabe des Minecraft-Namens bei Verifizierung und Team-Beitritt.

import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { startVerification } from '../verifyService.js';
import { requestJoin } from '../teamService.js';
import { buildEmbed, errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';

/**
 * Zeigt das Verifizierungs-Modal an.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function showVerifyModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_verify')
    .setTitle('Minecraft-Konto verbinden');

  const ignInput = new TextInputBuilder()
    .setCustomId('input_ign')
    .setLabel('Dein Minecraft-Name (IGN)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('z.B. Steve123')
    .setMinLength(3)
    .setMaxLength(16)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(ignInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * Zeigt das Team-Beitritts-Modal an.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function showTeamModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_team_join')
    .setTitle('Team beitreten');

  const ignInput = new TextInputBuilder()
    .setCustomId('input_ign')
    .setLabel('Bestaetige deinen Minecraft-Namen (IGN)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('z.B. Steve123')
    .setMinLength(3)
    .setMaxLength(16)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(ignInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * Verarbeitet die Rueckgabe des Verifizierungs-Modals.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleVerifyModalSubmit(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const ign = interaction.fields.getTextInputValue('input_ign');
  const result = await startVerification(client, interaction.guild, interaction.user.id, ign);

  if (!result.ok) {
    await interaction.editReply({
      embeds: [errorEmbed('Verifizierung fehlgeschlagen', result.error)],
    });
    return;
  }

  const botName = configService.env.minecraftUsername || 'WindBot';
  const embed = buildEmbed({
    title: '🔑 Dein Verifizierungs-Code',
    description:
      `Hallo <@${interaction.user.id}>!\n\n` +
      `Dein persoenlicher Code lautet:\n\n` +
      `# \`${result.code}\`\n\n` +
      `**Naechste Schritte:**\n` +
      `1. Oeffne Minecraft und verbinde dich mit DICKS.\n` +
      `2. Fuehre folgenden Befehl im Chat aus:\n` +
      `   \`/msg ${botName} ${result.code}\`\n\n` +
      `⏱️ *Dieser Code ist genau 5 Minuten gueltig.*`,
    color: 'primary',
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Verarbeitet die Rueckgabe des Team-Beitritts-Modals.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleTeamModalSubmit(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const ign = interaction.fields.getTextInputValue('input_ign');
  const result = await requestJoin(client, interaction.user.id, ign);

  if (!result.ok) {
    await interaction.editReply({
      embeds: [errorEmbed('Team-Beitritt fehlgeschlagen', result.error)],
    });
    return;
  }

  const embed = successEmbed(
    'Team-Einladung gesendet!',
    `Es wurde eine Team-Einladung fuer **${result.ign}** ausgeloest.\n\n` +
    `Bitte nimm die Einladung im Spiel an (` + '`/team accept`' + `), um den Prozess abzuschliessen!`,
  );

  await interaction.editReply({ embeds: [embed] });
}