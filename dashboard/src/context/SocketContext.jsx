import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { API_BASE } from '../lib/api.js';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [services, setServices] = useState({ discord: { running: false }, minecraft: { running: false } });
  const [afkAccounts, setAfkAccounts] = useState([]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // Im Vite-Entwicklungsmodus läuft Socket.IO über den Proxy; bei einer
    // externen API-URL muss der Client hingegen direkt zum Backend verbinden.
    const socketUrl = API_BASE || window.location.origin;
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('[Socket] Verbunden');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('[Socket] Getrennt');
    });

    // Live-Daten
    newSocket.on('connect_error', () => setConnected(false));
    newSocket.on('statsUpdate', (data) => {
      if (!data || typeof data !== 'object') return;

      // Partial-Update von der Bridge (nur MC-Status)
      if ('isOnline' in data && !data.system) {
        setStats((previous) => ({
          ...previous,
          minecraft: { ...previous?.minecraft, ...data },
        }));
        setServices((prev) => ({
          ...prev,
          minecraft: {
            ...prev.minecraft,
            running: data.isOnline,
            autoReconnect: data.autoReconnect ?? prev.minecraft?.autoReconnect,
          },
        }));
        return;
      }

      // Full-Update vom Server (alle 5 Sekunden)
      if (data.services) {
        setServices(data.services);
      }
      setStats(data);
    });
    newSocket.on('playerUpdate', (data) => setPlayers(Array.isArray(data) ? data : []));
    newSocket.on('chatMessage', (data) => {
      if (Array.isArray(data)) {
        // Initiale Daten: Alles ersetzen
        setMessages(data.slice(-1000));
      } else if (data && typeof data === 'object') {
        // Neue Nachricht: Anhaengen
        setMessages((prev) => [...prev.filter((message) => message.id !== data.id).slice(-999), data]);
      }
    });
    newSocket.on('logUpdate', (data) => {
      if (Array.isArray(data)) {
        setLogs(data);
        setStats((previous) => ({ ...previous, recentLogs: data.slice(0, 5) }));
      } else if (data && typeof data === 'object') {
        setLogs((prev) => [data, ...prev.filter((log) => log.id !== data.id).slice(0, 999)]);
        setStats((previous) => ({
          ...previous,
          recentLogs: [data, ...(previous?.recentLogs || []).filter((log) => log.id !== data.id)].slice(0, 5),
        }));
      }
    });
    newSocket.on('teamUpdate', (data) => setApplications(Array.isArray(data) ? data : []));
    newSocket.on('consoleLog', (data) => {
      if (data && typeof data === 'object') {
        setConsoleLogs((prev) => [...prev.slice(-999), data]);
      }
    });
    newSocket.on('servicesUpdate', (data) => {
      if (data && typeof data === 'object') {
        setServices(data);
      }
    });
    newSocket.on('afkUpdate', (data) => {
      if (data && data.username) {
        setAfkAccounts((prev) => {
          const idx = prev.findIndex((a) => a.username === data.username);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data;
            return next;
          }
          return [...prev, data];
        });
      }
    });
    newSocket.on('afkRemove', (data) => {
      if (data && data.username) {
        setAfkAccounts((prev) => prev.filter((a) => a.username !== data.username));
      }
    });
    newSocket.on('joinLeave', (data) => {
      // Join/Leave-Events werden auch in messages angezeigt
      if (data && data.ign) {
        const msg = {
          category: 'joinLeave',
          content: data.type === 'join' ? `${data.ign} ist dem Server beigetreten.` : `${data.ign} hat den Server verlassen.`,
          author: data.ign,
          createdAt: data.timestamp,
        };
        setMessages((prev) => [...prev.slice(-999), msg]);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, token]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        stats,
        players,
        messages,
        logs,
        applications,
        consoleLogs,
        services,
        afkAccounts,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket muss innerhalb von SocketProvider verwendet werden.');
  return ctx;
}
