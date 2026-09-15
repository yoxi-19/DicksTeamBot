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
  WAITING_PAYMENT: 'waiting_payment',
  TEAM: 'team',
  LEFT: 'left',
});

/**
 * Status einer Zahlung.
 * @readonly
 * @enum {string}
 */
export const PaymentStatus = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded',
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
  channelJoinLogs: '',

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
    // Name des Teams für die Annahme-Anweisung nach einem Invite
    name: 'Dicks5',
    // Wie lange Team-Einladungen gueltig sind (ms)
    inviteTtlMs: 30 * 60 * 1000,
  },

  // Team-Raenge (1 = hoechstes Team, count = Einstieg).
  // Jede Rangstufe hat eine eigene Discord-Rolle und einen Owner mit Extra-Rolle.
  teamRanks: {
    // Anzahl der Teams/Rangstufen (anpassbar, 1-10)
    count: 5,
    // Rollen-IDs je Rangstufe (Schluessel = Rangnummer als String)
    roles: { 1: '', 2: '', 3: '', 4: '', 5: '' },
    // Extra-Rollen-IDs fuer die Owner je Rangstufe
    ownerRoles: { 1: '', 2: '', 3: '', 4: '', 5: '' },
    // Owner-Discord-IDs je Rangstufe ('' = kein Owner)
    owners: { 1: '', 2: '', 3: '', 4: '', 5: '' },
  },

  // Timeouts / Cooldowns
  timeouts: {
    // Cooldown zwischen Verifizierungsversuchen in ms
    verifyCooldownMs: 60 * 1000,
    // Wie lange Buttons aktiv bleiben (ms), 0 = unendlich
    buttonTtlMs: 0,
    // Timeout fuer Zahlungsaufforderung in ms (10 Minuten)
    paymentTimeoutMs: 10 * 60 * 1000,
  },

  // Payment-Einstellungen
  payment: {
    // Empfaenger-IGN (TeamBank)
    recipient: 'DicksTeamBank',
    // Erforderlicher Betrag in $
    amount: 250000,
  },

  // AFK-Bots: Liste von MC-Konten, die auf dem Server AFK stehen
  afkAccounts: [],

  // Regex-Muster fuer die Minecraft-Bridge.
  // Alle erkannten Muster sind konfigurierbar und NICHT hart kodiert.
  patterns: {
    // Spieler chatet (z.B. "<Spieler> Nachricht")
    PLAYER_CHAT: '^<([^>]+)>\\s*(.*)$',
    // System-Nachrichten (Breite Erfassung)
    SYSTEM: '^\\[(Server|Info|System)\\]\\s*(.*)$',
    // Spieler join (z.B. "Spieler joined the game")
    JOIN: '^(\\w{1,16})\\s+joined the game$',
    // Spieler leave
    LEAVE: '^(\\w{1,16})\\s+left the game$',
    // Team-Einladung gesendet (z.B. "Du hast Spieler in dein Team eingeladen")
    TEAM_INVITED: 'invited\\s+(\\w{1,16})\\s+(?:to|into)',
    // Team-Beitritt (z.B. "Spieler ist dem Team beigetreten")
    TEAM_JOIN: '(\\w{1,16})\\s+(?:has\\s+)?joined\\s+(?:your|the)\\s+team',
    // Team verlassen
    TEAM_LEFT: '(\\w{1,16})\\s+(?:has\\s+)?left\\s+(?:your|the)\\s+team',
    // Zahlung / Transfer (z.B. "Spieler hat 250000 $ an Empfaenger ueberwiesen")
    PAYMENT: '(?:you\\s+received\\s+\\$?[\\d.,]+\\s+from\\s+\\w{1,16}|\\w{1,16}\\s+(?:paid|sent|transferred|hat)\\b.*(?:to|an|an\\s+den|bezahlt|ueberwiesen))',
    // Auktion / Handel (z.B. "ORDERS » ... created an ... order")
    AUCTION: '^ORDERS?\\s*[»>]',
    // Private Nachricht an den Bot (z.B. "[DicksBot -> Ich] CODE")
    PRIVATE_MESSAGE: '^\\[([^\\]]+)\\s*->\\s*[^\\]]*\\]\\s*(.*)$',
    // Fehler (z.B. "Error: ...", "Unknown command")
    ERROR: '^(?:Error|Unknown command|Invalid|Failed|An error)',
    // Command-Ausgabe (z.B. "/team ..." oder "Command: /rtpqueue")
    COMMAND: '^(?:Command:\\s*)?\\/(\\w+)(?:\\s+(.*))?$',
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
