// Variable: /help - Zeigt eine Übersicht aller verfuegbaren Befehle.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { buildEmbed } from '../helpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Zeigt eine Übersicht aller verfuegbaren Befehle.'),

  async execute(interaction) {
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    const publicCommands = [
      { name: '/status', desc: 'Zeigt den aktuellen Bot-Status' },
      { name: '/help', desc: 'Diese Hilfe' },
    ];

    const adminCommands = [
      { name: '/setup-verify', desc: 'Erstellt das Verifizierungs-Panel' },
      { name: '/setup-team', desc: 'Erstellt das Team-Beitritts-Panel' },
      { name: '/setup-dashboard', desc: 'Sendet den Dashboard-Link' },
      { name: '/setup-logs', desc: 'Zeigt oder setzt den Log-Kanal' },
      { name: '/setup-roles', desc: 'Zeigt oder setzt die Rollen' },
      { name: '/setup-config', desc: 'Zeigt oder ändert Bot-Einstellungen' },
      { name: '/verify-user', desc: 'Verifizierung erzwingen oder entfernen' },
      { name: '/team-invite', desc: 'Team-Einladung im Spiel senden' },
      { name: '/team-remove', desc: 'Spieler aus dem Team entfernen' },
      { name: '/team-sync', desc: 'Alle Team-Rollen synchronisieren' },
      { name: '/team-rankup', desc: 'Mitglied einen Rang hochstufen' },
      { name: '/team-rankdown', desc: 'Mitglied einen Rang runterstufen' },
      { name: '/team-setteam', desc: 'Mitglied direkt auf ein Team setzen' },
      { name: '/team-setowner', desc: 'Owner eines Teams setzen/entfernen' },
      { name: '/player-info', desc: 'Spielerinformationen anzeigen' },
      { name: '/player-unlink', desc: 'Verknuepfung entfernen' },
      { name: '/setuppatterns', desc: 'Minecraft-Chat-Patterns anzeigen oder ändern' },
      { name: '/reload-config', desc: 'Konfiguration neu laden' },
      { name: '/status', desc: 'Bot-Status (detailliert)' },
    ];

    const publicLines = publicCommands.map((c) => `\`${c.name}\` - ${c.desc}`).join('\n');
    const adminLines = adminCommands.map((c) => `\`${c.name}\` - ${c.desc}`).join('\n');

    const fields = [
      { name: 'Oeffentliche Befehle', value: publicLines, inline: false },
    ];

    if (isAdmin) {
      fields.push({ name: 'Admin-Befehle', value: adminLines, inline: false });
    }

    const embed = buildEmbed({
      title: '📖 Team DICKS - Hilfe',
      description: 'Hier ist eine Übersicht aller verfuegbaren Befehle.',
      color: 'primary',
      fields,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};