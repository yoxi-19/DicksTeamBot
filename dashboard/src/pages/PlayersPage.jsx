import { useState, useMemo } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

const PAGE_SIZE = 50;

export default function PlayersPage() {
  const { players } = useSocket();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('ign');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const filteredPlayers = useMemo(() => {
    let list = [...(players || [])];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.ign && p.ign.toLowerCase().includes(q)) ||
          (p.discord_id && p.discord_id.includes(q)) ||
          (p.status && p.status.toLowerCase().includes(q)),
      );
    }

    list.sort((a, b) => {
      const aVal = (a[sortBy] || '').toString().toLowerCase();
      const bVal = (b[sortBy] || '').toString().toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [players, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedPlayers = filteredPlayers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const statusBadge = (status) => {
    switch (status) {
      case 'team':
        return <span className="badge-blue">Team</span>;
      case 'verified':
        return <span className="badge-green">Verifiziert</span>;
      case 'unverified':
        return <span className="badge-gray">Unbekannt</span>;
      default:
        return <span className="badge-yellow">{status}</span>;
    }
  };

  const sortIndicator = (field) => {
    if (sortBy !== field) return null;
    return <span className="ml-1 text-windsmp-primary/60">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Spieler</h1>
        <p className="text-sm text-gray-600 mt-0.5">{filteredPlayers.length} Spieler</p>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Spieler suchen (IGN, Discord-ID, Status)..."
          className="input-field w-full max-w-md text-sm"
        />
      </div>

      {/* Table */}
      <div className="card-glass !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-windsmp-border/30">
              {[
                { key: 'ign', label: 'IGN' },
                { key: 'discord_id', label: 'Discord' },
                { key: 'status', label: 'Status' },
                { key: 'online', label: 'Online' },
                { key: 'verified_at', label: 'Verifiziert am' },
              ].map((col) => (
                <th
                  key={col.key}
                  className="text-left py-3.5 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium cursor-pointer hover:text-windsmp-primary transition-colors select-none"
                  onClick={() => col.key !== 'online' && toggleSort(col.key)}
                >
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedPlayers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-600">
                  Keine Spieler gefunden.
                </td>
              </tr>
            ) : (
              paginatedPlayers.map((player, i) => (
                <tr
                  key={player.id}
                  className="table-row animate-fade-in"
                  style={{ animationDelay: `${i * 15}ms`, animationFillMode: 'both' }}
                >
                  <td className="py-3 px-5 font-medium text-gray-200">{player.ign || '-'}</td>
                  <td className="py-3 px-5 text-gray-500">
                    {player.discord_id ? (
                      <span className="text-xs font-mono bg-windsmp-darker/50 px-2 py-0.5 rounded">{player.discord_id}</span>
                    ) : '-'}
                  </td>
                  <td className="py-3 px-5">{statusBadge(player.status)}</td>
                  <td className="py-3 px-5">
                    {player.is_online ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-xs text-emerald-400">Online</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                        <span className="text-xs text-gray-600">Offline</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-5 text-gray-600 text-xs">
                    {player.verified_at
                      ? new Date(player.verified_at).toLocaleString('de-DE')
                      : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => setPage(1)}
            disabled={safePage <= 1}
            className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          <span className="text-xs text-gray-500 px-3 py-1.5">
            {safePage} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={safePage >= totalPages}
            className="btn-ghost text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}
