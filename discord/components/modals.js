// Variable: Modal-Dialoge und deren Auswertung.
// Verwaltet die Popups für die Eingabe des Minecraft-Namens bei Verifizierung und Team-Beitritt.

import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { startVerification } from '../verifyService.js';
import { requestJoin } from '../teamService.js';
import { buildEmbed, errorEmbed, successEmbed } from '../helpers.js';
import configService from '../../server/config.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import { updateCodeMessageId } from '../../database/index.js';

/**
 * Zeigt das Verifizierungs-Modal an.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function showVerifyModal(interaction) {
  if (!bridgeInstance || !bridgeInstance.isConnected) {
    await interaction.reply({
      embeds: [errorEmbed(
        'Minecraft-Server offline',
        'Der Bot ist gerade nicht auf dem Minecraft-Server. Bitte versuche es später erneut.',
      )],
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('modal_verify')
    .setTitle('Minecraft-Konto verbinden');

  const ignInput = new TextInputBuilder()
    .setCustomId('input_ign')
    .setLabel('Dein Minecraft-Name (IGN)')
    .setStyle(TextInputStyle.Short)
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
  if (!bridgeInstance || !bridgeInstance.isConnected) {
    await interaction.reply({
      embeds: [errorEmbed(
        'Minecraft-Server offline',
        'Der Bot ist gerade nicht auf dem Minecraft-Server. Bitte versuche es später erneut.',
      )],
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('modal_team_join')
    .setTitle('Team beitreten');

  const ignInput = new TextInputBuilder()
    .setCustomId('input_ign')
    .setLabel('Bestätige deinen Minecraft-Namen (IGN)')
    .setStyle(TextInputStyle.Short)
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

  const ign = interaction.fields.getTextInputValue('input_ign').trim();
  const result = await startVerification(client, interaction.guild, interaction.user.id, ign);

  if (!result.ok) {
    await interaction.editReply({
      embeds: [errorEmbed('Verifizierung fehlgeschlagen', result.error)],
    });
    return;
  }

  const botName = configService.env.minecraftUsername || 'DicksBot';
  const embed = buildEmbed({
    title: 'Dein Verifizierungs-Code',
    description:
      `Hallo <@${interaction.user.id}>!\n\n` +
      `Öffne Minecraft, verbinde dich mit dem Server und führe diesen Befehl aus:\n\n` +
      '```\n' +
      `/msg ${botName} ${result.code}\n` +
      '```\n' +
      `Gültig für 5 Minuten.`,
    color: 'primary',
  });

  const reply = await interaction.editReply({ embeds: [embed] });

  // Message-ID speichern damit die Bridge diese später bearbeiten kann
  if (reply && reply.id && result.record) {
    updateCodeMessageId(result.record.id, reply.id);
  }
}

/**
 * Verarbeitet die Rueckgabe des Team-Beitritts-Modals.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleTeamModalSubmit(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const ign = interaction.fields.getTextInputValue('input_ign').trim();
  const result = await requestJoin(client, interaction.user.id, ign);

  if (!result.ok) {
    await interaction.editReply({
      embeds: [errorEmbed('Team-Beitritt fehlgeschlagen', result.error)],
    });
    return;
  }

  const embed = successEmbed(
    'Team-Einladung gesendet!',
    `Es wurde eine Team-Einladung für **${result.ign}** ausgeloest.\n\n` +
    `Bitte nimm die Einladung im Spiel an (` + '`/team accept`' + `), um den Prozess abzuschliessen!`,
  );

  await interaction.editReply({ embeds: [embed] });
}