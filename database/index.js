// Variable: Datenbank-Zugriffsschicht (better-sqlite3).
// Kapselt alle SQL-Abfragen. Leicht austauschbar durch andere Repositories.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../shared/logger.js';
import { ApplicationStatus, PlayerStatus } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Initialisiert die Datenbank, legt Verzeichnis und Schema an.
 * @param {string} dbPath Pfad zur SQLite-Datei.
 * @returns {Database.Database} Die geoeffnete Datenbank.
 */
export function initDatabase(dbPath) {
  const resolved = path.resolve(process.cwd(), dbPath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations();
  logger.info(`[DB] Datenbank initialisiert: ${resolved}`);
  return db;
}

/**
 * Führt alle Migrationen in ./migrations in Reihenfolge aus.
 */
function runMigrations() {
  // Tabelle zuerst anlegen (falls sie noch nicht existiert)
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const exec = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    });
    exec();
    logger.info(`[DB] Migration angewendet: ${file}`);
  }
}

/**
 * Gibt die Datenbank-Instanz zurück.
 * @returns {Database.Database}
 */
export function getDb() {
  if (!db) throw new Error('Datenbank ist nicht initialisiert. initDatabase() zuerst aufrufen.');
  return db;
}

/**
 * Schliesst die Datenbank sauber.
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

// ---------- Users ----------

/**
 * Findet oder erstellt einen Benutzer anhand der Discord-ID.
 * @param {string} discordId
 * @returns {object}
 */
export function findUserByDiscord(discordId) {
  return getDb().prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) || null;
}

/**
 * Findet einen Benutzer anhand des Minecraft-Namens.
 * @param {string} ign
 * @returns {object|null}
 */
export function findUserByIgn(ign) {
  return getDb().prepare('SELECT * FROM users WHERE ign = ?').get(ign) || null;
}

/**
 * Findet einen Benutzer anhand des Minecraft-Namens, tolerant:
 * Gross-/Kleinschreibung und fuehrender Bedrock-Punkt (Geyser) egal.
 * @param {string} ign
 * @returns {object|null}
 */
export function findUserByIgnLoose(ign) {
  const exact = getDb().prepare('SELECT * FROM users WHERE ign = ?').get(ign);
  if (exact) return exact;
  const wanted = String(ign || '').trim().replace(/^\.+/, '').toLowerCase();
  if (!wanted) return null;
  const users = getDb().prepare('SELECT * FROM users').all();
  return users.find((u) => String(u.ign || '').trim().replace(/^\.+/, '').toLowerCase() === wanted) || null;
}

/**
 * Findet einen Benutzer anhand der ID.
 * @param {number} id
 * @returns {object|null}
 */
export function findUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

/**
 * Erstellt oder aktualisiert einen Benutzer (Upsert anhand Discord-ID).
 * @param {object} data
 * @returns {object}
 */
export function upsertUser(data) {
  const existing = data.discord_id ? findUserByDiscord(data.discord_id) : null;
  const now = new Date().toISOString();

  if (existing) {
    getDb()
      .prepare(
        `UPDATE users SET ign = COALESCE(?, ign), status = COALESCE(?, status),
         team = CASE WHEN ? THEN ? ELSE team END, is_online = COALESCE(?, is_online),
         verified_at = COALESCE(?, verified_at), updated_at = ? WHERE id = ?`,
      )
      .run(
        data.ign ?? null,
        data.status ?? null,
        Object.hasOwn(data, 'team') ? 1 : 0,
        data.team ?? null,
        data.is_online ?? null,
        data.verified_at ?? null,
        now,
        existing.id,
      );
    return findUserById(existing.id);
  }

  const info = getDb()
    .prepare(
      `INSERT INTO users (discord_id, ign, status, team, is_online, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.discord_id ?? null,
      data.ign ?? null,
      data.status ?? PlayerStatus.UNVERIFIED,
      data.team ?? null,
      data.is_online ?? 0,
      data.verified_at ?? null,
      now,
      now,
    );
  return findUserById(info.lastInsertRowid);
}

/**
 * Löscht die Verknuepfung eines Benutzers (unlink).
 * @param {string} discordId
 */
export function unlinkUser(discordId) {
  const existing = findUserByDiscord(discordId);
  if (!existing) return;
  getDb()
    .prepare(
      `UPDATE users SET ign = NULL, status = ?, team = NULL, verified_at = NULL, updated_at = ? WHERE discord_id = ?`,
    )
    .run(PlayerStatus.UNVERIFIED, new Date().toISOString(), discordId);
}

/**
 * Gibt alle Benutzer zurück (optional gefiltert).
 * @returns {object[]}
 */
export function listUsers() {
  return getDb().prepare('SELECT * FROM users ORDER BY ign IS NULL, ign ASC').all();
}

/**
 * Setzt alle Spieler auf offline (z.B. bei Bot-Disconnect).
 */
export function setAllUsersOffline() {
  getDb().prepare('UPDATE users SET is_online = 0').run();
}

/**
 * Gleicht den Online-Status mit der live Spielerliste des Bots ab.
 * Spieler in der Liste werden online gesetzt, alle anderen offline.
 * @param {string[]} onlineIgns - IGNs laut Minecraft-Server
 */
export function reconcileOnlineStates(onlineIgns) {
  const clean = [...new Set((onlineIgns || []).filter((n) => typeof n === 'string' && n.length > 0))];
  const setOffline = getDb().prepare('UPDATE users SET is_online = 0');
  const setOnline = getDb().prepare('UPDATE users SET is_online = 1 WHERE ign = ?');
  const apply = getDb().transaction((igns) => {
    setOffline.run();
    for (const ign of igns) setOnline.run(ign);
  });
  apply(clean);
}

// ---------- Verification Codes ----------

/**
 * Erstellt einen Verifizierungs-Code.
 * @param {object} data { discordId, ign, code, ttlMs }
 * @returns {object}
 */
export function createVerificationCode({ discordId, ign, code, ttlMs, messageId }) {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);
  const info = getDb()
    .prepare(
      `INSERT INTO verification_codes (discord_id, ign, code, created_at, expires_at, message_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(discordId, ign, code, now.toISOString(), expires.toISOString(), messageId || null);
  return getDb()
    .prepare('SELECT * FROM verification_codes WHERE id = ?')
    .get(info.lastInsertRowid);
}

/**
 * Aktualisiert die Message-ID eines Verifizierungscodes.
 * @param {number} id
 * @param {string} messageId
 */
export function updateCodeMessageId(id, messageId) {
  getDb().prepare('UPDATE verification_codes SET message_id = ? WHERE id = ?').run(messageId, id);
}

/**
 * Findet einen aktiven (ungenutzten, nicht abgelaufenen) Code anhand des Codes.
 * @param {string} code
 * @returns {object|null}
 */
export function findActiveCode(code) {
  const row = getDb()
    .prepare(
      'SELECT * FROM verification_codes WHERE code = ? AND used = 0 ORDER BY id DESC LIMIT 1',
    )
    .get(code);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

/**
 * Markiert alle Codes eines Discord-Nutzers als verwendet.
 * @param {string} discordId
 */
export function invalidateCodesForUser(discordId) {
  getDb()
    .prepare('UPDATE verification_codes SET used = 1 WHERE discord_id = ? AND used = 0')
    .run(discordId);
}

/**
 * Markiert einen einzelnen Code als verwendet.
 * @param {number} id
 */
export function markCodeUsed(id) {
  getDb().prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(id);
}

// ---------- Applications ----------

/**
 * Erstellt eine neue Bewerbung.
 * @param {object} data { discordId, ign }
 * @returns {object}
 */
export function createApplication({ discordId, ign }) {
  const info = getDb()
    .prepare(
      `INSERT INTO applications (discord_id, ign, status) VALUES (?, ?, ?)`,
    )
    .run(discordId, ign, ApplicationStatus.PENDING);
  return getDb().prepare('SELECT * FROM applications WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Gibt alle Bewerbungen zurück (optional nach Status gefiltert).
 * @param {string|null} status
 * @returns {object[]}
 */
export function listApplications(status = null) {
  if (status) {
    return getDb().prepare('SELECT * FROM applications WHERE status = ? ORDER BY id DESC').all(status);
  }
  return getDb().prepare('SELECT * FROM applications ORDER BY id DESC').all();
}

/**
 * Findet eine Bewerbung anhand der ID.
 * @param {number} id
 * @returns {object|null}
 */
export function findApplicationById(id) {
  return getDb().prepare('SELECT * FROM applications WHERE id = ?').get(id) || null;
}

/**
 * Akzeptiert alle pending-Bewerbungen eines bestimmten IGN (wenn Spieler tatsaechlich beigetreten ist).
 * @param {string} ign
 * @returns {object[]} Aktualisierte Bewerbungen.
 */
export function acceptApplicationsForIgn(ign) {
  const apps = listApplications(ApplicationStatus.PENDING).filter(
    (a) => a.ign.toLowerCase() === ign.toLowerCase(),
  );
  for (const app of apps) {
    updateApplicationStatus(app.id, ApplicationStatus.ACCEPTED, null);
  }
  return apps;
}

/**
 * Aktualisiert den Status einer Bewerbung.
 * @param {number} id
 * @param {string} status
 * @param {string} reviewedBy
 */
export function updateApplicationStatus(id, status, reviewedBy) {
  getDb()
    .prepare('UPDATE applications SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ?')
    .run(status, reviewedBy, new Date().toISOString(), id);
  return findApplicationById(id);
}

// ---------- Logs ----------

/**
 * Schreibt einen Log-Eintrag.
 * @param {object} data { category, title, description, discordId, ign }
 * @returns {object}
 */
export function addLog({ category, title, description = null, discordId = null, ign = null }) {
  const info = getDb()
    .prepare(
      `INSERT INTO logs (category, title, description, discord_id, ign) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(category, title, description, discordId, ign);
  return getDb().prepare('SELECT * FROM logs WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Listet Logs mit optionalen Filtern.
 * @param {object} opts { category, since, limit }
 * @returns {object[]}
 */
export function listLogs({ category = null, since = null, limit = 500 } = {}) {
  let sql = 'SELECT * FROM logs';
  const params = [];
  const where = [];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (since) {
    where.push('created_at >= ?');
    params.push(new Date(since).toISOString());
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params);
}

// ---------- Messages ----------

/**
 * Speichert eine Chat-Nachricht.
 * @param {object} data { category, content, author }
 * @returns {object}
 */
export function addMessage({ category, content, author = null }) {
  const info = getDb()
    .prepare('INSERT INTO messages (category, content, author) VALUES (?, ?, ?)')
    .run(category, content, author);
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Listet die neuesten gespeicherten Nachrichten in chronologischer Reihenfolge.
 * @param {number} limit
 * @returns {object[]}
 */
export function listMessages(limit = 500) {
  const rows = getDb().prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').all(limit);
  return rows.reverse();
}

/**
 * Löscht alte Chat-Nachrichten, behaelt nur die neuesten.
 * @param {number} keep
 * @returns {number} Anzahl gelöschter Zeilen
 */
export function pruneMessages(keep = 5000) {
  const info = getDb()
    .prepare('DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT ?)')
    .run(keep);
  return info.changes;
}

// ---------- Settings ----------

/**
 * Liest eine Einstellung aus der DB.
 * @param {string} key
 * @param {unknown} fallback
 * @returns {unknown}
 */
export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/**
 * Schreibt eine Einstellung (JSON-kodiert).
 * @param {string} key
 * @param {unknown} value
 */
export function setSetting(key, value) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), new Date().toISOString());
}

/**
 * Gibt alle Einstellungen als Objekt zurück.
 * @returns {Record<string, unknown>}
 */
export function listSettings() {
  const all = getDb().prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const row of all) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

// ---------- Payments ----------

/**
 * Erstellt einen neuen Payment-Eintrag (wartend auf Zahlung).
 * @param {object} data { discordId, ign, amount, recipient, timeoutMs }
 * @returns {object}
 */
export function createPayment({ discordId, ign, amount, recipient, timeoutMs }) {
  const now = new Date();
  const timeoutAt = new Date(now.getTime() + timeoutMs);
  const info = getDb()
    .prepare(
      `INSERT INTO payments (discord_id, ign, amount, recipient, status, timeout_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    )
    .run(discordId, ign, amount, recipient, timeoutAt.toISOString());
  return getDb().prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Findet ein aktives (pending) Payment für einen Discord-User.
 * @param {string} discordId
 * @returns {object|null}
 */
export function findActivePayment(discordId) {
  return getDb()
    .prepare(
      "SELECT * FROM payments WHERE discord_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    )
    .get(discordId) || null;
}

/**
 * Aktualisiert den Status eines Payments.
 * @param {number} id
 * @param {string} status
 * @param {object} extra - optionale Zusatzfelder { confirmedAt, chatMessage }
 */
export function updatePaymentStatus(id, status, extra = {}) {
  const sets = ['status = ?'];
  const params = [status];
  if (extra.confirmedAt) {
    sets.push('confirmed_at = ?');
    params.push(extra.confirmedAt);
  }
  if (extra.chatMessage) {
    sets.push('chat_message = ?');
    params.push(extra.chatMessage);
  }
  params.push(id);
  getDb()
    .prepare(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params);
  return getDb().prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

/**
 * Setzt alle abgelaufenen pending-Payments auf 'timeout'.
 */
export function timeoutExpiredPayments() {
  const now = new Date().toISOString();
  const expired = getDb()
    .prepare(
      "SELECT * FROM payments WHERE status = 'pending' AND timeout_at < ?",
    )
    .all(now);
  for (const p of expired) {
    updatePaymentStatus(p.id, 'timeout');
  }
  return expired;
}

/**
 * Listet Payments mit optionalen Filtern.
 * @param {object} opts { status, limit }
 * @returns {object[]}
 */
export function listPayments({ status = null, limit = 200 } = {}) {
  if (status) {
    return getDb()
      .prepare('SELECT * FROM payments WHERE status = ? ORDER BY id DESC LIMIT ?')
      .all(status, limit);
  }
  return getDb()
    .prepare('SELECT * FROM payments ORDER BY id DESC LIMIT ?')
    .all(limit);
}

/**
 * Findet das juengste Payment eines Discord-Nutzers (egal welcher Status).
 * @param {string} discordId
 * @returns {object|null}
 */
export function findLatestPayment(discordId) {
  return getDb().prepare('SELECT * FROM payments WHERE discord_id = ? ORDER BY id DESC LIMIT 1').get(discordId) || null;
}

/**
 * Findet das juengste CONFIRMED-Payment eines Discord-Nutzers.
 * Nur dafuer darf je ein Refund ausgefuehrt werden.
 * @param {string} discordId
 * @returns {object|null}
 */
export function findLatestConfirmedPayment(discordId) {
  return getDb().prepare(
    "SELECT * FROM payments WHERE discord_id = ? AND status = 'confirmed' ORDER BY id DESC LIMIT 1",
  ).get(discordId) || null;
}

/**
 * Beansprucht ein Payment atomar für den Refund.
 * Markiert es NUR dann als 'refunding', wenn es noch 'confirmed' ist.
 * Der Rueckgabewert changes === 1 bedeutet: nur dieser Aufruf darf zahlen.
 * Schuetzt vor Doppel-Refunds (Timer, Retry, Neustart).
 * @param {number} id
 * @returns {boolean} true wenn erfolgreich beansprucht
 */
export function claimPaymentForRefund(id) {
  const info = getDb()
    .prepare("UPDATE payments SET status = 'refunding' WHERE id = ? AND status = 'confirmed'")
    .run(id);
  return info.changes === 1;
}

/**
 * Macht eine Refund-Beanspruchung rueckgaengig (z.B. Bot offline).
 * Nur möglich solange noch 'refunding' – ein REFUNDED bleibt für immer.
 * @param {number} id
 */
export function releaseRefundClaim(id) {
  getDb()
    .prepare("UPDATE payments SET status = 'confirmed' WHERE id = ? AND status = 'refunding'")
    .run(id);
}

/**
 * Schreibt einen erfolgreich gesendeten Refund fest.
 * @param {number} id
 * @returns {object|null} Die aktualisierte Zeile
 */
export function completeRefund(id) {
  getDb()
    .prepare("UPDATE payments SET status = 'refunded', refunded_at = ? WHERE id = ? AND status = 'refunding'")
    .run(new Date().toISOString(), id);
  return getDb().prepare('SELECT * FROM payments WHERE id = ?').get(id) || null;
}

/**
 * Findet alte CONFIRMED-Payments, deren User nicht im Team ist.
 * Dient der Selbstheilung nach Neustarts (verlorene Refund-Timer).
 * @param {string} olderThanIso - ISO-Zeitstempel (Obergrenze confirmed_at)
 * @param {string|null} newerThanIso - optionale Untergrenze confirmed_at
 * @returns {object[]}
 */
export function findStaleConfirmedPayments(olderThanIso, newerThanIso = null) {
  if (newerThanIso) {
    return getDb()
      .prepare("SELECT * FROM payments WHERE status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_at < ? AND confirmed_at > ? ORDER BY id ASC")
      .all(olderThanIso, newerThanIso);
  }
  return getDb()
    .prepare("SELECT * FROM payments WHERE status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_at < ? ORDER BY id ASC")
    .all(olderThanIso);
}

/**
 * Findet ein Payment anhand der ID.
 * @param {number} id
 * @returns {object|null}
 */
export function findPaymentById(id) {
  return getDb().prepare('SELECT * FROM payments WHERE id = ?').get(id) || null;
}
