import { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function TeamPage() {
  const { applications, players } = useSocket();
  const { token } = useAuth();
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');

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
                  <div className="min-w-0">
                    <p className="font-medium text-gray-200 truncate">{member.ign || 'Unbekannt'}</p>
                    {member.discord_id && (
                      <p className="text-[11px] text-gray-600 truncate">{member.discord_id}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
