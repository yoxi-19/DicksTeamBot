// Variable: kleine Hilfsfunktionen (Zeit, Events, etc.).

/**
 * Liefert einen ISO-Zeitstempel des aktuellen Zeitpunkts.
 * @returns {string}
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Liefert den Unix-Zeitstempel in Millisekunden.
 * @returns {number}
 */
export function nowMs() {
  return Date.now();
}

/**
 * Prüft, ob ein Zeitstempel (ms) noch nicht abgelaufen ist.
 * @param {number} createdMs
 * @param {number} ttlMs
 * @returns {boolean}
 */
export function isNotExpired(createdMs, ttlMs) {
  return nowMs() - createdMs < ttlMs;
}

/**
 * Formatiert Zeitstempel für die Anzeige (Deutsch).
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Formatiert einen Zeitstempel deutsches Datumsformat.
 * @param {number|string|Date} input
 * @returns {string}
 */
export function formatDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Uhrzeit-Anteil eines Zeitstempels (HH:MM:SS), für Chat-Listen.
 * @param {number|string|Date} input
 * @returns {string}
 */
export function formatTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleTimeString('de-DE', { hour12: false });
}

/**
 * Einfache zufaellige ID (nicht kryptografisch), für Log-Referenzen.
 * @returns {string}
 */
export function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}