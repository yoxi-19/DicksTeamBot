// Variable: gemeinsam genutzte Typen, Konstanten und Hilfsfunktionen.
// Wird von Discord, Minecraft und dem Server verwendet.

/**
 * Kategorie einer Chat-Nachricht fuer das Dashboard.
 * @readonly
 * @enum {string}
 */
export const MessageCategory = Object.freeze({
  CHAT: 'chat',
  SYSTEM: 'system',
  PAYMENT: 'payment',
  AUCTION: 'auction',
  COMMAND: 'command',
  ERROR: 'error',
  JOIN_LEAVE: 'joinLeave',
  PRIVATE: 'private',
  OTHER: 'other',
});

/**
 * Status eines Spielers im System.
 * @readonly
 * @enum {string}
 */
export const PlayerStatus = Object.freeze({
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
  TEAM: 'team',
  LEFT: 'left',
});

/**
 * Status einer Team-Bewerbung (Join Request).
 * @readonly
 * @enum {string}
 */
export const ApplicationStatus = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

/**
 * Kategorie eines Log-Eintrags.
 * @readonly
 * @enum {string}
 */
export const LogCategory = Object.freeze({
  VERIFY: 'verify',
  TEAM: 'team',
  PAYMENT: 'payment',
  SYSTEM: 'system',
  ERROR: 'error',
  COMMAND: 'command',
});

/**
 * Standard-Konfigurationswerte (werden beim ersten Start in die DB geschrieben).
 * Alle Werte koennen spaeter ueber das Dashboard oder das config-System geaendert werden.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  // Discord-Rollen-IDs (leer = deaktiviert)
  roleVerified: '',
  roleTeam: '',
  roleJoin: '',
  roleAdmin: '',

  // Discord-Channel-IDs
  channelLogs: '',
  channelVerify: '',
  channelTeam: '',

  // Farben (Hex, ohne '#')
  colors: {
    primary: 'AEC6CF',
    secondary: '6A93B0',
    success: '57F287',
    error: 'ED4245',
    warning: 'FEE75C',
    info: '5865F2',
  },

  // Verifizierungs-Einstellungen
  verify: {
    // Gueltigkeitsdauer des Codes in Millisekunden (5 Minuten)
    codeTtlMs: 5 * 60 * 1000,
    // Laenge des zufaelligen Codes
    codeLength: 6,
    // Nachricht, die der Spieler im Spiel senden muss
    verifyCommand: '/msg {bot} {code}',
  },

  // Team-Einstellungen
  team: {
    // Wie lange Team-Einladungen gueltig sind (ms)
    inviteTtlMs: 30 * 60 * 1000,
  },

  // Timeouts / Cooldowns
  timeouts: {
    // Cooldown zwischen Verifizierungsversuchen in ms
    verifyCooldownMs: 60 * 1000,
    // Wie lange Buttons aktiv bleiben (ms), 0 = unendlich
    buttonTtlMs: 0,
  },

  // AFK-Bots: Liste von MC-Konten, die auf dem Server AFK stehen
  afkAccounts: [],

  // Regex-Muster fuer die Minecraft-Bridge.
  // Alle erkannten Muster sind konfigurierbar und NICHT hart kodiert.
  patterns: {
    // Spieler chatet (z.B. "<Spieler> Nachricht")
    PLAYER_CHAT: /^<([^>]+)>\s*(.*)$/,
    // System-Nachrichten (Breite Erfassung)
    SYSTEM: /^\[(Server|Info|System)\]\s*(.*)$/i,
    // Spieler join (z.B. "Spieler joined the game")
    JOIN: /^(\w{1,16})\s+joined the game$/i,
    // Spieler leave
    LEAVE: /^(\w{1,16})\s+left the game$/i,
    // Team-Einladung gesendet (z.B. "Du hast Spieler in dein Team eingeladen")
    TEAM_INVITED: /invited\s+(\w{1,16})\s+(?:to|into)/i,
    // Team-Beitritt (z.B. "Spieler ist dem Team beigetreten")
    TEAM_JOIN: /(\w{1,16})\s+joined\s+(?:the\s+)?team/i,
    // Team verlassen
    TEAM_LEFT: /(\w{1,16})\s+left\s+(?:the\s+)?team/i,
    // Zahlung / Spende
    PAYMENT: /(?:payment|donat(?:ion|ed)|paid)\s*(?:of)?\s*[\$\€\£]?\s*([\d.,]+)?/i,
    // Auktion / Handel (z.B. "ORDERS » ... created an ... order")
    AUCTION: /^ORDERS?\s*[»>]/i,
    // Private Nachricht an den Bot (z.B. "[WindBot -> Ich] CODE")
    PRIVATE_MESSAGE: /^\[([^\]]+)\s*->\s*[^\]]*\]\s*(.*)$/,
    // Fehler (z.B. "Error: ...", "Unknown command")
    ERROR: /^(?:Error|Unknown command|Invalid|Failed|An error)/i,
    // Command-Ausgabe (z.B. "/team ..." oder "Command: /rtpqueue")
    COMMAND: /^(?:Command:\s*)?\/(\w+)(?:\s+(.*))?$/,
  },
});

/**
 * Whitelist erlaubter Schlüssel für Einstellungen (Input-Validierung).
 */
export const SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));

/**
 * Liefert die Farben als Hex-Strings ohne '#'.
 * @returns {Record<string,string>}
 */
export function getColors() {
  return { ...DEFAULT_SETTINGS.colors };
}

/**
 * Wandelt einen Hex-Farbwert (mit oder ohne '#') in eine Dezimalzahl um.
 * @param {string} hex
 * @returns {number}
 */
export function hexToDecimal(hex) {
  const cleaned = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return 0x5865f2;
  return parseInt(cleaned, 16);
}

/**
 * Sanitisiert einen Minecraft-Namen (3-16 Zeichen, alphanumerisch plus Unterstriche).
 * @param {string} name
 * @returns {string|null} Sanitisierter Name oder null bei Ungueltigkeit.
 */
export function sanitizeIgn(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Erzeugt einen zufaelligen numerischen Code.
 * @param {number} length
 * @returns {string}
 */
export function generateCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Prüft, ob ein Regex-String kompilierbar ist.
 * @param {string} source
 * @returns {string|null} Fehlermeldung oder null.
 */
export function validateRegex(source) {
  try {
    // eslint-disable-next-line no-new
    new RegExp(source);
    return null;
  } catch (err) {
    return err.message;
  }
}