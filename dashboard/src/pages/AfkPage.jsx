import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { apiFetch } from '../lib/api.js';

export default function AfkPage() {
  const { afkAccounts } = useSocket();
  const [accounts, setAccounts] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (Array.isArray(afkAccounts) && afkAccounts.length > 0) {
      setAccounts((prev) => {
        const merged = [...prev];
        for (const live of afkAccounts) {
          const idx = merged.findIndex((a) => a.username === live.username);
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...live };
          }
        }
        return merged;
      });
    }
  }, [afkAccounts]);

  const fetchAccounts = async () => {
    try {
      const data = await apiFetch('/api/afk', { token: localStorage.getItem('windsmp_token') });
      setAccounts(data.accounts || []);
    } catch {
      // ignore
    }
  };

  const handleAdd = useCallback(async () => {
    const name = newUsername.trim();
    if (!name) return;
    setLoading(`add-${name}`);
    setError('');
    try {
      const data = await apiFetch('/api/afk/add', {
        method: 'POST',
        token: localStorage.getItem('windsmp_token'),
        body: { username: name },
      });
      if (data.error) {
        setError(data.error);
      } else {
        setNewUsername('');
        await fetchAccounts();
      }
    } catch (err) {
      setError(err.message || 'Fehler.');
    } finally {
      setLoading(null);
    }
  }, [newUsername]);

  const handleToggle = useCallback(async (username) => {
    setLoading(`toggle-${username}`);
    setError('');
    try {
      await apiFetch('/api/afk/toggle', {
        method: 'POST',
        token: localStorage.getItem('windsmp_token'),
        body: { username },
      });
      await fetchAccounts();
    } catch (err) {
      setError(err.message || 'Fehler.');
    } finally {
      setLoading(null);
    }
  }, []);

  const handleRemove = useCallback(async (username) => {
    setLoading(`remove-${username}`);
    setError('');
    try {
      await apiFetch('/api/afk/remove', {
        method: 'POST',
        token: localStorage.getItem('windsmp_token'),
        body: { username },
      });
      await fetchAccounts();
    } catch (err) {
      setError(err.message || 'Fehler.');
    } finally {
      setLoading(null);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">AFK-Bots</h1>
        <p className="text-sm text-gray-600 mt-1">Zusaetzliche Minecraft-Konten auf dem Server AFK stellen</p>
      </div>

      {/* Hinzufuegen */}
      <div className="card-glass">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Account hinzufuegen</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Minecraft-Username"
            className="input-field flex-1 text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={loading === `add-${newUsername.trim()}` || !newUsername.trim()}
            className="btn-primary text-sm disabled:opacity-40"
          >
            {loading === `add-${newUsername.trim()}` ? '...' : 'Hinzufuegen'}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>

      {/* Account-Liste */}
      <div className="card-glass !p-0 overflow-hidden">
        {accounts.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-10 h-10 text-gray-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            <p className="text-gray-600 text-sm">Keine AFK-Bots konfiguriert.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-windsmp-border/30">
                <th className="text-left py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Username</th>
                <th className="text-left py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Status</th>
                <th className="text-left py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Verbindung</th>
                <th className="text-right py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.username} className="table-row border-b border-windsmp-border/10 last:border-0">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-windsmp-primary/10 border border-windsmp-primary/15 flex items-center justify-center">
                        <svg className="w-4 h-4 text-windsmp-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                        </svg>
                      </div>
                      <span className="font-medium text-gray-200">{acc.username}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5">
                    <span className={`text-xs px-2.5 py-1 rounded-md ${
                      acc.enabled
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                    }`}>
                      {acc.enabled ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${acc.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-xs text-gray-500">{acc.connected ? 'Verbunden' : 'Offline'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleToggle(acc.username)}
                        disabled={loading === `toggle-${acc.username}`}
                        className={`text-[11px] px-3 py-1 rounded-md border transition-all disabled:opacity-40 ${
                          acc.enabled
                            ? 'text-amber-400 border-amber-500/25 hover:bg-amber-500/10'
                            : 'text-green-400 border-green-500/25 hover:bg-green-500/10'
                        }`}
                      >
                        {loading === `toggle-${acc.username}` ? '...' : acc.enabled ? 'Stop' : 'Start'}
                      </button>
                      <button
                        onClick={() => handleRemove(acc.username)}
                        disabled={loading === `remove-${acc.username}`}
                        className="text-[11px] px-3 py-1 rounded-md border text-red-400 border-red-500/25 hover:bg-red-500/10 transition-all disabled:opacity-40"
                      >
                        {loading === `remove-${acc.username}` ? '...' : 'Entfernen'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
