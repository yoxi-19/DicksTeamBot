import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { apiFetch } from '../lib/api.js';

const statusLabels = {
  pending: { text: 'Ausstehend', color: 'badge-yellow' },
  confirmed: { text: 'Bestätigt', color: 'badge-green' },
  failed: { text: 'Fehlgeschlagen', color: 'badge-red' },
  timeout: { text: 'Abgelaufen', color: 'badge-gray' },
  refunding: { text: 'Refund läuft', color: 'badge-yellow' },
  refunded: { text: 'Zurückgezahlt', color: 'badge-gray' },
};

function formatNumber(n) {
  return n?.toLocaleString('de-DE') || '0';
}

function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PaymentsPage() {
  const { payments: livePayments } = useSocket();
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (livePayments && livePayments.length > 0) {
      setPayments(livePayments);
    }
  }, [livePayments]);

  const filtered = payments.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.ign && p.ign.toLowerCase().includes(q)) ||
        (p.discord_id && p.discord_id.includes(q));
    }
    return true;
  });

  const pending = payments.filter((p) => p.status === 'pending').length;
  const confirmed = payments.filter((p) => p.status === 'confirmed').length;
  const totalAmount = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Zahlungen</h1>
        <p className="mt-1 text-sm text-gray-600">Übersicht über alle Zahlungsprozesse.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-glass p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Ausstehend</div>
          <div className="text-2xl font-bold text-yellow-400">{pending}</div>
        </div>
        <div className="card-glass p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Bestätigt</div>
          <div className="text-2xl font-bold text-emerald-400">{confirmed}</div>
        </div>
        <div className="card-glass p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Eingenommen</div>
<div className="text-2xl font-bold text-windsmp-primary">{'$'}{formatNumber(totalAmount)}</div>
        </div>
      </div>

      {/* Filter + Suche */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-windsmp-darker/60 rounded-lg p-1 border border-windsmp-border/30">
          {['all', 'pending', 'confirmed', 'timeout', 'refunded'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-windsmp-primary/20 text-windsmp-primary' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f === 'all' ? 'Alle' : statusLabels[f]?.text || f}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="IGN oder Discord-ID suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm w-64"
        />
      </div>

      {/* Tabelle */}
      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-windsmp-border/30">
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">IGN</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">Discord</th>
                <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">Betrag</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">Empfänger</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">Erstellt</th>
                <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">Bestätigt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-600">Keine Zahlungen gefunden.</td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const st = statusLabels[p.status] || { text: p.status, color: 'badge-gray' };
                  return (
                    <tr key={p.id} className="border-b border-windsmp-border/20 hover:bg-windsmp-primary/[0.03] transition-colors">
                      <td className="px-4 py-3 font-mono text-gray-200">{p.ign || '–'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.discord_id || '–'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">{'$'}{formatNumber(p.amount)}</td>
                      <td className="px-4 py-3 text-gray-400">{p.recipient || '–'}</td>
                      <td className="px-4 py-3"><span className={`badge ${st.color}`}>{st.text}</span></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(p.created_at)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(p.confirmed_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
