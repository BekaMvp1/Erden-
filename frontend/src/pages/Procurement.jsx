/**
 * Страница закупа (только просмотр)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { NeonCard, NeonInput, NeonSelect } from '../components/ui';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'draft', label: 'Черновик' },
  { value: 'sent', label: 'Отправлено' },
  { value: 'received', label: 'Получено' },
  { value: 'canceled', label: 'Отменено' },
];

export default function Procurement() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    date_from: '',
    date_to: '',
  });

  const loadData = (nextFilters = filters) => {
    setLoading(true);
    api.procurement
      .list(nextFilters)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.procurement
      .list(filters)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => list || [], [list]);
  const getOrderName = (row) => {
    const tzCode = String(row?.tz_code || '').trim();
    const modelName = String(row?.model_name || '').trim();
    return (tzCode && modelName ? `${tzCode} — ${modelName}` : '') || row?.title || tzCode || modelName || '—';
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-neon-text">Закуп</h1>
      </div>
      <NeonCard className="p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px] flex-1">
          <label className="block text-sm text-[#ECECEC]/80 mb-1">Поиск</label>
          <NeonInput
            value={filters.q}
            onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            placeholder="TZ / MODEL / клиент"
          />
        </div>
        <div className="w-[180px]">
          <label className="block text-sm text-[#ECECEC]/80 mb-1">Статус</label>
          <NeonSelect
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value || 'all'} value={s.value}>
                {s.label}
              </option>
            ))}
          </NeonSelect>
        </div>
        <div>
          <label className="block text-sm text-[#ECECEC]/80 mb-1">С даты</label>
          <NeonInput
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm text-[#ECECEC]/80 mb-1">По дату</label>
          <NeonInput
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
          />
        </div>
        <button
          type="button"
          onClick={() => loadData(filters)}
          className="h-10 px-4 rounded-lg bg-accent-1/30 hover:bg-accent-1/40 text-[#ECECEC]"
        >
          Применить
        </button>
      </NeonCard>

      {loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : rows.length === 0 ? (
        <p className="text-[#ECECEC]/80 dark:text-dark-text/80">Нет закупов</p>
      ) : (
        <NeonCard className="rounded-card overflow-hidden overflow-x-auto p-0">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ: TZ — MODEL</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Клиент</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Цвета</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дедлайн закупа</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pr) => (
                <tr
                  key={pr.order_id}
                  onClick={() => navigate(`/orders/${pr.order_id}`)}
                  className="border-b border-white/15 hover:bg-accent-2/30 dark:hover:bg-dark-800 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary-400">
                      {getOrderName(pr)}
                    </div>
                    <div className="text-xs text-[#ECECEC]/60">#{pr.order_id}</div>
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{pr.client_name || '—'}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{pr.colors_summary || '—'}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{pr.procurement?.due_date || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      pr.procurement?.status === 'received' ? 'bg-green-500/20 text-green-400' :
                      pr.procurement?.status === 'draft' ? 'bg-amber-500/20 text-amber-400' :
                      pr.procurement?.status === 'sent' ? 'bg-lime-500/20 text-lime-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {pr.procurement?.status_label || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-primary-400 text-right">
                    {Number(pr.procurement?.total_sum || 0).toFixed(2)} ₽
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </NeonCard>
      )}
    </div>
  );
}
