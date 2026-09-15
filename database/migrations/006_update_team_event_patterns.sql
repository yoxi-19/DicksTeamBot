-- WindSMP meldet den Beitritt als "<Name> joined your team".
-- Vorhandene Muster einmal zurücksetzen, damit die erweiterten Defaults greifen.
DELETE FROM settings WHERE key = 'setting:patterns';
