/**
 * KPI карточка в стиле Neon Dark Dashboard
 */

import NeonCard from './NeonCard';

export default function StatCard({ title, value, hint, tone = 'default', icon = null, className = '' }) {
  const toneClass =
    tone === 'success'
      ? 'text-neon-success'
      : tone === 'danger'
        ? 'text-neon-danger'
        : tone === 'warn'
          ? 'text-neon-warn'
          : 'text-neon-text';

  return (
    <NeonCard className={`min-h-[112px] ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.08em] text-neon-muted">{title}</div>
          <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
          {hint ? <div className="mt-1 text-xs text-neon-muted">{hint}</div> : null}
        </div>
        {icon ? <div className="text-neon-accent/90">{icon}</div> : null}
      </div>
    </NeonCard>
  );
}
