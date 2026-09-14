export default function StatCard({ title, value, icon, color = 'primary', subtitle = null, progress = null }) {
  const colorMap = {
    primary: {
      text: 'text-windsmp-primary',
      bg: 'bg-windsmp-primary/10',
      border: 'border-windsmp-primary/15',
      progress: 'bg-windsmp-primary/40',
      glow: 'shadow-[0_0_15px_rgba(174,198,207,0.08)]',
    },
    green: {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/15',
      progress: 'bg-emerald-400/40',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.08)]',
    },
    yellow: {
      text: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/15',
      progress: 'bg-amber-400/40',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.08)]',
    },
    red: {
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/15',
      progress: 'bg-red-400/40',
      glow: 'shadow-[0_0_15px_rgba(239,68,68,0.08)]',
    },
    blue: {
      text: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/15',
      progress: 'bg-sky-400/40',
      glow: 'shadow-[0_0_15px_rgba(14,165,233,0.08)]',
    },
  };

  const c = colorMap[color] || colorMap.primary;

  return (
    <div className={`card-hover group ${c.glow}`}>
      <div className="flex items-start gap-4">
        {icon && (
          <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
            {typeof icon === 'string' ? (
              <span className={`text-lg ${c.text}`}>{icon}</span>
            ) : (
              <span className={c.text}>{icon}</span>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-bold mt-0.5 ${c.text}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-600 mt-0.5 truncate">{subtitle}</p>}
          {progress !== null && (
            <div className="mt-2.5 h-1.5 bg-windsmp-darker rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${c.progress} transition-all duration-700 ease-out`}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
