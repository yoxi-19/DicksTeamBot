// Variable: zentrale Eingabe-Validierung und Sanitisierung.
// Alle Eingaben aus Discord, Dashboard und Minecraft werden hier geprueft.

/**
 * Prüft, ob ein Wert eine nicht-leere Zeichenkette ist.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Prüft, ob ein Wert eine gültige Discord-Snowflake-ID ist (17-20 Ziffern).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSnowflake(value) {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

/**
 * Sanitisiert eine Chat-Nachricht, indem Laenge begrenzt und Kontrollzeichen entfernt werden.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeText(text, maxLength = 2000) {
  if (typeof text !== 'string') return '';
  // Entfernt Null-Bytes und andere Kontrollzeichen (ausser Newline/Tab).
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, maxLength);
}

/**
 * Sanitisiert untrusted HTML-Eingaben für das Dashboard (einfach, keine HTML-Whitelist noetig,
 * da React per Default escaped; hier dennoch grundlegende Zeichen entfernen).
 * @param {string} text
 * @returns {string}
 */
export function sanitizeHtmlText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Prüft, ob eine Zeichenkette ein gültiger Regex-Flags-String ist.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidRegexFlags(value) {
  return typeof value === 'string' && /^[gimsuy]*$/.test(value);
}

/**
 * Prüft, ob ein Wert eine positive Ganzzahl im erwarteten Bereich ist.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
export function isIntegerInRange(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Validiert ein Objekt gegen eine erwartete Schluesselliste.
 * Gibt eine Liste der unbekannten/ungültigen Schlüssel zurück.
 * @param {Record<string, unknown>} input
 * @param {string[]} allowed
 * @returns {string[]}
 */
export function rejectUnknownKeys(input, allowed) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return ['Eingabe muss ein Objekt sein.'];
  }
  const errors = [];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      errors.push(`Unbekannter Schlüssel: ${key}`);
    }
  }
  return errors;
}