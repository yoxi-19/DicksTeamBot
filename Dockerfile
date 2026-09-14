FROM node:20-alpine

WORKDIR /app

# Dependencies kopieren und installieren
COPY package.json ./
RUN npm install --production

# Dashboard-Build kopieren (muss vorher lokal gebaut werden)
COPY dashboard/dist ./dashboard/dist

# Quellcode kopieren
COPY server ./server
COPY discord ./discord
COPY minecraft ./minecraft
COPY database ./database
COPY shared ./shared
COPY config ./config

# Env-Datei
COPY .env.example ./

# Verzeichnisse erstellen
RUN mkdir -p logs database

EXPOSE 3000

CMD ["node", "server/index.js"]