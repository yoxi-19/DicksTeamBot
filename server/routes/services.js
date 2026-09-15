import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import eventBus from '../../shared/events.js';
import logger from '../../shared/logger.js';

const router = Router();

let discordBot = null;
let bridgeInstance = null;

export function setInstances(discord, bridge) {
  discordBot = discord;
  bridgeInstance = bridge;
}

/**
 * Gibt den Discord-Client zurück (oder null wenn offline).
 * @returns {import('discord.js').Client|null}
 */
export function getDiscordClient() {
  return discordBot && typeof discordBot.getClient === 'function' ? discordBot.getClient() : null;
}

export function getStatus() {
  return {
    discord: {
      running: !!(discordBot && discordBot.getClient() && discordBot.isReady),
    },
    minecraft: {
      running: !!(bridgeInstance && bridgeInstance.isConnected),
      autoReconnect: !!(bridgeInstance && bridgeInstance.autoReconnect),
    },
  };
}

function emitStatusUpdate() {
  eventBus.emitToDashboard('servicesUpdate', getStatus());
}

router.get('/status', authenticateToken, requireAdmin, (req, res) => {
  return res.json(getStatus());
});

router.post('/discord/start', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (discordBot && discordBot.getClient() && discordBot.isReady) {
      return res.json({ ok: true, message: 'Discord-Bot laeuft bereits.' });
    }
    logger.info('[Services] Discord-Bot wird gestartet...');
    // Alte Instanz immer erst sauber beenden, damit nie zwei Clients mit
    // demselben Token gleichzeitig laufen (Session-Kills, 503er).
    try {
      if (discordBot) discordBot.stop();
    } catch {
      // Ignorieren
    }
    const { DiscordBot } = await import('../../discord/bot.js');
    discordBot = new DiscordBot();
    const started = await discordBot.start();
    if (!started) {
      return res.status(502).json({ error: 'Discord-Bot konnte nicht gestartet werden. Bitte Token und Discord-Status prüfen.' });
    }
    emitStatusUpdate();
    return res.json({ ok: true, message: 'Discord-Bot gestartet.' });
  } catch (err) {
    logger.error(`[Services] Discord-Start Fehler: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/discord/stop', authenticateToken, requireAdmin, (req, res) => {
  try {
    if (!discordBot || !discordBot.getClient()) {
      emitStatusUpdate();
      return res.json({ ok: true, message: 'Discord-Bot laeuft nicht.' });
    }
    discordBot.stop();
    logger.info('[Services] Discord-Bot gestoppt.');
    emitStatusUpdate();
    return res.json({ ok: true, message: 'Discord-Bot gestoppt.' });
  } catch (err) {
    logger.error(`[Services] Discord-Stop Fehler: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/minecraft/start', authenticateToken, requireAdmin, (req, res) => {
  try {
    if (bridgeInstance && bridgeInstance.isConnected) {
      return res.json({ ok: true, message: 'Minecraft-Bridge laeuft bereits.' });
    }
    logger.info('[Services] Minecraft-Bridge wird gestartet...');
    bridgeInstance.start();
    emitStatusUpdate();
    return res.json({ ok: true, message: 'Minecraft-Bridge gestartet.' });
  } catch (err) {
    logger.error(`[Services] MC-Start Fehler: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/minecraft/stop', authenticateToken, requireAdmin, (req, res) => {
  try {
    if (!bridgeInstance || !bridgeInstance.isConnected) {
      emitStatusUpdate();
      return res.json({ ok: true, message: 'Minecraft-Bridge laeuft nicht.' });
    }
    bridgeInstance.stop();
    logger.info('[Services] Minecraft-Bridge gestoppt.');
    emitStatusUpdate();
    return res.json({ ok: true, message: 'Minecraft-Bridge gestoppt.' });
  } catch (err) {
    logger.error(`[Services] MC-Stop Fehler: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/minecraft/reconnect', authenticateToken, requireAdmin, (req, res) => {
  try {
    if (!bridgeInstance) {
      return res.status(500).json({ error: 'Bridge nicht initialisiert.' });
    }
    bridgeInstance.autoReconnect = !bridgeInstance.autoReconnect;
    const status = bridgeInstance.autoReconnect ? 'aktiviert' : 'deaktiviert';
    logger.info(`[Services] Auto-Reconnect ${status}.`);
    emitStatusUpdate();
    return res.json({ ok: true, autoReconnect: bridgeInstance.autoReconnect, message: `Auto-Reconnect ${status}.` });
  } catch (err) {
    logger.error(`[Services] Reconnect-Toggle Fehler: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
