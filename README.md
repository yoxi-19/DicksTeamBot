# WindSMP TeamBot

Vollstaendiges Bot-System fuer den WindSMP Minecraft-Server. Verbindet Discord, Minecraft und ein Web-Dashboard miteinander.

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
- Mineflayer-Integration mit automatischer Wiederverbindung
- Konfigurierbare Regex-Erkennung fuer Chat, System, Join/Leave, Zahlungen
- Verifizierungscode-Erkennung per `/msg`
- Team-Einladungen per `/team invite`
- TPS- und Ping-Ueberwachung

### Web Dashboard
- React + Vite + TailwindCSS (Dark Theme, WindSMP-Farben)
- Live-Updates via WebSocket (Socket.IO)
- Uebersichtsseite mit Bot-Status und Statistiken
- Spieler-Verwaltung mit Suche und Sortierung
- Bewerbungs-System (Annehmen/Ablehnen)
- Live-Minecraft-Chat mit Kategorie-Filtern
- Log-Ansicht mit Export-Funktion
- Einstellungen (Regex, Rollen, Farben, Timeouts)

---

## Alles von Null bis laeufig

Du hast noch nichts? Kein Problem. Hier ist jeder einzelne Schritt.

---

### PHASE 1: Vorbereitung (lokal auf deinem PC)

#### 1.1 Discord Bot erstellen

1. Gehe zu https://discord.com/developers/applications
2. Klicke oben rechts auf **"New Application"**
3. Gib einen Namen ein (z.B. `WindSMP Bot`) und erstelle
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
- **Join-Rollen-ID:** Reightsklick auf die Join-Rolle -> Rollen-ID kopieren

> Notiere dir diese IDs, du brauchst sie in der `.env`-Datei.

#### 1.3 Minecraft-Server erreichbar machen

Falls der Minecraft-Server auf einem anderen Rechner laeuft als der Bot:
- Port **25565** muss offen sein (im Router und in der Firewall)
- Notiere die oeffentliche IP oder Domain des Servers

Falls Bot und Minecraft-Server auf demselben Rechner/VPS laufen:
- `localhost` als Host reicht, kein Port noetig

#### 1.4 Projekt-Ordner lokal

Der Projekt-Ordner (`Team Dicks Bots`) enthaelt bereits alle Dateien. Stelle sicher, dass er vollstaendig ist.

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
MINECRAFT_USERNAME=WindBot
MINECRAFT_AUTH=minecraft
MINECRAFT_PASSWORD=
MINECRAFT_VERSION=
MINECRAFT_PROFILES_FOLDER=./mineflayer

# Server
PORT=3000
DASHBOARD_URL=http://localhost:5173
SESSION_SECRET=ZUFALLSGENERIERTER_LANGER_TEXT_HIER_EINTRAGEN
JWT_EXPIRES_IN=7d

# Datenbank
DATABASE_PATH=./database/windsmp.sqlite

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

#### 2.6 Minecraft-Session erstellen (falls Microsoft-Auth)

Falls dein Minecraft-Konto einen Microsoft-Account hat:
1. Der Bot zeigt beim Start eine URL an oder oeffnet den Browser
2. Logge dich mit deinem Microsoft-Konto ein
3. Danach entsteht der Ordner `mineflayer/` mit der Session-Datei
4. Dieser Ordner wird spaeter auf den VPS kopiert

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
2. **Repository name:** `windsmp-teambot`
3. **Description:** `WindSMP TeamBot - Discord, Minecraft, Dashboard`
4. Waehle **Public** oder **Private**
5. **NICHT** "Add a README file" anhaken (wir haben schon eine)
6. Klicke **"Create repository"**

#### 3.3 Projekt hochladen

Im Terminal (im Projekt-Ordner):

```bash
cd "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots"

git init
git add .
git commit -m "Init WindSMP TeamBot"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/windsmp-teambot.git
git push -u origin main
```

> Ersetze `DEIN-USERNAME` durch deinen echten GitHub-Benutzernamen!

> Die `.env`-Datei und der `mineflayer/` Ordner werden NICHT hochgeladen (stehen in `.gitignore`).

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
git clone https://github.com/DEIN-USERNAME/windsmp-teambot.git
cd windsmp-teambot
```

> Ersetze `DEIN-USERNAME` durch deinen GitHub-Benutzernamen!

#### 4.5 .env und Minecraft-Session vom PC kopieren

**Von deinem lokalen PC aus** (neues Terminal-Fenster, nicht SSH):

```bash
# .env-Datei kopieren
scp "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots\.env" root@DEINE_VPS_IP:/home/windsmp-teambot/

# Minecraft-Session kopieren (falls vorhanden)
scp -r "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots\mineflayer" root@DEINE_VPS_IP:/home/windsmp-teambot/
```

> Ersetze `DEINE_VPS_IP` durch die echte IP deines VPS!
> Falls du einen anderen Benutzernamen als `root` nutzt, ersetze `root` entsprechend.

Pruefe auf dem VPS ob die Dateien da sind:
```bash
ls -la /home/windsmp-teambot/.env
ls -la /home/windsmp-teambot/mineflayer/
```

#### 4.6 Dependencies installieren und Dashboard bauen

Auf dem VPS:
```bash
cd /home/windsmp-teambot
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
cd /home/windsmp-teambot
pm2 start server/index.js --name windsmp-teambot

# Autostart bei Server-Neustart aktivieren
pm2 save
pm2 startup
# -> Den angezeigten Befehl ausfuehren!
```

Pruefen ob alles laeuft:
```bash
pm2 status
pm2 logs windsmp-teambot
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

Falls du eine eigene Domain nutzen moechtest (z.B. `bot.windsmp.de`):

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
nano /etc/nginx/sites-available/windsmp
```

Folgenden Inhalt einfügen:
```nginx
server {
    listen 80;
    server_name bot.windsmp.de;

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

> Ersetze `bot.windsmp.de` durch deine echte Domain!

Speichern mit `Strg + O`, Enter, `Strg + X`.

#### 6.4 Nginx aktivieren

```bash
ln -s /etc/nginx/sites-available/windsmp /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### 6.5 SSL-Zertifikat (kostenlos mit Certbot)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d bot.windsmp.de
```

> Ersetze `bot.windsmp.de` durch deine Domain!
> Folge den Anweisungen im Terminal.

#### 6.6 .env anpassen

Auf dem VPS:
```bash
cd /home/windsmp-teambot
nano .env
```

`DASHBOARD_URL` aendern:
```env
DASHBOARD_URL=https://bot.windsmp.de
```

Speichern und Bot neu starten:
```bash
pm2 restart windsmp-teambot
```

Jetzt ist das Dashboard unter `https://bot.windsmp.de` erreichbar!

---

### PHASE 7: Discord-Befehle ausfuehren

Wenn der Bot laeuft, kannst du in Discord die Setup-Befehle ausfuehren:

```
/setup verify     -> Erstellt das Verifizierungs-Panel im aktuellen Kanal
/setup team       -> Erstellt das Team-Beitritts-Panel
/setup logs       -> Setzt den Log-Kanal (Kanal als Option angeben)
/setup roles      -> Setzt die Rollen (Rollen als Optionen angeben)
/setup dashboard  -> Zeigt den Dashboard-Link
```

Beispiel:
```
/setup logs #bot-logs
/setup roles @Verified @Team @Join @Admin
```

---

## Spätere Updates

Wenn du Aenderungen am Code vornimmst:

### Auf dem VPS updaten

```bash
# Auf dem VPS:
cd /home/windsmp-teambot
git pull origin main
npm install
cd dashboard && npm install && npm run build && cd ..
pm2 restart windsmp-teambot
```

Oder als Einzeiler:
```bash
cd /home/windsmp-teambot && git pull origin main && npm install && cd dashboard && npm install && npm run build && cd .. && pm2 restart windsmp-teambot
```

### Wenn du die .env aenderst

```bash
cd /home/windsmp-teambot
nano .env
# Aenderungen vornehmen
pm2 restart windsmp-teambot
```

### Wenn du die Minecraft-Session erneuern musst

1. Lokal Bot einmal starten und Microsoft-Login durchfuehren
2. `mineflayer/` Ordner erneut auf den VPS kopieren:
```bash
scp -r "C:\Users\jmb20\Desktop\Coding\Team Dicks Bots\mineflayer" root@DEINE_VPS_IP:/home/windsmp-teambot/
```
3. Bot auf VPS neu starten:
```bash
pm2 restart windsmp-teambot
```

---

## Nuetzliche PM2-Befehle

```bash
pm2 status                      # Status aller Prozesse
pm2 logs windsmp-teambot        # Live-Logs anzeigen
pm2 logs windsmp-teambot --lines 100  # Letzte 100 Zeilen
pm2 restart windsmp-teambot     # Bot neu starten
pm2 stop windsmp-teambot        # Bot stoppen
pm2 delete windsmp-teambot      # Bot aus PM2 entfernen
pm2 monit                       # Live-Monitoring (CPU, RAM)
pm2 save                        # Aktuelle Prozesse speichern
pm2 startup                     # Autostart einrichten
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
5. Spieler sendet: `/msg WindBot <CODE>`
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
| Uebersicht | Bot-Status, Spieler-Statistiken, letzte Logs |
| Spieler | Alle verifizierten Spieler mit Suche und Sortierung |
| Bewerbungen | Team-Bewerbungen annehmen/ablehnen |
| Live Chat | Minecraft-Chat in Echtzeit mit Kategorie-Filtern |
| Logs | System-Logs mit Filter und Export |
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

---

## Fehlerbehebung

### Bot startet nicht

- Pruefe die `.env`-Datei auf korrekte Werte
- Pruefe, ob der Discord-Token gueltig ist
- Pruefe, ob die Minecraft-Server-Adresse erreichbar ist

### Verifizierung funktioniert nicht

- Pruefe, ob der Bot-Name im Minecraft korrekt ist (`MINECRAFT_USERNAME`)
- Pruefe, ob der Code noch gueltig ist (5 Minuten)
- Pruefe die Logs auf Fehler: `pm2 logs windsmp-teambot`

### Dashboard zeigt keine Live-Daten

- Pruefe, ob Socket.IO verbunden ist (gruener Punkt in der Sidebar)
- Pruefe die CORS-Einstellungen in `.env` (`DASHBOARD_URL`)
- Pruefe die Browser-Konsole auf Fehler

### Bot verbindet sich nicht mit Minecraft

- Pruefe, ob der Minecraft-Server online ist
- Pruefe, ob `MINECRAFT_HOST` und `MINECRAFT_PORT` korrekt sind
- Pruefe, ob der Port offen ist (Firewall)
- Bei Microsoft-Auth: Pruefe ob `mineflayer/user.json` existiert

### Bot verbindet sich nicht mit Discord

- Pruefe den `DISCORD_TOKEN` in der `.env`
- Pruefe die `DISCORD_GUILD_ID`
- Pruefe ob der Bot zum Server hinzugefuegt wurde

---

## Projektstruktur

```
windsmp-teambot/
├── discord/              # Discord Bot (Commands, Events, Panels, Services)
│   ├── bot.js            # Bot-Client und Command-Loader
│   ├── commands/         # 15 Slash-Befehle
│   ├── components/       # Buttons und Modals
│   ├── events/           # Discord-Events (ready, interactionCreate)
│   ├── helpers.js        # Embeds, Rollen, Log-Funktionen
│   ├── panels/           # Verify- und Team-Panel Embeds
│   ├── teamService.js    # Team-Beitritt-Logik
│   └── verifyService.js  # Verifizierungs-Logik
├── minecraft/            # Minecraft Bridge
│   ├── bridge.js         # Mineflayer, Chat-Parsing, Regex-Erkennung
│   └── index.js          # Module-Export
├── server/               # Backend
│   ├── index.js          # Hauptserver (Express + Socket.IO)
│   ├── config.js         # Konfigurationssystem
│   ├── middleware/        # Auth, Rate-Limit
│   ├── routes/           # API-Routen (auth, stats, players, etc.)
│   └── socket/           # Socket.IO Handler
├── dashboard/            # Frontend (React + Vite + Tailwind)
│   ├── src/
│   │   ├── pages/        # 7 Seiten (Login, Uebersicht, Spieler, etc.)
│   │   ├── components/   # Layout, StatCard
│   │   ├── context/      # AuthContext, SocketContext
│   │   └── lib/          # API-Helfer
│   └── dist/             # Gebaute Dateien
├── database/             # SQLite
│   ├── index.js          # DB-Zugriffsschicht
│   └── migrations/       # Schema
├── shared/               # Gemeinsame Module
│   ├── types.js          # Typen, Konstanten, Defaults
│   ├── logger.js         # Winston-Logger
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