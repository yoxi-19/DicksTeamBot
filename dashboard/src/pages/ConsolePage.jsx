import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { apiFetch } from '../lib/api.js';

const LEVEL_COLORS = {
  error: 'text-red-400',
  warn: 'text-amber-400',
  info: 'text-gray-300',
  debug: 'text-gray-600',
};

export default function ConsolePage() {
  const { consoleLogs, services } = useSocket();
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const scrollRef = useRef(null);
  const pauseRef = useRef(paused);
  pauseRef.current = paused;

  const filtered = useMemo(() => {
    let list = Array.isArray(consoleLogs) ? consoleLogs : [];
    if (levelFilter !== 'all') {
      list = list.filter((l) => l.level === levelFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((l) => l.message && l.message.toLowerCase().includes(q));
    }
    return list;
  }, [consoleLogs, search, levelFilter]);

  useEffect(() => {
    if (!pauseRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered]);

  const handleServiceAction = useCallback(async (service, action) => {
    const key = `${service}-${action}`;
    setActionLoading(key);
    try {
      const token = localStorage.getItem('windsmp_token');
      await apiFetch(`/api/services/${service}/${action}`, {
        method: 'POST',
        token,
      });
    } catch {
      // Fehler werden im Console-Output angezeigt
    } finally {
      setActionLoading(null);
    }
  }, []);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-200">Console</h1>
          <span className="text-xs text-gray-600">{filtered.length} Zeilen</span>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'error', 'warn', 'info', 'debug'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`text-[11px] px-2.5 py-1 rounded-md whitespace-nowrap transition-all ${
                levelFilter === lvl
                  ? lvl === 'error'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                    : lvl === 'warn'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      : 'bg-windsmp-primary/15 text-windsmp-primary border border-windsmp-primary/25'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {lvl === 'all' ? 'Alle' : lvl.toUpperCase()}
            </button>
          ))}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen..."
            className="input-field text-sm py-1.5 w-40"
          />
          <button
            onClick={() => setPaused(!paused)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              paused
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                : 'text-gray-500 border-windsmp-border/30 hover:text-gray-300'
            }`}
          >
            {paused ? 'Weiter' : 'Pause'}
          </button>
        </div>
      </div>

      {/* Service Controls */}
      <div className="mb-3 flex gap-3">
        {/* Discord */}
        <div className="card-glass !py-3 !px-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            <span className="text-xs text-gray-400">Discord</span>
          </div>
          <div className={`w-2 h-2 rounded-full ${services.discord?.running ? 'bg-green-400' : 'bg-red-400'}`} />
          <button
            onClick={() => handleServiceAction('discord', services.discord?.running ? 'stop' : 'start')}
            disabled={actionLoading === 'discord-start' || actionLoading === 'discord-stop'}
            className={`text-[11px] px-3 py-1 rounded-md border transition-all disabled:opacity-40 ${
              services.discord?.running
                ? 'text-red-400 border-red-500/25 hover:bg-red-500/10'
                : 'text-green-400 border-green-500/25 hover:bg-green-500/10'
            }`}
          >
            {actionLoading === 'discord-start' || actionLoading === 'discord-stop'
              ? '...'
              : services.discord?.running
                ? 'Stop'
                : 'Start'}
          </button>
        </div>

        {/* Minecraft */}
        <div className="card-glass !py-3 !px-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
            </svg>
            <span className="text-xs text-gray-400">Minecraft</span>
          </div>
          <div className={`w-2 h-2 rounded-full ${services.minecraft?.running ? 'bg-green-400' : 'bg-red-400'}`} />
          <button
            onClick={() => handleServiceAction('minecraft', services.minecraft?.running ? 'stop' : 'start')}
            disabled={actionLoading === 'minecraft-start' || actionLoading === 'minecraft-stop'}
            className={`text-[11px] px-3 py-1 rounded-md border transition-all disabled:opacity-40 ${
              services.minecraft?.running
                ? 'text-red-400 border-red-500/25 hover:bg-red-500/10'
                : 'text-green-400 border-green-500/25 hover:bg-green-500/10'
            }`}
          >
            {actionLoading === 'minecraft-start' || actionLoading === 'minecraft-stop'
              ? '...'
              : services.minecraft?.running
                ? 'Stop'
                : 'Start'}
          </button>
          {/* Auto-Reconnect Toggle */}
          <div className="border-l border-windsmp-border/30 pl-3 ml-1">
            <button
              onClick={() => handleServiceAction('minecraft', 'reconnect')}
              disabled={actionLoading === 'minecraft-reconnect'}
              className={`text-[11px] px-3 py-1 rounded-md border transition-all disabled:opacity-40 ${
                services.minecraft?.autoReconnect
                  ? 'text-green-400 border-green-500/25 hover:bg-green-500/10'
                  : 'text-gray-500 border-windsmp-border/30 hover:text-gray-300'
              }`}
            >
              {actionLoading === 'minecraft-reconnect'
                ? '...'
                : `Reconnect: ${services.minecraft?.autoReconnect ? 'An' : 'Aus'}`}
            </button>
          </div>
        </div>
      </div>

      {/* Console Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden rounded-xl bg-black/40 border border-windsmp-border/20 font-mono text-[12px] leading-[1.6]"
      >
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-600 text-sm">
            Keine Console-Logs.
          </div>
        ) : (
          <div className="p-3">
            {filtered.map((log, i) => {
              const time = log.timestamp
                ? new Date(log.timestamp).toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '';

              const color = LEVEL_COLORS[log.level] || 'text-gray-300';

              return (
                <div key={i} className="hover:bg-white/[0.03] px-1 rounded flex gap-3">
                  <span className="text-gray-600 shrink-0 w-[70px]">{time}</span>
                  <span className={`${color} shrink-0 w-[40px] uppercase`}>{log.level}</span>
                  <span className="text-gray-300 break-all">{log.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
