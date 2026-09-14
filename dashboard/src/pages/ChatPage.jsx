import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ChatPage() {
  const { messages, connected } = useSocket();
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const pauseRef = useRef(paused);
  pauseRef.current = paused;

  const filtered = useMemo(() => {
    let list = Array.isArray(messages) ? messages : [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          (m.content && m.content.toLowerCase().includes(q)) ||
          (m.author && m.author.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [messages, search]);

  useEffect(() => {
    if (!pauseRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered]);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true);
    setSendError('');
    try {
      await apiFetch('/api/chat/send', {
        method: 'POST',
        token,
        body: { message: msg },
      });
      setInput('');
      inputRef.current?.focus();
    } catch (error) {
      setSendError(error.message || 'Nachricht konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  }, [input, sending, token]);

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-200">Minecraft Live-Chat</h1>
          <span className={`badge ${connected ? 'badge-green' : 'badge-red'}`}>{connected ? 'Live' : 'Getrennt'}</span>
          <span className="text-xs text-gray-600">{filtered.length} Nachrichten</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen..."
            className="input-field text-sm py-1.5 w-48"
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

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden rounded-xl bg-black/30 border border-windsmp-border/20">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-600 text-sm">
            Keine Nachrichten.
          </div>
        ) : (
          <div className="p-3 font-mono text-[13px] leading-[1.7]">
            {filtered.map((msg, i) => (
              <div
                key={msg.id || i}
                className={`flex gap-2 text-gray-300 hover:bg-white/[0.03] px-2 py-0.5 rounded ${msg.author?.startsWith('Dashboard') ? 'bg-windsmp-primary/[0.04]' : ''}`}
              >
                <span className="text-gray-600 shrink-0">{msg.created_at || msg.createdAt ? new Date(msg.created_at || msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                {msg.author && <span className="text-windsmp-primary shrink-0">{msg.author}:</span>}
                <span className="break-words">{msg.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eingabefeld */}
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Nachricht oder Befehl senden..."
          disabled={sending}
          className="flex-1 input-field font-mono text-sm"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="px-4 py-2 rounded-lg bg-windsmp-primary/20 text-windsmp-primary border border-windsmp-primary/25 text-sm font-medium hover:bg-windsmp-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Senden
        </button>
      </div>
      {sendError && <p className="mt-2 text-xs text-red-400">{sendError}</p>}
      <p className="mt-2 text-[11px] text-gray-600">Enter sendet · Shift + Enter fügt keine Zeile ein · Befehle beginnen mit /</p>
    </div>
  );
}
