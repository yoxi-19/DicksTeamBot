import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

function MemberBadges({ member, liveByDiscord, ownerOfRank }) {
  const live = (member.discord_id && liveByDiscord[member.discord_id]) || { ranks: [], ownerRanks: [] };
  const dbRank = /^\d+$/.test(String(member.team || '')) ? Number(member.team) : null;
  const shownRank = live.ranks.length === 1 ? live.ranks[0] : dbRank;
  // Eine Owner-Rolle allein ist nur ein Discord-Signal. Das Dashboard zeigt
  // Owner erst, wenn der Slot im System explizit diesem Mitglied zugeordnet ist.
  const isOwner = ownerOfRank;
  if (!shownRank && !isOwner) return null;
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      {shownRank && <span className="badge badge-gray">Team {shownRank}</span>}
      {isOwner && <span className="badge badge-yellow">Owner</span>}
    </div>
  );
}

export default function TeamPage() {
  const { applications, players } = useSocket();
  const { token } = useAuth();
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  const [rankConfig, setRankConfig] = useState({ count: 5, owners: {} });
  const [rankCheck, setRankCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const loadRankConfig = useCallback(async () => {
    try {
      const data = await apiFetch('/api/settings', { token });
      setRankConfig({
        count: Math.min(10, Math.max(1, Number(data?.teamRanks?.count) || 5)),
        owners: data?.teamRanks?.owners || {},
      });
    } catch {
      // Die Teamansicht bleibt mit der zuletzt bekannten Konfiguration nutzbar.
    }
  }, [token]);

  useEffect(() => {
    loadRankConfig();
  }, [loadRankConfig]);

  const handleRankCheck = async (fresh = false) => {
    setChecking(true);
    setCheckError('');
    try {
      const data = await apiFetch(`/api/discord/rank-check${fresh ? '?fresh=1' : ''}`, { token });
      setRankCheck(Array.isArray(data) ? data : []);
      // Owner-Slots werden serverseitig aus den Rollen erkannt – danach neu laden
      await loadRankConfig();
    } catch (err) {
      setCheckError(err.message || 'Prüfung fehlgeschlagen.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    handleRankCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSyncRoles = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const result = await apiFetch('/api/discord/sync-roles', { method: 'POST', token });
      setSyncResult(`${result.synced} Nutzer synchronisiert${result.errors > 0 ? `, ${result.errors} Fehler` : ''}, ${result.detectedOwners} Owner erkannt.`);
      await loadRankConfig();
      await handleRankCheck();
    } catch (err) {
      setSyncResult(`Fehler: ${err.message || 'Sync fehlgeschlagen.'}`);
    } finally {
      setSyncing(false);
    }
  };

  const teams = useMemo(() => {
    const members = (players || []).filter((p) => p.status === 'team');
    return Array.from({ length: rankConfig.count }, (_, i) => i + 1).map((rank) => {
      const ownerId = rankConfig.owners?.[String(rank)] || null;
      const owner = ownerId ? members.find((m) => m.discord_id === ownerId) || { discord_id: ownerId, ign: null } : null;
      return {
        rank,
        owner,
        members: members.filter((m) => String(m.team || '') === String(rank)),
      };
    });
  }, [players, rankConfig]);

  const checkByRank = useMemo(() => {
    const map = {};
    for (const c of rankCheck || []) map[c.rank] = c;
    return map;
  }, [rankCheck]);

  // Echte Discord-Rollen je User (aus dem Rank-Check)
  const liveByDiscord = useMemo(() => {
    const map = {};
    for (const c of rankCheck || []) {
      for (const id of c.liveIds || []) {
        (map[id] ??= { ranks: [], ownerRanks: [] }).ranks.push(c.rank);
      }
      for (const id of c.ownerLiveIds || []) {
        (map[id] ??= { ranks: [], ownerRanks: [] }).ownerRanks.push(c.rank);
      }
    }
    return map;
  }, [rankCheck]);

  const pending = (applications || []).filter((a) => a.status === 'pending');
  const teamMembers = (players || []).filter((p) => p.status === 'team' || p.role === 'team');

  const filteredMembers = search
    ? teamMembers.filter((m) => m.ign?.toLowerCase().includes(search.toLowerCase()) || m.discord_id?.includes(search))
    : teamMembers;

  const handleReview = async (id, decision) => {
    setActionLoading(id);
    try {
      await apiFetch(`/api/applications/${id}/review`, {
        method: 'POST',
        body: { decision },
        token,
      });
    } catch (err) {
      console.error('Review error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Teams-Übersicht */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Teams</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">{rankConfig.count} Teams</span>
            <button
              onClick={() => handleRankCheck(true)}
              disabled={checking || syncing}
              title="Vergleicht DB-Teams live mit den echten Discord-Rollen"
              className="text-xs px-3 py-1.5 rounded-lg border border-windsmp-primary/25 text-windsmp-primary hover:bg-windsmp-primary/10 disabled:opacity-40 transition-all"
            >
              {checking ? 'Prüfe …' : 'Neu prüfen'}
            </button>
            <button
              onClick={handleSyncRoles}
              disabled={checking || syncing}
              title="Gleicht alle Discord-Rollen mit der DB ab und entfernt überflüssige Rollen"
              className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-all"
            >
              {syncing ? 'Angleiche …' : 'Rollen angleichen'}
            </button>
          </div>
        </div>
        {checkError && <p className="text-xs text-red-400">{checkError}</p>}
        {syncResult && <p className="text-xs text-emerald-400">{syncResult}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((team) => {
            const check = checkByRank[team.rank];
            const missingNames = (check?.missing || []).map((m) => m.ign || m.id);
            const extraNotes = (check?.extra || []).map((e) => {
              if (!e.ign) return `${e.name} (unbekannt)`;
              const statusLabel = { verified: 'verifiziert', waiting_payment: 'Zahlung offen', left: 'ausgetreten', unverified: 'nicht verifiziert', team: 'Team' }[e.status] || e.status;
              return `${e.name} (${e.ign}, ${statusLabel})`;
            });
            const ownerProblem = check && check.ownerId && check.ownerRoleId && check.ownerHasRole === false;
            return (
              <div key={team.rank} className="card-glass p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-semibold text-gray-200">Team {team.rank}</h3>
                  <span className="text-xs text-gray-600">{team.members.length} Mitglieder</span>
                </div>
                {check?.roleName && <p className="text-[11px] text-gray-600 mb-2">Rolle: {check.roleName}</p>}
                <div className="mb-3 text-xs">
                  {team.owner ? (
                    <span className="text-gray-400">Owner: <span className="text-amber-400 font-medium">{team.owner.ign || team.owner.discord_id}</span></span>
                  ) : (
                    <span className="text-gray-600">Owner: –</span>
                  )}
                </div>
                {team.members.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {team.members.map((m) => (
                      <span key={m.discord_id || m.ign} className={`badge ${team.owner && m.discord_id === team.owner.discord_id ? 'badge-yellow' : 'badge-gray'}`}>
                        {m.ign || m.discord_id}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-700">Keine Mitglieder.</p>
                )}
                {check && (
                  <div className="mt-3 pt-2 border-t border-white/5 text-[11px]">
                    <p className="text-gray-500">Discord-Rolle: {check.liveCount} Inhaber</p>
                    {missingNames.length > 0 && (
                      <p className="text-amber-400 mt-1">Fehlt: {missingNames.join(', ')}</p>
                    )}
                    {extraNotes.length > 0 && (
                      <p className="text-amber-400 mt-1">Zu viel: {extraNotes.join(', ')}</p>
                    )}
                    {ownerProblem && (
                      <p className="text-amber-400 mt-1">Owner hat die Owner-Rolle nicht.</p>
                    )}
                    {missingNames.length === 0 && extraNotes.length === 0 && !ownerProblem && check.roleId && (
                      <p className="text-emerald-400 mt-1">Stimmt überein.</p>
                    )}
                    {!check.roleId && (
                      <p className="text-gray-600 mt-1">Keine Rolle konfiguriert.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending Join-Requests */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Ausstehende Beitritte</h2>
            </div>
            <span className="badge badge-yellow">{pending.length}</span>
          </div>
          <div className="space-y-2">
            {pending.map((app, i) => (
              <div
                key={app.id}
                className="card-glass p-4 flex items-center justify-between animate-fade-in"
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium text-gray-200">{app.ign}</span>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      {app.discord_id && <span>Discord: {app.discord_id} · </span>}
                      {new Date(app.created_at).toLocaleString('de-DE')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReview(app.id, 'accepted')}
                    disabled={actionLoading === app.id}
                    className="btn-success text-xs py-1.5 px-3 disabled:opacity-50"
                  >
                    {actionLoading === app.id ? '...' : 'Annehmen'}
                  </button>
                  <button
                    onClick={() => handleReview(app.id, 'rejected')}
                    disabled={actionLoading === app.id}
                    className="btn-danger text-xs py-1.5 px-3 disabled:opacity-50"
                  >
                    {actionLoading === app.id ? '...' : 'Ablehnen'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team-Mitglieder */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Team-Mitglieder</h2>
          <span className="text-xs text-gray-600">{filteredMembers.length} Spieler</span>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Spieler suchen..."
          className="input-field w-full max-w-xs text-sm py-2"
        />

        {filteredMembers.length === 0 ? (
          <div className="card-glass text-center py-12">
            <svg className="w-8 h-8 text-gray-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            <p className="text-gray-600 text-sm">
              {search ? 'Keine Ergebnisse.' : 'Keine Team-Mitglieder gefunden.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredMembers.map((member, i) => (
              <div
                key={member.discord_id || member.ign || i}
                className="card-hover p-4 animate-fade-in"
                style={{ animationDelay: `${i * 20}ms`, animationFillMode: 'both' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-windsmp-primary/10 border border-windsmp-primary/15 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-windsmp-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-200 truncate">{member.ign || 'Unbekannt'}</p>
                    {member.discord_id && (
                      <p className="text-[11px] text-gray-600 truncate">{member.discord_id}</p>
                    )}
                  </div>
                  <MemberBadges
                    member={member}
                    liveByDiscord={liveByDiscord}
                    ownerOfRank={Object.values(rankConfig.owners || {}).includes(member.discord_id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
