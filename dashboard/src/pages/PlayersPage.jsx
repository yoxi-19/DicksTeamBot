import { useState, useMemo, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';

const PAGE_SIZE = 50;

export default function PlayersPage() {
  const { players, stats } = useSocket();
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('ign');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [owners, setOwners] = useState({});
  const [liveRoles, setLiveRoles] = useState(null);
  const [discordMembers, setDiscordMembers] = useState(null);

  useEffect(() => {
    apiFetch('/api/settings', { token })
      .then((data) => setOwners(data?.teamRanks?.owners || {}))
      .catch(() => {});
    apiFetch('/api/discord/rank-check', { token })
      .then((data) => setLiveRoles(Array.isArray(data) ? data : []))
      .catch(() => setLiveRoles([]));
    apiFetch('/api/discord/members', { token })
      .then((data) => setDiscordMembers(Array.isArray(data) ? data : []))
      .catch(() => setDiscordMembers(null));
  }, [token]);

  const ownerRankByDiscord = useMemo(() => {
    const map = {};
    for (const [rank, discordId] of Object.entries(owners || {})) {
      if (discordId) map[discordId] = rank;
    }
    return map;
  }, [owners]);

  // Echte Discord-Rollen je User aus dem Rank-Check (gecached, 60s)
  const liveByDiscord = useMemo(() => {
    const map = {};
    for (const c of liveRoles || []) {
      for (const id of c.liveIds || []) {
        (map[id] ??= { ranks: [], ownerRanks: [] }).ranks.push(c.rank);
      }
      for (const id of c.ownerLiveIds || []) {
        (map[id] ??= { ranks: [], ownerRanks: [] }).ownerRanks.push(c.rank);
      }
    }
    return map;
  }, [liveRoles]);

  // Live-Spielerliste des Bots (alle 5s aktualisiert). Wenn der Bot offline
  // ist, gilt der gespeicherte DB-Wert.
  const liveOnline = stats?.minecraft?.isOnline ? stats?.minecraft?.onlinePlayers || null : null;
  const isOnline = (player) => {
    if (Array.isArray(liveOnline) && player.ign) return liveOnline.includes(player.ign);
    return !!player.is_online;
  };

  const filteredPlayers = useMemo(() => {
    // Die Datenbank kennt nur verknuepfte Spieler. Für die Rollenansicht
    // werden deshalb auch reine Discord-Mitglieder ergaenzt.
    if (discordMembers === null) return [...(players || [])];

    const playersByDiscord = new Map((players || []).filter((player) => player.discord_id).map((player) => [player.discord_id, player]));
    const linkedOrDiscord = discordMembers.map((member) => ({
      ...(playersByDiscord.get(member.id) || {}),
      id: playersByDiscord.get(member.id)?.id || `discord-${member.id}`,
      discord_id: member.id,
      discordMember: member,
      ign: playersByDiscord.get(member.id)?.ign || member.displayName || member.username,
      status: playersByDiscord.get(member.id)?.status || 'discord',
    }));
    const withoutDiscord = (players || []).filter((player) => !player.discord_id);
    let list = [...linkedOrDiscord, ...withoutDiscord];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.ign && p.ign.toLowerCase().includes(q)) ||
          (p.discordMember?.username && p.discordMember.username.toLowerCase().includes(q)) ||
          (p.discord_id && p.discord_id.includes(q)) ||
          (p.status && p.status.toLowerCase().includes(q)) ||
          (p.team && String(p.team).toLowerCase().includes(q)) ||
          p.discordMember?.roles?.some((role) => role.name.toLowerCase().includes(q)),
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
  }, [players, discordMembers, search, sortBy, sortDir]);

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
      case 'waiting_payment':
        return <span className="badge-yellow">Zahlung offen</span>;
      case 'left':
        return <span className="badge-red">Ausgetreten</span>;
      case 'unverified':
        return <span className="badge-gray">Nicht verifiziert</span>;
      case 'discord':
        return <span className="badge-gray">Nur Discord</span>;
      default:
        return <span className="badge-yellow">{status || '-'}</span>;
    }
  };

  const sortIndicator = (field) => {
    if (sortBy !== field) return null;
    return <span className="ml-1 text-windsmp-primary/60">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatDate = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const handleUnlink = async (player) => {
    const label = player.ign || player.discord_id;
    if (!window.confirm(`${label} wirklich entverifizieren? Rollen und Nickname werden entfernt.`)) return;
    setActionId(player.id);
    setNotice(null);
    try {
      const result = await apiFetch(`/api/players/${player.id}/unlink`, { method: 'POST', token });
      setNotice({ type: 'success', text: result.message || 'Verknuepfung entfernt.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Entfernen fehlgeschlagen.' });
    } finally {
      setActionId(null);
    }
  };

  const columns = [
    { key: 'ign', label: 'IGN' },
    { key: 'discord_id', label: 'Discord' },
    { key: 'status', label: 'Status' },
    { key: 'roles', label: 'Discord-Rollen', sortable: false, hint: 'Live vom Discord-Server; @everyone wird nicht angezeigt.' },
    { key: 'team', label: 'Team', hint: 'Echter Rang aus Discord-Rollen (DB als Fallback)' },
    { key: 'online', label: 'MC online', sortable: false, hint: 'Online auf dem Minecraft-Server (live)' },
    { key: 'verified_at', label: 'Verifiziert am' },
    { key: 'created_at', label: 'Erstellt am' },
    { key: 'actions', label: 'Aktionen', sortable: false },
  ];

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
          placeholder="Spieler suchen (IGN, Discord-ID, Status, Team)..."
          className="input-field w-full max-w-md text-sm"
        />
      </div>

      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-400'}`}>
          {notice.text}
        </div>
      )}

      {/* Table */}
      <div className="card-glass !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-windsmp-border/30">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    title={col.hint || ''}
                    className="text-left py-3.5 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium cursor-pointer hover:text-windsmp-primary transition-colors select-none whitespace-nowrap"
                    onClick={() => col.sortable !== false && toggleSort(col.key)}
                  >
                    {col.label}{sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-12 text-gray-600">
                    Keine Spieler gefunden.
                  </td>
                </tr>
              ) : (
                paginatedPlayers.map((player, i) => {
                  const online = isOnline(player);
                  const live = (player.discord_id && liveByDiscord[player.discord_id]) || { ranks: [], ownerRanks: [] };
                  const dbRank = /^\d+$/.test(String(player.team || '')) ? Number(player.team) : null;
                  // Live-Rang aus Discord hat Vorrang, DB nur als Fallback
                  const shownRank = live.ranks.length === 1 ? live.ranks[0] : dbRank;
                  const rankMismatch = dbRank && live.ranks.length > 0 && !live.ranks.includes(dbRank);
                  const isOwner = !!(player.discord_id && (ownerRankByDiscord[player.discord_id] || live.ownerRanks.length > 0));
                  return (
                    <tr
                      key={player.id || player.discord_id}
                      className="table-row animate-fade-in"
                      style={{ animationDelay: `${i * 15}ms`, animationFillMode: 'both' }}
                    >
                      <td className="py-3 px-5 font-medium text-gray-200">{player.ign || '-'}</td>
                      <td className="py-3 px-5 text-gray-500">
                        {player.discord_id ? (
                          <div className="space-y-1">
                            <span className="text-xs font-mono bg-windsmp-darker/50 px-2 py-0.5 rounded">{player.discord_id}</span>
                            {player.discordMember?.username && <p className="text-[11px] text-gray-600">@{player.discordMember.username}</p>}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-5">{statusBadge(player.status)}</td>
                      <td className="py-3 px-5">
                        {player.discordMember ? (
                          player.discordMember.roles.length > 0 ? (
                            <div className="flex max-w-xs flex-wrap gap-1">
                              {player.discordMember.roles.map((role) => (
                                <span key={role.id} title={role.id} className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${role.color}22`, border: `1px solid ${role.color}55`, color: role.color === '#000000' ? '#9ca3af' : role.color }}>
                                  {role.name}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-xs text-gray-600">Keine Rollen</span>
                        ) : <span className="text-xs text-gray-700">Discord nicht geladen</span>}
                      </td>
                      <td className="py-3 px-5 text-gray-400">
                        <div className="flex items-center gap-2">
                          <span>{shownRank ? `Team ${shownRank}` : '-'}</span>
                          {isOwner && (
                            <span className="badge-yellow" title={ownerRankByDiscord[player.discord_id] ? `Owner von Team ${ownerRankByDiscord[player.discord_id]}` : 'Hält Owner-Rolle auf Discord'}>Owner</span>
                          )}
                          {rankMismatch && <span title={`DB sagt Team ${dbRank}, Discord hat T${live.ranks.join(', T')}`} className="badge badge-red">!</span>}
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        {online ? (
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
                      <td className="py-3 px-5 text-gray-600 text-xs whitespace-nowrap">{formatDate(player.verified_at)}</td>
                      <td className="py-3 px-5 text-gray-600 text-xs whitespace-nowrap">{formatDate(player.created_at)}</td>
                      <td className="py-3 px-5">
                        {player.ign && !String(player.id).startsWith('discord-') ? (
                          <button
                            onClick={() => handleUnlink(player)}
                            disabled={actionId === player.id}
                            title="Verknuepfung entfernen (Rollen + Nickname werden zurückgesetzt)"
                            className="text-[11px] px-3 py-1 rounded-md border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                          >
                            {actionId === player.id ? '...' : 'Entverifizieren'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-700">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
