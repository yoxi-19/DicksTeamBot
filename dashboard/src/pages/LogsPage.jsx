import { useState, useMemo } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const categoryLabels = {
  all: 'Alle',
  verify: 'Verifizierung',
  team: 'Team',
  payment: 'Zahlung',
  system: 'System',
  error: 'Fehler',
  command: 'Command',
};

const categoryColors = {
  verify: 'badge-green',
  team: 'badge-blue',
  payment: 'badge-yellow',
  system: 'badge-gray',
  error: 'badge-red',
  command: 'badge-blue',
};

export default function LogsPage() {
  const { logs } = useSocket();
  const { token } = useAuth();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = [...(logs || [])];
    if (filter !== 'all') {
      list = list.filter((l) => l.category === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          (l.title && l.title.toLowerCase().includes(q)) ||
          (l.description && l.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [logs, filter, search]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('category', filter);
    window.open(`/api/logs/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Logs</h1>
          <p className="text-sm text-gray-600 mt-0.5">{filtered.length} Einträge</p>
        </div>
        <button onClick={handleExport} className="btn-primary text-sm">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exportieren
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Logs durchsuchen..."
          className="input-field flex-1 max-w-sm text-sm"
        />
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(categoryLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                filter === key
                  ? key === 'all'
                    ? 'bg-windsmp-primary/15 text-windsmp-primary border-windsmp-primary/25'
                    : ''
                  : 'bg-transparent text-gray-500 border-windsmp-border/30 hover:text-gray-300 hover:border-windsmp-border/60'
              } ${filter === key && key !== 'all' ? '' : ''}`}
              style={filter === key && key !== 'all' ? undefined : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      {filtered.length === 0 ? (
        <div className="card-glass text-center py-16">
          <svg className="w-10 h-10 text-gray-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-gray-600 text-sm">Keine Logs gefunden.</p>
        </div>
      ) : (
        <div className="card-glass !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-windsmp-border/30">
                <th className="text-left py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Zeit</th>
                <th className="text-left py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Kategorie</th>
                <th className="text-left py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Titel</th>
                <th className="text-left py-3 px-5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Beschreibung</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => (
                <tr
                  key={log.id}
                  className="table-row animate-fade-in"
                  style={{ animationDelay: `${i * 20}ms`, animationFillMode: 'both' }}
                >
                  <td className="py-3 px-5 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('de-DE')}
                  </td>
                  <td className="py-3 px-5">
                    <span className={`${categoryColors[log.category] || 'badge-gray'}`}>
                      {log.category}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-gray-300 font-medium">{log.title}</td>
                  <td className="py-3 px-5 text-gray-500 text-xs max-w-md truncate">{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
