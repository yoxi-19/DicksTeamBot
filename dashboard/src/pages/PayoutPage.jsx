import { useEffect, useMemo, useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card-glass w-full max-w-md p-6 relative"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-200 transition-colors text-lg leading-none"
          title="Schließen"
        >
          ×
        </button>
        <h2 className="text-lg font-semibold text-gray-100 mb-5">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function PayoutPage() {
  const { socket, stats, logs } = useSocket();
  const { token } = useAuth();
  const [modal, setModal] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [bankRecipient, setBankRecipient] = useState('DicksTeamBank');
  const [withdrawIgn, setWithdrawIgn] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState(null);

  const bankBalance = stats?.minecraft?.bankBalance ?? null;
  const bankBalanceAt = stats?.minecraft?.bankBalanceAt || null;
  const bankOnline = !!stats?.minecraft?.isOnline;

  useEffect(() => {
    apiFetch('/api/settings', { token })
      .then((data) => {
        if (data?.payment?.recipient) setBankRecipient(data.payment.recipient);
      })
      .catch(() => {});
  }, [token]);

  const recentPayouts = useMemo(() => {
    const list = Array.isArray(logs) ? logs : [];
    return list.filter((l) => l.category === 'payment' && /auszahlung/i.test(l.title || '')).slice(0, 10);
  }, [logs]);

  const refreshBalance = () => {
    if (socket) socket.emit('requestBankBalance');
  };

  const parsedDeposit = Number(String(depositAmount).replace(/[^\d]/g, ''));
  const depositValid = Number.isInteger(parsedDeposit) && parsedDeposit > 0;

  const handleWithdraw = async () => {
    const amount = Number(String(withdrawAmount).replace(/[^\d]/g, ''));
    const ign = withdrawIgn.trim();
    if (!ign || !Number.isInteger(amount) || amount <= 0) return;
    setWithdrawing(true);
    setWithdrawResult(null);
    try {
      const result = await apiFetch('/api/payouts/withdraw', {
        method: 'POST',
        token,
        body: { ign, amount },
      });
      setWithdrawResult({
        type: result.delivered ? 'success' : 'warning',
        text: result.delivered
          ? `$${amount.toLocaleString('de-DE')} an ${result.ign} ausgezahlt.`
          : 'Befehl gesendet, Zustellung unklar (Bot kurz getrennt?). Bitte Kontostand im Spiel prüfen!',
      });
      setWithdrawIgn('');
      setWithdrawAmount('');
    } catch (error) {
      setWithdrawResult({ type: 'error', text: error.message || 'Auszahlung fehlgeschlagen.' });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Auszahlung</h1>
        <p className="mt-1 text-sm text-gray-600">Einzahlen per Command, auszahlen per Bot – alles mit Live-Kontostand.</p>
      </div>

      {/* Kontostand */}
      <section className="card-glass">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Kontostand {bankRecipient}</p>
            <p className="text-2xl font-bold text-gray-100 mt-1">
              {bankBalance === null ? '–' : `$${Number(bankBalance).toLocaleString('de-DE')}`}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {!bankOnline ? 'Bot offline' : bankBalanceAt ? `Stand: ${new Date(bankBalanceAt).toLocaleString('de-DE')}` : 'Noch nicht abgefragt – Aktualisieren drücken.'}
            </p>
          </div>
          <button
            onClick={refreshBalance}
            disabled={!bankOnline}
            title="Kontostand jetzt abfragen"
            className="text-xs px-3 py-1.5 rounded-lg border border-windsmp-primary/25 text-windsmp-primary hover:bg-windsmp-primary/10 disabled:opacity-40 transition-all whitespace-nowrap"
          >
            Aktualisieren
          </button>
        </div>
      </section>

      {/* Aktionen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => { setWithdrawResult(null); setModal('deposit'); }} className="card-hover p-6 text-left">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-200">Einzahlen</h2>
          <p className="mt-1 text-xs text-gray-600">Betrag eingeben, Command kopieren, im Spiel überweisen.</p>
        </button>
        <button onClick={() => { setWithdrawResult(null); setModal('withdraw'); }} className="card-hover p-6 text-left">
          <div className="w-10 h-10 rounded-xl bg-windsmp-primary/10 border border-windsmp-primary/15 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-windsmp-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m-7.5 7.5h15" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-200">Auszahlen</h2>
          <p className="mt-1 text-xs text-gray-600">Der Bot überweist per /pay an einen Spieler (max. $10.000.000).</p>
        </button>
      </div>

      {/* Letzte Auszahlungen */}
      <section className="card-glass">
        <h2 className="text-base font-semibold text-gray-200 mb-3">Letzte Auszahlungen</h2>
        {recentPayouts.length === 0 ? (
          <p className="text-sm text-gray-600">Noch keine Auszahlungen protokolliert.</p>
        ) : (
          <div className="space-y-2">
            {recentPayouts.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-3 text-sm">
                <p className="text-gray-300">{l.title}</p>
                <p className="text-xs text-gray-600 whitespace-nowrap">{l.created_at ? new Date(l.created_at).toLocaleString('de-DE') : ''}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal === 'deposit' && (
        <Modal title="Einzahlen" onClose={() => setModal(null)}>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-gray-500">Betrag ($)</span>
            <input
              type="number"
              min={1}
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              placeholder="z. B. 50000"
              className="input-field w-full text-sm"
            />
          </label>
          {depositValid && (
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">Im Spiel ausführen (klicken zum Kopieren)</p>
              <code
                onClick={() => navigator.clipboard?.writeText(`/pay ${bankRecipient} ${parsedDeposit}`).catch(() => {})}
                title="Klicken zum Kopieren"
                className="block cursor-pointer rounded-lg bg-black/40 border border-white/10 px-3 py-2.5 font-mono text-sm text-emerald-300 hover:border-emerald-500/40 transition-colors"
              >
                /pay {bankRecipient} {parsedDeposit}
              </code>
              <p className="mt-3 text-xs text-gray-600">Der Bot erkennt die Zahlung automatisch und schickt die Team-Einladung.</p>
            </div>
          )}
        </Modal>
      )}

      {modal === 'withdraw' && (
        <Modal title="Auszahlen" onClose={() => { if (!withdrawing) setModal(null); }}>
          {!bankOnline && (
            <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Bot ist offline – Auszahlung derzeit nicht möglich.
            </p>
          )}
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-gray-500">Minecraft-Name (IGN)</span>
              <input
                value={withdrawIgn}
                onChange={(event) => setWithdrawIgn(event.target.value)}
                placeholder="z. B. yoxiiiiii"
                disabled={withdrawing}
                className="input-field w-full text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-gray-500">Betrag ($)</span>
              <input
                type="number"
                min={1}
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                placeholder="z. B. 50000"
                disabled={withdrawing}
                className="input-field w-full text-sm"
              />
            </label>
            {withdrawResult && (
              <p className={`rounded-xl border px-4 py-3 text-sm ${
                withdrawResult.type === 'success'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : withdrawResult.type === 'warning'
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                    : 'border-red-500/20 bg-red-500/10 text-red-400'
              }`}>
                {withdrawResult.text}
              </p>
            )}
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !bankOnline || !withdrawIgn.trim() || !withdrawAmount}
              className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {withdrawing ? 'Wird ausgezahlt …' : 'Auszahlen'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
