-- RegExp-Objekte konnten in JSON nicht gespeichert werden und wurden zu {}.
-- Die Default-Konfiguration verwendet jetzt Regex-Strings; einmalig neu anlegen.
DELETE FROM settings WHERE key = 'setting:patterns';
