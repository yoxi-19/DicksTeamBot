import { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import StatCard from '../components/StatCard.jsx';

const INITIAL_SHOW = 20;

const icons = {
  chat: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
  ),
  pickaxe: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
    </svg>
  ),
  clock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  disk: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  ),
  clipboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  ),
};

export default function OverviewPage() {
  const { stats, connected } = useSocket();
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');

  const mc = stats?.minecraft || {};
  const sys = stats?.system || {};
  const counts = stats?.counts || {};
  const recentLogs = stats?.recentLogs || [];

  const formatBytes = (bytes) => {
    if (!bytes) return '0 MB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Übersicht</h1>
        <p className="text-sm text-gray-600 mt-1">Echtzeit-Status deines Team DICKS TeamBots</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Discord"
          value={stats?.discord?.online ? 'Online' : 'Offline'}
          icon={icons.chat}
          color={stats?.discord?.online ? 'green' : 'red'}
        />
        <StatCard
          title="Minecraft"
          value={mc.isOnline ? 'Verbunden' : 'Offline'}
          icon={icons.pickaxe}
          color={mc.isOnline ? 'green' : 'red'}
          subtitle={mc.isOnline ? `${mc.username}@${mc.host}:${mc.port}` : ''}
        />
        <StatCard
          title="Uptime"
          value={formatUptime(sys.uptime)}
          icon={icons.clock}
          color="blue"
        />
        <StatCard
          title="RAM"
          value={formatBytes(sys.ramHeapUsed)}
          icon={icons.disk}
          color="yellow"
          subtitle={`von ${formatBytes(sys.ramHeapTotal)}`}
          progress={sys.ramHeapTotal ? (sys.ramHeapUsed / sys.ramHeapTotal) * 100 : 0}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Spieler"
          value={counts.totalUsers || 0}
          icon={icons.users}
          color="primary"
        />
        <StatCard
          title="Verifiziert"
          value={counts.verified || 0}
          icon={icons.check}
          color="green"
        />
        <StatCard
          title="Team"
          value={counts.teamMembers || 0}
          icon={icons.shield}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-glass">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Minecraft-Status</h2>
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium ${
              mc.isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                : 'bg-red-500/10 text-red-400 border border-red-500/15'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${mc.isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {mc.isOnline ? 'Verbunden' : 'Offline'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-windsmp-darker/50 rounded-xl p-3 text-center border border-windsmp-border/20">
                <p className="text-lg font-bold text-gray-100">{mc.playerCount || 0}</p>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Spieler</p>
              </div>
              <div className="bg-windsmp-darker/50 rounded-xl p-3 text-center border border-windsmp-border/20">
                <p className="text-lg font-bold text-gray-100">{mc.ping || 0}<span className="text-xs text-gray-600">ms</span></p>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Ping</p>
              </div>
              <div className="bg-windsmp-darker/50 rounded-xl p-3 text-center border border-windsmp-border/20">
                <p className="text-lg font-bold text-gray-100">{mc.tps || 20}</p>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">TPS</p>
              </div>
            </div>

            {mc.onlinePlayers && mc.onlinePlayers.length > 0 && (() => {
              const allPlayers = mc.onlinePlayers;
              const filtered = playerSearch
                ? allPlayers.filter(n => n.toLowerCase().includes(playerSearch.toLowerCase()))
                : allPlayers;
              const visible = showAllPlayers ? filtered : filtered.slice(0, INITIAL_SHOW);
              const hiddenCount = filtered.length - INITIAL_SHOW;

              return (
                <div className="pt-3 border-t border-windsmp-border/30">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">Spieler im Spiel ({allPlayers.length})</p>
                    {allPlayers.length > INITIAL_SHOW && (
                      <input
                        type="text"
                        value={playerSearch}
                        onChange={(e) => setPlayerSearch(e.target.value)}
                        placeholder="Suchen..."
                        className="text-xs bg-windsmp-darker/80 border border-windsmp-border/40 rounded-lg px-2.5 py-1 w-28 focus:outline-none focus:border-windsmp-primary/40 transition-colors"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visible.map((name) => (
                      <span key={name} className="badge-blue">{name}</span>
                    ))}
                  </div>
                  {allPlayers.length > INITIAL_SHOW && (
                    <button
                      onClick={() => setShowAllPlayers(!showAllPlayers)}
                      className="text-xs text-windsmp-primary/80 hover:text-windsmp-primary mt-3 transition-colors"
                    >
                      {showAllPlayers
                        ? 'Weniger anzeigen'
                        : hiddenCount > 0 && playerSearch
                          ? `Alle ${filtered.length} Suchergebnisse zeigen`
                          : `+${hiddenCount} weitere Spieler anzeigen`}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="card-glass">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-5">Letzte Logs</h2>
          {recentLogs.length === 0 ? (
            <div className="text-center py-10">
              <svg className="w-8 h-8 text-gray-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <p className="text-gray-600 text-sm">Keine Logs vorhanden.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {recentLogs.map((log, i) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm p-2.5 rounded-xl hover:bg-white/[0.02] transition-colors animate-fade-in"
                  style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
                >
                  <span className={`badge text-[10px] shrink-0 mt-0.5 ${
                    log.category === 'error' ? 'badge-red' :
                    log.category === 'verify' ? 'badge-green' :
                    log.category === 'team' ? 'badge-blue' :
                    log.category === 'payment' ? 'badge-yellow' :
                    'badge-gray'
                  }`}>
                    {log.category}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-300 truncate">{log.title}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{new Date(log.created_at).toLocaleString('de-DE')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
