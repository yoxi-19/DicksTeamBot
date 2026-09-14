import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const sections = [
  { title: 'Discord-Rollen', description: 'Leer lassen, um eine automatische Rollenzuweisung auszuschalten.', fields: [['roleVerified', 'Verifiziert'], ['roleTeam', 'Team'], ['roleJoin', 'Beitrittsanfrage'], ['roleAdmin', 'Admin']] },
  { title: 'Discord-Kanäle', description: 'Discord-Channel-IDs für Panels und Protokolle.', fields: [['channelLogs', 'Logs'], ['channelVerify', 'Verifizierung'], ['channelTeam', 'Team']] },
  { title: 'Verifizierung', description: 'Code-Länge, Gültigkeit und der Hinweis für Spieler.', fields: [['verify.codeLength', 'Code-Länge', 'number'], ['verify.codeTtlMs', 'Gültigkeit (ms)', 'number'], ['verify.verifyCommand', 'Anweisung']] },
  { title: 'Timeouts', description: 'Zeitwerte werden in Millisekunden gespeichert.', fields: [['team.inviteTtlMs', 'Einladung gültig (ms)', 'number'], ['timeouts.verifyCooldownMs', 'Verify-Cooldown (ms)', 'number'], ['timeouts.buttonTtlMs', 'Button-Timeout (ms)', 'number']] },
];
const colorFields = ['primary', 'secondary', 'success', 'error', 'warning', 'info'];
const readPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
function writePath(object, path, value) {
  const keys = path.split('.'); const next = structuredClone(object); let target = next;
  keys.slice(0, -1).forEach((key) => { target[key] = { ...target[key] }; target = target[key]; });
  target[keys.at(-1)] = value; return next;
}

export default function SettingsPage() {
  const { token } = useAuth();
  const [settings, setSettings] = useState(null); const [draft, setDraft] = useState(null);
  const [state, setState] = useState({ loading: true, saving: false, message: null });
  useEffect(() => { apiFetch('/api/settings', { token }).then((data) => { setSettings(data); setDraft(data); }).catch((error) => setState((previous) => ({ ...previous, message: { type: 'error', text: error.message } }))).finally(() => setState((previous) => ({ ...previous, loading: false }))); }, [token]);
  const change = (path, value, type = 'text') => setDraft((previous) => writePath(previous, path, type === 'number' && value !== '' ? Number(value) : value));
  const save = async () => { setState({ loading: false, saving: true, message: null }); try { const result = await apiFetch('/api/settings', { method: 'PUT', token, body: draft }); setSettings(result.settings); setDraft(result.settings); setState({ loading: false, saving: false, message: { type: 'success', text: 'Einstellungen gespeichert.' } }); } catch (error) { setState({ loading: false, saving: false, message: { type: 'error', text: error.message } }); } };
  if (state.loading) return <div className="py-20 text-center text-sm text-gray-500">Einstellungen werden geladen …</div>;
  if (!draft) return <div className="py-20 text-center text-sm text-red-400">Einstellungen konnten nicht geladen werden.</div>;
  const changed = JSON.stringify(settings) !== JSON.stringify(draft);
  return <div className="space-y-6 max-w-5xl"><div className="flex flex-wrap gap-4 items-end justify-between"><div><h1 className="text-2xl font-bold text-gray-100">Einstellungen</h1><p className="mt-1 text-sm text-gray-600">Konfiguration für Discord, Minecraft und Automationen.</p></div><button onClick={save} disabled={!changed || state.saving} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">{state.saving ? 'Speichern …' : 'Änderungen speichern'}</button></div>{state.message && <div className={`rounded-xl border px-4 py-3 text-sm ${state.message.type === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-400'}`}>{state.message.text}</div>}{sections.map((section) => <section key={section.title} className="card-glass"><h2 className="text-base font-semibold text-gray-200">{section.title}</h2><p className="mt-1 mb-5 text-xs text-gray-600">{section.description}</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{section.fields.map(([path, label, type = 'text']) => <label key={path} className="block"><span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</span><input type={type} value={readPath(draft, path) ?? ''} onChange={(event) => change(path, event.target.value, type)} className="input-field w-full text-sm" /></label>)}</div></section>)}<section className="card-glass"><h2 className="text-base font-semibold text-gray-200">Farben</h2><p className="mt-1 mb-5 text-xs text-gray-600">Hex-Werte ohne #, zum Beispiel AEC6CF.</p><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{colorFields.map((key) => <label key={key} className="block"><span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-gray-500">{key}</span><div className="flex gap-2"><span className="mt-2 text-gray-500">#</span><input value={draft.colors?.[key] ?? ''} onChange={(event) => change(`colors.${key}`, event.target.value.replace('#', '').toUpperCase())} maxLength={6} className="input-field min-w-0 flex-1 text-sm font-mono" /><span className="h-10 w-10 rounded-lg border border-white/10" style={{ backgroundColor: `#${draft.colors?.[key] || '000000'}` }} /></div></label>)}</div></section></div>;
}
