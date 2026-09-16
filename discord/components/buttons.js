// Variable: Button-Interaktions-Router für Discord.
// Einheitlicher Flow: Button klicken -> DM für IGN -> Code im MC eingeben -> Verifizierung -> Payment -> Team

import { registerPendingDm } from './dmHandler.js';
import { buildPaymentConfirmedEmbed, buildPaymentInstructionEmbed, cancelRefund, handlePaymentButton, registerPendingPaymentConfirm, sendPaymentEmbed } from '../paymentService.js';
import { bridgeInstance } from '../../minecraft/bridge.js';
import { errorEmbed, successEmbed } from '../helpers.js';
import * as db from '../../database/index.js';
import { PlayerStatus } from '../../shared/types.js';
import configService from '../../server/config.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';

/**
 * Behandelt Klicks auf Buttons in Panels.
 */
export async function handleButtonInteraction(interaction, client) {
  const customId = interaction.customId;

  try {
    if (customId === 'btn_verify_start' || customId === 'modal_verify_retry') {
      await handleVerifyButton(interaction, client);
    } else if (customId === 'btn_verify_retry') {
      await handleVerifyRetryButton(interaction, client);
    } else if (customId === 'btn_team_join') {
      await handleTeamButton(interaction, client);
    } else if (customId === 'btn_team_invite_retry') {
      await handleTeamInviteRetryButton(interaction, client);
    } else if (customId === 'btn_payment_start' || customId === 'btn_payment_paid' || customId === 'btn_payment_retry') {
      await handlePaymentPaidButton(interaction, client);
    } else {
      logger.warn(`[Discord] Unbekannter Button-Klick: ${customId}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Dieser Button wird nicht unterstuetzt.', ephemeral: true });
      }
    }
  } catch (err) {
    logger.error(`[Discord] Fehler bei Button-Interaktion (${customId}): ${err.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ein interner Fehler ist aufgetreten.', ephemeral: true });
    }
  }
}

/**
 * Prüft ob ein User ein gültiger Vorgang hat (IGN gesetzt).
 * Korrigiert kaputte DB-Zustaende automatisch.
 */
function isValidUser(user) {
  return user && user.ign && user.ign.trim().length > 0;
}

/**
 * Verify-Button: Der Einstiegspunkt für ALLE Nutzer.
 */
async function handleVerifyButton(interaction, client) {
  const user = db.findUserByDiscord(interaction.user.id);

  // Bereits im Team (nur wenn IGN gesetzt)
  if (user && user.status === PlayerStatus.TEAM && isValidUser(user)) {
    await interaction.reply({
      embeds: [successEmbed('Bereits im Team', 'Du bist bereits im Team!')],
      ephemeral: true,
    });
    return;
  }

  // Team verlassen
  if (user && user.status === PlayerStatus.LEFT) {
    await interaction.reply({
      embeds: [errorEmbed('Team verlassen', 'Du hast das Team bereits verlassen. Bitte wende dich an einen Admin.')],
      ephemeral: true,
    });
    return;
  }

  // Team voll: keine neuen Vorgänge (laufende Zahlungen/Verifizierungen
  // duerfen trotzdem fortgesetzt werden und landen im normalen Ablauf).
  if ((!user || user.status === PlayerStatus.UNVERIFIED) && configService.get('team', {}).isFull) {
    await interaction.reply({
      embeds: [errorEmbed('Team ist voll', 'Aktuell können keine neuen Mitglieder aufgenommen werden. Versuch es später erneut.')],
      ephemeral: true,
    });
    return;
  }

  // Bereits verifiziert -> Zahlungsaufforderung in die DM senden.
  if (user && user.status === PlayerStatus.VERIFIED && isValidUser(user)) {
    await sendPaymentEmbed(client, interaction.user.id, user.ign);
    await interaction.reply({
      embeds: [successEmbed('Zahlungsaufforderung gesendet', 'Die Zahlung kann jetzt in deiner Unterhaltung mit dem Bot gestartet werden.')],
      ephemeral: true,
    });
    return;
  }

  // Zahlung ausstehend: Die laufende Änweisung direkt anzeigen, keine weitere DM erzeugen.
  if (user && user.status === PlayerStatus.WAITING_PAYMENT && isValidUser(user)) {
    const result = await handlePaymentButton(client, interaction.user.id, user.ign);
    await interaction.reply({
      embeds: [await buildPaymentInstructionEmbed(result.payment)],
      ephemeral: true,
    });
    return;
  }

  // Alles andere (UNVERIFIED, oder VERIFIED ohne IGN, oder new) -> DM-Flow starten
  if (!bridgeInstance || !bridgeInstance.isConnected) {
    await interaction.reply({
      embeds: [errorEmbed('Minecraft-Server offline', 'Der Bot ist gerade nicht auf dem Server. Bitte versuche es später erneut.')],
      ephemeral: true,
    });
    return;
  }

  const dm = await interaction.user.createDM();
  await dm.send({
    embeds: [{
      title: 'Verifizierung starten',
      description:
        `Hallo ${interaction.user}!\n\n` +
        `Um dem Team beizutreten, schreibe mir deinen **exakten Minecraft-Namen** (IGN) hier in die DM.\n`,
      color: 0xAEC6CF,
    }],
  });

  registerPendingDm(interaction.user.id, 'verify', interaction.guild);

  await interaction.reply({
    embeds: [successEmbed('DM gesendet', 'Schau in deine Direct Messages! Dort kannst du deinen Minecraft-Namen eingeben.')],
    ephemeral: true,
  });
}

/**
 * Team-Button: Führt den gleichen Status-Check aus wie Verify-Button.
 */
async function handleTeamButton(interaction, client) {
  const user = db.findUserByDiscord(interaction.user.id);

  if (user && user.status === PlayerStatus.TEAM && isValidUser(user)) {
    await interaction.reply({
      embeds: [successEmbed('Bereits im Team', 'Du bist bereits im Team!')],
      ephemeral: true,
    });
    return;
  }

  if (user && user.status === PlayerStatus.LEFT) {
    await interaction.reply({
      embeds: [errorEmbed('Team verlassen', 'Du hast das Team bereits verlassen. Bitte wende dich an einen Admin.')],
      ephemeral: true,
    });
    return;
  }

  // Team voll: keine neuen Vorgänge (laufende Vorgänge duerfen fortgesetzt werden).
  if ((!user || user.status === PlayerStatus.UNVERIFIED) && configService.get('team', {}).isFull) {
    await interaction.reply({
      embeds: [errorEmbed('Team ist voll', 'Aktuell können keine neuen Mitglieder aufgenommen werden. Versuch es später erneut.')],
      ephemeral: true,
    });
    return;
  }

  if (user && user.status === PlayerStatus.VERIFIED && isValidUser(user)) {
    await sendPaymentEmbed(client, interaction.user.id, user.ign);
    await interaction.reply({
      embeds: [successEmbed('Zahlungsaufforderung gesendet', 'Die Zahlung kann jetzt in deiner Unterhaltung mit dem Bot gestartet werden.')],
      ephemeral: true,
    });
    return;
  }

  if (user && user.status === PlayerStatus.WAITING_PAYMENT && isValidUser(user)) {
    const result = await handlePaymentButton(client, interaction.user.id, user.ign);
    await interaction.reply({
      embeds: [await buildPaymentInstructionEmbed(result.payment)],
      ephemeral: true,
    });
    return;
  }

  // Nicht verifiziert -> DM-Flow starten
  if (!bridgeInstance || !bridgeInstance.isConnected) {
    await interaction.reply({
      embeds: [errorEmbed('Minecraft-Server offline', 'Der Bot ist gerade nicht auf dem Server. Bitte versuche es später erneut.')],
      ephemeral: true,
    });
    return;
  }

  const dm = await interaction.user.createDM();
  await dm.send({
    embeds: [{
      title: 'Verifizierung starten',
      description:
        `Hallo ${interaction.user}!\n\n` +
        `Um dem Team beizutreten, schreibe mir deinen **exakten Minecraft-Namen** (IGN) hier in die DM.\n`,
      color: 0xAEC6CF,
    }],
  });

  registerPendingDm(interaction.user.id, 'verify', interaction.guild);

  await interaction.reply({
    embeds: [successEmbed('DM gesendet', 'Schau in deine Direct Messages! Dort kannst du deinen Minecraft-Namen eingeben.')],
    ephemeral: true,
  });
}

/**
 * Verify-Nochmal: startet den DM-Flow neu (nach fehlgeschlagener Verifizierung).
 * Ersetzt das Fehler-Embed direkt, keine neue Nachricht.
 */
async function handleVerifyRetryButton(interaction, client) {
  registerPendingDm(interaction.user.id, 'verify', interaction.guild);

  await interaction.update({
    embeds: [{
      title: 'Verifizierung starten',
      description: 'Schicke mir deinen **exakten Minecraft-Namen** (IGN) hier in den Chat.',
      color: 0xAEC6CF,
    }],
    components: [],
  });
}

/**
 * Team-Invite-Nochmal: sendet die Einladung im Spiel erneut.
 */
async function handleTeamInviteRetryButton(interaction, client) {
  const user = db.findUserByDiscord(interaction.user.id);

  if (!user || !isValidUser(user)) {
    await interaction.reply({
      embeds: [errorEmbed('Nicht verifiziert', 'Du musst zuerst verifiziert sein.')],
    });
    return;
  }

  if (user.status === PlayerStatus.TEAM) {
    await interaction.reply({
      embeds: [successEmbed('Bereits im Team', 'Du bist bereits im Team!')],
    });
    return;
  }

  eventBus.emit('minecraft:teamInvite', { ign: user.ign, discordId: interaction.user.id });

  // Prozess startet neu: alter Refund-Timer wird storniert, ein neuer
  // startet erst beim nächsten Invite-Fehler wieder.
  cancelRefund(interaction.user.id);

  // Prozess neu starten ab dem Normalzustand: exakt dasselbe Embed wie ohne
  // Fehler – per Update, ohne neue Nachricht. Die Server-Antwort (Erfolg
  // oder erneuter Fehler) kommt danach wie gewohnt.
  const payment = db.findLatestPayment(interaction.user.id);
  if (!payment) {
    await interaction.reply({
      embeds: [errorEmbed('Fehler', 'Keine Zahlung gefunden. Bitte starte den Vorgang neu über den Button im Server.')],
    });
    return;
  }

  registerPendingPaymentConfirm(
    client,
    { discord_id: interaction.user.id, ign: user.ign },
    payment,
    {
      alreadyAnnounced: true,
      // Die per Update umgewandelte Nachricht ist ab jetzt der
      // Normalzustand – spätere Fehler/Join löschen genau diese.
      channelId: interaction.channelId || null,
      messageId: interaction.message?.id || null,
    },
  );

  await interaction.update({
    embeds: [await buildPaymentConfirmedEmbed(payment)],
    components: [],
  });
}

/**
 * Payment-Button: startet die Überwachung und ersetzt das geklickte Embed
 * direkt durch die Zahlungsänweisung.
 */
async function handlePaymentPaidButton(interaction, client) {
  const user = db.findUserByDiscord(interaction.user.id);

  if (!user || !isValidUser(user) || user.status === PlayerStatus.UNVERIFIED) {
    await interaction.reply({
      embeds: [errorEmbed('Nicht verifiziert', 'Du musst zuerst verifiziert sein.')],
    });
    return;
  }

  if (user.status === PlayerStatus.TEAM) {
    await interaction.reply({
      embeds: [successEmbed('Bereits im Team', 'Du bist bereits im Team!')],
    });
    return;
  }

  const result = await handlePaymentButton(client, interaction.user.id, user.ign);

  if (!result.ok) {
    await interaction.reply({
      embeds: [errorEmbed('Fehler', result.error)],
    });
    return;
  }

  await interaction.update({
    embeds: [await buildPaymentInstructionEmbed(result.payment)],
    components: [],
  });
}
