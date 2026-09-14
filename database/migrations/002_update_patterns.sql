-- Migration: Aktualisiere Regex-Patterns fuer echte Server-Nachrichten.
-- WICHTIG: Backslashes muessen doppelt escaped werden (SQL -> JSON -> RegExp).

-- Alte Patterns loeschen, damit _ensureDefaultsSeeded die neuen Defaults setzt.
DELETE FROM settings WHERE key = 'setting:patterns';
