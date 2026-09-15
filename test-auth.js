// Test-Skript: Microsoft Auth für mineflayer testen.
// Führe aus mit: node test-auth.js

import mineflayer from 'mineflayer';

console.log('Starte Microsoft-Auth Test...');
console.log('Wenn ein Browser-Fenster öffnet: Einloggen mit dem Minecraft-Account.');

const bot = mineflayer.createBot({
  host: 'windsmp.net',
  port: 25565,
  username: 'LudwigHolstein',
  auth: 'minecraft',
  profilesFolder: './mineflayer',
  hideErrors: false,
  onMsaCode: (code) => {
    console.log('');
    console.log('========================================');
    console.log('  Microsoft Auth erforderlich!');
    console.log('========================================');
    console.log(`Öffne: ${code.verificationUri}`);
    console.log(`Code:   ${code.userCode}`);
    console.log(`Gültig für: ${code.expiresIn}s`);
    console.log('');
    console.log(`Link direkt: ${code.verificationUri}?user_code=${code.userCode}`);
    console.log('========================================');
    console.log('');
  },
});

bot.on('login', () => {
  console.log(`Erfolgreich eingeloggt als ${bot.username}!`);
  bot.quit();
  process.exit(0);
});

bot.on('spawn', () => {
  console.log('Bot gespawnt!');
});

bot.on('kicked', (reason) => {
  console.log('Gekickt:', reason);
});

bot.on('error', (err) => {
  console.log('Error:', err.message);
});

// Timeout nach 120 Sekunden
setTimeout(() => {
  console.log('Timeout - Bot wird beendet.');
  bot.quit();
  process.exit(1);
}, 120000);
