# Team DICKS TeamBot

Vollstaendiges Bot-System fuer den Minecraft-Server. Verbindet Discord, Minecraft und ein Web-Dashboard in einem einzigen Prozess.

---

## Funktionen

### Discord Bot
- Verifizierungssystem (Discord <-> Minecraft Konto-Verknuepfung)
- Team-Beitritt mit automatischer Einladung im Spiel
- Slash-Befehle mit Buttons, Modals und Embeds
- Automatische Nickname-Synchronisierung
- Rollenverwaltung (Verified, Team, Join, Admin)
- Live-Logging mit farbcodierten Embeds

### Minecraft Bridge
- Mineflayer-Integration mit automatischer Wiederverbindung (konfigurierbar)
- Konfigurierbare Regex-Erkennung fuer Chat, System, Join/Leave, Zahlungen, Auktionen, Commands
- Fallback-Heuristik fuer unbekannte Nachrichtenformate
- Verifizierungscode-Erkennung per `/msg`
- Team-Einladungen per `/team invite`
- TPS- und Ping-Ueberwachung
- Chat-Eingabe ueber das Dashboard (mit Passwort-Schutz)

### Web Dashboard
- React + Vite + TailwindCSS (Dark Theme)
- Live-Updates via WebSocket (Socket.IO)
- Uebersichtsseite mit Bot-Status, Statistiken und Online-Spielern
- Spieler-Verwaltung mit Suche und Sortierung
- Team-Verwaltung (Join-Anfragen annehmen/ablehnen, Mitglieder)
- Live-Minecraft-Chat (Monospace, wie ingame)
- Console mit Live-Serverlogs (Level-Filter, Suche)
- Service-Steuerung (Discord/Minecraft Bot starten/stoppen, Auto-Reconnect)
- Einstellungen (Regex, Rollen, Farben, Timeouts)

---

## Alles von Null bis laeufig

Du hast noch nichts? Kein Problem. Hier ist jeder einzelne Schritt.

---

### PHASE 1: Vorbereitung (lokal auf deinem PC)

#### 1.1 Discord Bot erstellen

1. Gehe zu https://discord.com/developers/applications
2. Klicke oben rechts auf **"New Application"**
3. Gib einen Namen ein (z.B. `Team DICKS Bot`) und erstelle
4. Gehe links zu **"Bot"**
5. Klicke auf **"Reset Token"** und kopiere den Token (**merk dir den, du brauchst ihn spaeter!**)
6. Aktiviere diese Berechtigungen unter "Privileged Gateway Intents":
   - ✅ Message Content Intent
7. Gehe links zu **"OAuth2"** -> **"URL Generator"**
8. Waehle unter "Scopes" aus:
   - ✅ bot
   - ✅ applications.commands
9. Waehle unter "Bot Permissions" aus:
   - ✅ Send Messages
   - ✅ Manage Roles
   - ✅ Manage Nicknames
   - ✅ Read Message History
10. Kopiere die generierte URL unten, oeffne sie im Browser und fuege den Bot deinem Discord-Server hinzu

#### 1.2 Discord-Server-IDs kopieren

Aktiviere im Discord den **Entwickler-Modus**:
- Discord -> Einstellungen -> Erweitert -> Entwicklermodus aktivieren

Dann kannst du mit Rechtsklick auf Kanaele/Rollen die IDs kopieren:
- **Server-ID:** Rechtsklick auf den Servernamen -> Server-ID kopieren
- **Log-Kanal-ID:** Rechtsklick auf den Log-Kanal -> Kanal-ID kopieren
- **Verified-Rollen-ID:** Rechtsklick auf die Verified-Rolle -> Rollen-ID kopieren
- **Team-Rollen-ID:** Rechtsklick auf die Team-Rolle -> Rollen-ID kopieren
- **Join-Rollen-ID:** Rechtsklick auf die Join-Rolle -> Rollen-ID kopieren

> Notiere dir diese IDs, du brauchst sie in der `.env`-Datei.

#### 1.3 Minecraft-Server erreichbar machen

Falls der Minecraft-Server auf einem anderen Rechner laeuft als der Bot:
- Port **25565** muss offen sein (im Router und in der Firewall)
- Notiere die oeffentliche IP oder Domain des Servers

Falls Bot und Minecraft-Server auf demselben Rechner/VPS laufen:
- `localhost` als Host reicht, kein Port noetig

#### 1.4 Projekt-Ordner lokal

Der Projekt-Ordner enthaelt bereits alle Dateien. Stelle sicher, dass er vollstaendig ist.

---

### PHASE 2: Lokal testen

#### 2.1 Node.js installieren

Falls noch nicht geschehen:
- https://nodejs.org herunterladen und installieren ( LTS-Version waehlen )
- Terminal oeffnen und pruefen:
```bash
node -v   # Sollte v18+ oder v20+ zeigen
npm -v    # Sollte eine Version zeigen
```

#### 2.2 Dependencies installieren

```bash
cd "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots"
npm install
cd dashboard && npm install && cd ..
```

#### 2.3 .env anlegen und ausfuellen

```bash
cp .env.example .env
```

Oder erstelle die Datei `.env` manuell mit diesem Inhalt (Werte eintragen):

```env
# Discord
DISCORD_TOKEN=HIER_DEIN_DISCORD_BOT_TOKEN_EINTRAGEN
DISCORD_GUILD_ID=HIER_DEINE_SERVER_ID_EINTRAGEN
DISCORD_CLIENT_ID=HIER_DEINE_APP_ID_EINTRAGEN

# Minecraft
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=DeinMCName
MINECRAFT_AUTH=microsoft
MINECRAFT_PASSWORD=
MINECRAFT_VERSION=
MINECRAFT_PROFILES_FOLDER=

# Server
PORT=3000
DASHBOARD_URL=http://localhost:5173
SESSION_SECRET=ZUFALLSGENERIERTER_LANGER_TEXT_HIER_EINTRAGEN
JWT_EXPIRES_IN=7d

# Datenbank
DATABASE_PATH=./database/teamdicks.sqlite

# Dashboard Login
DASHBOARD_ADMIN_USER=admin
DASHBOARD_ADMIN_PASSWORD=admin123

# Logging
LOG_LEVEL=info
```

> **WICHTIG:** Ersetze alle `HIER_EINTRAGEN`-Stellen mit deinen echten Werten!

#### 2.4 Discord-App-ID nachtragen

Gehe zurueck zum Discord Developer Portal:
1. Waehle deine Anwendung aus
2. Kopiere die **Application ID** (steht oben auf der Hauptseite)
3. Trage sie als `DISCORD_CLIENT_ID` in die `.env`-Datei ein

#### 2.5 Bot zum ersten Mal lokal starten

```bash
cd "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots"
npm run dev
```

Der Bot sollte sich jetzt mit Discord verbinden. Pruefe:
- Im Terminal sollte stehen: `[Discord] Bot eingeloggt als ...`
- Im Discord sollte der Bot als "Online" angezeigt werden

Falls ein Fehler kommt:
- Pruefe den `DISCORD_TOKEN` in der `.env`
- Pruefe die `DISCORD_GUILD_ID`

#### 2.6 Minecraft-Session erstellen (Microsoft-Auth)

Da `MINECRAFT_AUTH=microsoft` gesetzt ist:
1. Der Bot zeigt beim Start eine URL und einen Code an
2. Oeffne die URL im Browser und logge dich mit deinem Microsoft-Konto ein
3. Gib den Code ein
4. Danach werden die Session-Tokens im Cache gespeichert
5. Auf dem VPS: Lokal einloggen, dann den Cache-Ordner uebertragen

> Bei `MINECRAFT_AUTH=offline` (cracked Server) wird kein Microsoft-Login benoetigt.

#### 2.7 Dashboard testen

```bash
cd dashboard && npm run build && cd ..
npm start
```

Oeffne http://localhost:3000 im Browser. Du solltest das Dashboard sehen.
Login: `admin` / `admin123`

#### 2.8 Bot stoppen

Druecke `Strg + C` im Terminal um den Bot zu stoppen.

---

### PHASE 3: GitHub-Repo erstellen

#### 3.1 GitHub-Konto

Falls noch nicht vorhanden: https://github.com ein Konto erstellen.

#### 3.2 Neues Repository erstellen

1. Auf GitHub oben rechts auf **"+"** klicken -> **"New repository"**
2. **Repository name:** `DicksTeamBot`
3. **Description:** `Team DICKS TeamBot - Discord, Minecraft, Dashboard`
4. Waehle **Public** oder **Private**
5. **NICHT** "Add a README file" anhaken (wir haben schon eine)
6. Klicke **"Create repository"**

#### 3.3 Projekt hochladen

Im Terminal (im Projekt-Ordner):

```bash
cd "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots"

git init
git add .
git commit -m "Init Team DICKS TeamBot"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/DicksTeamBot.git
git push -u origin main
```

> Ersetze `DEIN-USERNAME` durch deinen echten GitHub-Benutzernamen!

> Die `.env`-Datei und der Session-Cache werden NICHT hochgeladen (stehen in `.gitignore`).

---

### PHASE 4: OVH Cloud VPS einrichten

#### 4.1 VPS bestellen

1. Gehe zu https://www.ovhcloud.com/de/vps/
2. Waehle einen VPS:
   - Ubuntu 22.04 oder 24.04 LTS
   - Mindestens 1 vCPU, 1 GB RAM (2 GB empfohlen)
   - Beim Bestellen einen SSH-Key hinterlegen (empfohlen)
3. Bestellen und warten bis der VPS bereit ist (dauert ein paar Minuten)
4. Du bekommst eine E-Mail mit der VPS-IP und Passwort

#### 4.2 Per SSH verbinden

**Windows (PowerShell):**
```bash
ssh root@DEINE_VPS_IP
```

**Mac/Linux (Terminal):**
```bash
ssh root@DEINE_VPS_IP
```

Passwort eingeben (falls kein SSH-Key hinterlegt).

#### 4.3 VPS vorbereiten (einmalig)

Alles nacheinander im SSH-Terminal ausfuehren:

```bash
# System aktualisieren
apt update && apt upgrade -y

# Node.js 20 installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git

# Pruefen
node -v  # Sollte v20.x zeigen
npm -v   # Sollte 10.x zeigen
```

#### 4.4 Projekt auf VPS klonen

```bash
cd /home
git clone https://github.com/DEIN-USERNAME/DicksTeamBot.git
cd DicksTeamBot
```

> Ersetze `DEIN-USERNAME` durch deinen GitHub-Benutzernamen!

#### 4.5 .env und Minecraft-Session vom PC kopieren

**Von deinem lokalen PC aus** (neues Terminal-Fenster, nicht SSH):

```bash
# .env-Datei kopieren
scp "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots\.env" root@DEINE_VPS_IP:/home/DicksTeamBot/

# Minecraft-Session-Cache kopieren (falls vorhanden)
scp -r "%USERPROFILE%\.minecraft\nmp-cache" root@DEINE_VPS_IP:/home/DicksTeamBot/.minecraft/
```

> Ersetze `DEINE_VPS_IP` durch die echte IP deines VPS!
> Falls du einen anderen Benutzernamen als `root` nutzt, ersetze `root` entsprechend.

Pruefe auf dem VPS ob die Dateien da sind:
```bash
ls -la /home/DicksTeamBot/.env
```

#### 4.6 Dependencies installieren und Dashboard bauen

Auf dem VPS:
```bash
cd /home/DicksTeamBot
npm install
cd dashboard && npm install && npm run build && cd ..
```

#### 4.7 Firewall oeffnen

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (fuer Nginx spaeter)
ufw allow 443/tcp   # HTTPS (fuer Nginx spaeter)
ufw allow 3000/tcp  # Dashboard (nur noetig ohne Nginx)
ufw enable
```

---

### PHASE 5: Bot mit PM2 starten

Auf dem VPS:

```bash
# PM2 installieren
npm install -g pm2

# Bot starten
cd /home/DicksTeamBot
pm2 start server/index.js --name dicksteambot

# Autostart bei Server-Neustart aktivieren
pm2 save
pm2 startup
# -> Den angezeigten Befehl ausfuehren!
```

Pruefen ob alles laeuft:
```bash
pm2 status
pm2 logs dicksteambot
```

Im Terminal sollte stehen:
- `[Server] HTTP-Server laeuft auf Port 3000`
- `[Discord] Bot eingeloggt als ...`
- `[Minecraft] Verbinde mit ...`

#### Dashboard auf VPS oeffnen

Im Browser: `http://DEINE_VPS_IP:3000`

Login: `admin` / `admin123` (oder was du in `.env` eingetragen hast)

**WICHTIG:** Passwort sofort aendern unter "Einstellungen"!

---

### PHASE 6: Domain + SSL einrichten (optional)

Falls du eine eigene Domain nutzen moechtest (z.B. `bot.dicks.de`):

#### 6.1 DNS einrichten

Bei deinem Domain-Anbieter (z.B. OVH, IONOS, etc.):
- A-Record erstellen:
  - **Name:** `bot`
  - **Wert:** `DEINE_VPS_IP`
  - **TTL:** 3600

Warte ein paar Minuten bis die DNS-Aenderung wirkt.

#### 6.2 Nginx installieren

Auf dem VPS:
```bash
apt install -y nginx
```

#### 6.3 Nginx-Config erstellen

```bash
nano /etc/nginx/sites-available/dicks
```

Folgenden Inhalt einfuegen:
```nginx
server {
    listen 80;
    server_name bot.dicks.de;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> Ersetze `bot.dicks.de` durch deine echte Domain!

Speichern mit `Strg + O`, Enter, `Strg + X`.

#### 6.4 Nginx aktivieren

```bash
ln -s /etc/nginx/sites-available/dicks /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### 6.5 SSL-Zertifikat (kostenlos mit Certbot)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d bot.dicks.de
```

> Ersetze `bot.dicks.de` durch deine Domain!
> Folge den Anweisungen im Terminal.

#### 6.6 .env anpassen

Auf dem VPS:
```bash
cd /home/DicksTeamBot
nano .env
```

`DASHBOARD_URL` aendern:
```env
DASHBOARD_URL=https://bot.dicks.de
```

Speichern und Bot neu starten:
```bash
pm2 restart dicksteambot
```

Jetzt ist das Dashboard unter `https://bot.dicks.de` erreichbar!

---

### PHASE 7: Discord-Befehle ausfuehren

Wenn der Bot laeuft, kannst du in Discord die Setup-Befehle ausfuehren:

```
/setup-verify     -> Erstellt das Verifizierungs-Panel im aktuellen Kanal
/setup-team       -> Erstellt das Team-Beitritts-Panel
/setup-logs       -> Setzt den Log-Kanal (Kanal als Option angeben)
/setup-roles      -> Setzt die Rollen (Rollen als Optionen angeben)
/setup-dashboard  -> Zeigt den Dashboard-Link
/setup-config     -> Einstellungen anzeigen/aendern
/setuppatterns    -> Minecraft-Chat-Patterns anzeigen oder aendern
```

Beispiel:
```
/setup-logs #bot-logs
/setup-roles @Verified @Team @Join @Admin
/setuppatterns
/setuppatterns pattern:COMMAND regex:^Command:\s*/(\w+)(?:\s+(.*))?$
```

---

## Spätere Updates

Wenn du Aenderungen am Code vornimmst:

### Auf dem VPS updaten

```bash
# Auf dem VPS:
cd /home/DicksTeamBot
git pull origin main
npm install
cd dashboard && npm install && npm run build && cd ..
pm2 restart dicksteambot
```

Oder als Einzeiler:
```bash
cd /home/DicksTeamBot && git pull origin main && npm install && cd dashboard && npm install && npm run build && cd .. && pm2 restart dicksteambot
```

### Wenn du die .env aenderst

```bash
cd /home/DicksTeamBot
nano .env
# Aenderungen vornehmen
pm2 restart dicksteambot
```

### Wenn du die Minecraft-Session erneuern musst

1. Lokal Bot einmal starten und Microsoft-Login durchfuehren
2. Session-Cache-Ordner auf den VPS kopieren
3. Bot auf VPS neu starten:
```bash
pm2 restart dicksteambot
```

---

## Nuetzliche PM2-Befehle

```bash
pm2 status                          # Status aller Prozesse
pm2 logs dicksteambot               # Live-Logs anzeigen
pm2 logs dicksteambot --lines 100   # Letzte 100 Zeilen
pm2 restart dicksteambot            # Bot neu starten
pm2 stop dicksteambot               # Bot stoppen
pm2 delete dicksteambot             # Bot aus PM2 entfernen
pm2 monit                           # Live-Monitoring (CPU, RAM)
pm2 save                            # Aktuelle Prozesse speichern
pm2 startup                         # Autostart einrichten
```

---

## Slash-Befehle

| Befehl | Beschreibung | Berechtigung |
|--------|-------------|--------------|
| `/setup-verify` | Verifizierungs-Panel erstellen | Administrator |
| `/setup-team` | Team-Panel erstellen | Administrator |
| `/setup-dashboard` | Dashboard-Link senden | Administrator |
| `/setup-logs` | Log-Kanal setzen | Administrator |
| `/setup-roles` | Rollen setzen | Administrator |
| `/setup-config` | Einstellungen anzeigen/aendern | Administrator |
| `/setuppatterns` | Minecraft-Chat-Patterns anzeigen/aendern | Administrator |
| `/verify-user` | Verifizierung erzwingen/entfernen | Administrator |
| `/team-invite` | Team-Einladung im Spiel senden | Administrator |
| `/team-remove` | Spieler aus Team entfernen | Administrator |
| `/team-sync` | Team-Rollen synchronisieren | Administrator |
| `/player-info` | Spielerinformationen anzeigen | Administrator |
| `/player-unlink` | Verknuepfung entfernen | Administrator |
| `/reload-config` | Konfiguration neu laden | Administrator |
| `/status` | Bot-Status anzeigen | Alle |
| `/help` | Hilfe anzeigen | Alle |

---

## Verifizierungsablauf

1. Spieler klickt auf "Verbinden" im Discord-Panel
2. Spieler gibt seinen Minecraft-Namen ein
3. Bot generiert einen 6-stelligen Code (gueltig 5 Minuten)
4. Spieler verbindet sich mit dem Minecraft-Server
5. Spieler sendet: `/msg LudwigHolstein <CODE>`
6. Bridge erkennt den Code und verifiziert das Konto
7. Discord-Nickname wird aktualisiert
8. Verified-Rolle wird vergeben
9. Join-Rolle wird entfernt
10. Spieler erhaelt eine DM-Bestaetigung

## Team-Beitrittsablauf

1. Admin erstellt das Team-Panel mit `/setup-team`
2. Spieler klickt auf "Team beitreten"
3. Spieler bestaetigt seinen Minecraft-Namen
4. Bridge sendet `/team invite <SPIELER>` im Spiel
5. Spieler nimmt die Einladung im Spiel an
6. Discord-Team-Rolle wird vergeben
7. Nickname wird aktualisiert

---

## Dashboard

### Login

Standard-Zugangsdaten (in `.env` konfigurierbar):
- Benutzername: `admin`
- Passwort: `admin123`

**WICHTIG:** Aendere das Passwort sofort nach dem ersten Login!

### Seiten

| Seite | Beschreibung |
|-------|-------------|
| Uebersicht | Bot-Status, Spieler-Statistiken, Online-Spieler, letzte Logs |
| Spieler | Alle verifizierten Spieler mit Suche und Sortierung |
| Team | Join-Anfragen annehmen/ablehnen, Team-Mitglieder |
| Live Chat | Minecraft-Chat in Echtzeit + Nachricht senden (Passwort) |
| Logs | System-Logs mit Filter und Export |
| Console | Live-Serverlogs, Service-Steuerung (Start/Stop/Reconnect) |
| Einstellungen | Regex, Rollen, Farben, Timeouts bearbeiten |

---

## Konfiguration

### Hybrid-System

Die Konfiguration verwendet ein 3-Stufen-System:

1. **`.env`** - Geheime/umgebungsabhaengige Werte (Token, Passwoerter, Pfade)
2. **`database/settings`** - Laufzeit-Konfiguration (Regex, IDs, Farben, Timeouts)
3. **Defaults** - Standardwerte beim ersten Start (in `shared/types.js`)

### Konfiguration ueber Dashboard

Alle Einstellungen koennen ueber das Dashboard unter "Einstellungen" geaendert werden:
- Discord-Rollen-IDs
- Discord-Kanal-IDs
- Farben (Hex)
- Regex-Muster fuer Chat-Erkennung
- Verifizierungs-Einstellungen
- Timeouts und Cooldowns

### Konfiguration ueber Discord

Patterns koennen direkt in Discord geaendert werden:
```
/setuppatterns                                    # Alle anzeigen
/setuppatterns pattern:COMMAND regex:NEUER_REGEX  # Einzelnes Pattern aendern
/setuppatterns zuruecksetzen:Ja                   # Alle auf Standard
```

---

## Fehlerbehebung

### Bot startet nicht

- Pruefe die `.env`-Datei auf korrekte Werte
- Pruefe, ob der Discord-Token gueltig ist
- Pruefe, ob die Minecraft-Server-Adresse erreichbar ist

### Verifizierung funktioniert nicht

- Pruefe, ob der Bot-Name im Minecraft korrekt ist (`MINECRAFT_USERNAME`)
- Pruefe, ob der Code noch gueltig ist (5 Minuten)
- Pruefe die Logs auf Fehler: `pm2 logs dicksteambot`

### Dashboard zeigt keine Live-Daten

- Pruefe, ob Socket.IO verbunden ist (gruener Punkt in der Sidebar)
- Pruefe die CORS-Einstellungen in `.env` (`DASHBOARD_URL`)
- Pruefe die Browser-Konsole auf Fehler

### Bot verbindet sich nicht mit Minecraft

- Pruefe, ob der Minecraft-Server online ist
- Pruefe, ob `MINECRAFT_HOST` und `MINECRAFT_PORT` korrekt sind
- Pruefe, ob der Port offen ist (Firewall)
- Bei Microsoft-Auth: Pruefe ob der Session-Cache existiert

### Bot verbindet sich nicht mit Discord

- Pruefe den `DISCORD_TOKEN` in der `.env`
- Pruefe die `DISCORD_GUILD_ID`
- Pruefe ob der Bot zum Server hinzugefuegt wurde

---

## Projektstruktur

```
DicksTeamBot/
├── discord/              # Discord Bot (Commands, Events, Panels, Services)
│   ├── bot.js            # Bot-Client und Command-Loader
│   ├── commands/         # 16 Slash-Befehle
│   ├── components/       # Buttons und Modals
│   ├── events/           # Discord-Events (ready, interactionCreate)
│   ├── helpers.js        # Embeds, Rollen, Log-Funktionen
│   ├── panels/           # Verify- und Team-Panel Embeds
│   ├── teamService.js    # Team-Beitritt-Logik
│   └── verifyService.js  # Verifizierungs-Logik
├── minecraft/            # Minecraft Bridge
│   ├── bridge.js         # Mineflayer, Chat-Parsing, Regex-Erkennung, Heuristik
│   └── index.js          # Module-Export
├── server/               # Backend
│   ├── index.js          # Hauptserver (Express + Socket.IO + Discord + MC)
│   ├── config.js         # Konfigurationssystem
│   ├── middleware/        # Auth, Rate-Limit
│   ├── routes/           # API-Routen (auth, stats, players, chat, services, etc.)
│   └── socket/           # Socket.IO Handler
├── dashboard/            # Frontend (React + Vite + Tailwind)
│   ├── src/
│   │   ├── pages/        # 8 Seiten (Login, Uebersicht, Spieler, Team, Chat, Logs, Console, Einstellungen)
│   │   ├── components/   # Layout, StatCard
│   │   ├── context/      # AuthContext, SocketContext
│   │   └── lib/          # API-Helfer
│   └── dist/             # Gebaute Dateien
├── database/             # SQLite
│   ├── index.js          # DB-Zugriffsschicht
│   └── migrations/       # Schema
├── shared/               # Gemeinsame Module
│   ├── types.js          # Typen, Konstanten, Defaults (inkl. Patterns)
│   ├── logger.js         # Winston-Logger (inkl. Dashboard-Transport)
│   ├── events.js         # Event-Bus
│   ├── utils.js          # Hilfsfunktionen
│   └── validation.js     # Input-Validierung
├── .env.example          # Beispiel-Umgebungsvariablen
├── .gitignore            # Git-Ignorier-Dateien
├── package.json          # Haupt-Paket
├── Dockerfile            # Docker-Build
├── docker-compose.yml    # Docker-Compose
└── README.md             # Diese Datei
```

---

## Lizenz

MIT
