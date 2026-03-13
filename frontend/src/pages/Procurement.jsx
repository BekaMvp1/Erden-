/**
 * Страница закупа — список заявок + завершение (куплено + цена)
 * План (материал + план) редактируется только в карточке заказа.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { NeonCard, NeonInput, NeonSelect } from '../components/ui';
import ProcurementCompleteModal from '../components/procurement/ProcurementCompleteModal';
import PrintButton from '../components/PrintButton';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'sent', label: 'Отправлено' },
  { value: 'received', label: 'Закуплено' },
];

const STATUS_LABELS = { sent: 'Отправлено', received: 'Закуплено' };

function formatDate(iso) {
  if (!iso) return '—';
  const d = iso.slice(0, 10).split('-');
  return d[2] && d[1] ? `${d[2]}.${d[1]}.${d[0]}` : iso;
}

export default function Procurement() {
  const { user } = useAuth();
  const canEditProcurement = ['admin', 'manager', 'technologist'].includes(user?.role);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', status: '', date_from: '', date_to: '' });
  const [selectedProcurementId, setSelectedProcurementId] = useState(null);

  const loadData = (nextFilters = filters) => {
    setLoading(true);
    api.procurement
      .list(nextFilters)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => list || [], [list]);
  const getOrderName = (row) => {
    const tzCode = String(row?.tz_code || '').trim();
    const modelName = String(row?.model_name || '').trim();
    return (tzCode && modelName ? `${tzCode} — ${modelName}` : '') || row?.title || tzCode || modelName || '—';
  };

  const handleRowClick = (pr) => {
    const pid = pr.procurement_id ?? pr.procurement?.id ?? pr.order_id;
    if (pid) setSelectedProcurementId(pid);
  };

  const handleModalClose = () => {
    setSelectedProcurementId(null);
    loadData(filters);
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-neon-text">Закуп</h1>
        <PrintButton />
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
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">TZ — MODEL</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Клиент</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дедлайн</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Сумма</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pr) => (
                <tr
                  key={pr.order_id}
                  onClick={() => handleRowClick(pr)}
                  className="border-b border-white/15 hover:bg-accent-2/30 dark:hover:bg-dark-800 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary-400">{getOrderName(pr)}</div>
                    <div className="text-xs text-[#ECECEC]/60">{pr.order?.tz_code || pr.Order?.tz_code || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{pr.client_name || '—'}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                    {formatDate(pr.procurement?.due_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        pr.procurement?.status === 'received'
                          ? 'bg-green-500/20 text-green-400'
                          : pr.procurement?.status === 'sent'
                            ? 'bg-lime-500/20 text-lime-400'
                            : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {STATUS_LABELS[pr.procurement?.status] || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-primary-400 text-right">
                    {Number(pr.procurement?.total_sum || 0).toFixed(2)} ₽
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 text-sm">
                    {pr.procurement?.updated_at ? formatDate(pr.procurement.updated_at.slice(0, 10)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </NeonCard>
      )}

      <ProcurementCompleteModal
        open={!!selectedProcurementId}
        procurementId={selectedProcurementId}
        onClose={handleModalClose}
        onSaved={handleModalClose}
        canEdit={canEditProcurement}
      />
    </div>
  );
}
