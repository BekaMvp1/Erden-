/**
 * Дашборд производства — один экран для контроля завода.
 * KPI, табло этажей, горящие заказы, pipeline по этапам.
 * Клик по блокам ведёт на соответствующие списки (фильтры).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NeonButton } from '../components/ui';
import { api } from '../api';
import { NeonCard } from '../components/ui';

const STAGE_LINKS = {
  procurement: { path: '/procurement', label: 'Закуп' },
  cutting: { path: '/cutting', label: 'Раскрой' },
  sewing: { path: '/sewing', label: 'Пошив' },
  qc: { path: '/qc', label: 'ОТК' },
  warehouse: { path: '/warehouse', label: 'Склад' },
  shipping: { path: '/shipments', label: 'Отгрузка' },
};

const STAGE_ORDER = ['procurement', 'cutting', 'sewing', 'qc', 'warehouse', 'shipping'];

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch {
    return value;
  }
}

export default function ProductionDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await api.dashboard.get();
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Ошибка загрузки дашборда');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="min-h-full p-4 text-neon-text">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-xl font-semibold text-neon-text">Дашборд производства</h1>
          <Link to="/board">
            <NeonButton variant="secondary" className="shrink-0">Вернуться в панель заказов</NeonButton>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl bg-slate-800/50 dark:bg-dark-800 h-20 animate-pulse" />
          ))}
        </div>
        <div className="text-neon-muted">Загрузка...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="min-h-full p-4 text-neon-text">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-xl font-semibold">Дашборд производства</h1>
          <Link to="/board">
            <NeonButton variant="secondary" className="shrink-0">Вернуться в панель заказов</NeonButton>
          </Link>
        </div>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">{error}</div>
      </section>
    );
  }

  const kpi = data?.kpi || {};
  const floor_stats = data?.floor_stats || [];
  const hot_orders = data?.hot_orders || [];
  const stage_counts = data?.stage_counts || {};

  return (
    <section className="min-h-full p-3 md:p-4 text-neon-text overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold text-neon-text">Дашборд производства</h1>
        <Link to="/board">
          <NeonButton variant="secondary" className="shrink-0">
            Вернуться в панель заказов
          </NeonButton>
        </Link>
      </div>

      {/* 1) Верхние KPI — 6 карточек */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Link
          to="/board"
          className="rounded-xl bg-slate-800/60 dark:bg-dark-800 border border-white/10 p-4 hover:border-neon-accent/50 hover:bg-slate-800/80 transition-colors"
        >
          <div className="text-xs uppercase tracking-wide text-neon-muted">Заказы в работе</div>
          <div className="text-2xl font-bold text-neon-text mt-1">{kpi.orders_in_progress ?? 0}</div>
        </Link>
        <Link
          to="/board?filter=overdue"
          className="rounded-xl bg-slate-800/60 dark:bg-dark-800 border border-white/10 p-4 hover:border-neon-accent/50 hover:bg-slate-800/80 transition-colors"
        >
          <div className="text-xs uppercase tracking-wide text-neon-muted">Просроченные</div>
          <div className={`text-2xl font-bold mt-1 ${(kpi.overdue ?? 0) > 0 ? 'text-red-400' : 'text-neon-text'}`}>
            {kpi.overdue ?? 0}
          </div>
        </Link>
        <Link
          to="/sewing"
          className="rounded-xl bg-slate-800/60 dark:bg-dark-800 border border-white/10 p-4 hover:border-neon-accent/50 hover:bg-slate-800/80 transition-colors"
        >
          <div className="text-xs uppercase tracking-wide text-neon-muted">Сегодня: План / Факт</div>
          <div className="text-lg font-bold text-neon-text mt-1">
            {kpi.today_plan ?? 0} / {kpi.today_fact ?? 0}
          </div>
        </Link>
        <Link
          to="/qc"
          className="rounded-xl bg-slate-800/60 dark:bg-dark-800 border border-white/10 p-4 hover:border-neon-accent/50 hover:bg-slate-800/80 transition-colors"
        >
          <div className="text-xs uppercase tracking-wide text-neon-muted">ОТК ожидают</div>
          <div className="text-2xl font-bold text-neon-text mt-1">{kpi.qc_pending ?? 0}</div>
        </Link>
        <Link
          to="/warehouse"
          className="rounded-xl bg-slate-800/60 dark:bg-dark-800 border border-white/10 p-4 hover:border-neon-accent/50 hover:bg-slate-800/80 transition-colors"
        >
          <div className="text-xs uppercase tracking-wide text-neon-muted">На складе готово</div>
          <div className="text-2xl font-bold text-neon-text mt-1">{kpi.warehouse_ready ?? 0}</div>
        </Link>
        <Link
          to="/shipments"
          className="rounded-xl bg-slate-800/60 dark:bg-dark-800 border border-white/10 p-4 hover:border-neon-accent/50 hover:bg-slate-800/80 transition-colors"
        >
          <div className="text-xs uppercase tracking-wide text-neon-muted">К отгрузке сегодня/завтра</div>
          <div className="text-2xl font-bold text-neon-text mt-1">{kpi.to_ship ?? 0}</div>
        </Link>
      </div>

      {/* 2) Табло этажей — 4 строки */}
      <NeonCard className="mb-6 overflow-hidden">
        <div className="text-sm font-semibold text-neon-muted mb-3 px-1">Табло этажей</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-neon-muted">
                <th className="py-2 pr-4">Этаж</th>
                <th className="py-2 pr-4">План сегодня</th>
                <th className="py-2 pr-4">Факт сегодня</th>
                <th className="py-2 pr-4">% выполнения</th>
                <th className="py-2">Остаток на неделю</th>
              </tr>
            </thead>
            <tbody>
              {floor_stats.map((row) => (
                <tr key={row.floor_id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-4 font-medium">{row.floor_name}</td>
                  <td className="py-2 pr-4">{row.plan_today ?? 0}</td>
                  <td className="py-2 pr-4">{row.fact_today ?? 0}</td>
                  <td className="py-2 pr-4">
                    <span className={row.percent >= 100 ? 'text-emerald-400' : row.percent >= 50 ? 'text-amber-400' : 'text-red-400'}>
                      {row.percent ?? 0}%
                    </span>
                  </td>
                  <td className="py-2">{row.remainder_week ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NeonCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 3) Горящие заказы — Top 10 */}
        <NeonCard>
          <div className="text-sm font-semibold text-neon-muted mb-3">Горящие заказы (Top 10)</div>
          {hot_orders.length === 0 ? (
            <div className="text-sm text-neon-muted">Нет заказов с дедлайном в ближайшие 3 дня</div>
          ) : (
            <ul className="space-y-2">
              {hot_orders.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/orders/${o.id}`}
                    className={`block rounded-lg border border-white/10 p-2 hover:border-neon-accent/40 hover:bg-white/5 text-sm ${o.is_overdue ? 'border-red-500/30 bg-red-500/10' : ''}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-neon-text truncate flex-1">{o.title || `Заказ #${o.id}`}</span>
                      <span className={`text-xs shrink-0 ${o.is_overdue ? 'text-red-400' : 'text-amber-400'}`}>
                        {formatDate(o.deadline)}
                        {o.is_overdue ? ' (просрочен)' : ''}
                      </span>
                    </div>
                    <div className="text-xs text-neon-muted mt-0.5">{o.client_name} · {o.status_name}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </NeonCard>

        {/* 4) Pipeline по этапам — счётчики */}
        <NeonCard>
          <div className="text-sm font-semibold text-neon-muted mb-3">Pipeline по этапам</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {STAGE_ORDER.map((key) => {
              const conf = STAGE_LINKS[key];
              const count = stage_counts[key] ?? 0;
              return (
                <Link
                  key={key}
                  to={conf.path}
                  className="rounded-xl bg-slate-800/50 dark:bg-dark-800 border border-white/10 p-4 hover:border-neon-accent/50 hover:bg-slate-800/70 transition-colors text-center"
                >
                  <div className="text-xs text-neon-muted uppercase tracking-wide">{conf.label}</div>
                  <div className="text-2xl font-bold text-neon-text mt-1">{count}</div>
                </Link>
              );
            })}
          </div>
        </NeonCard>
      </div>
    </section>
  );
}
