/**
 * Финансовый модуль: БДР и БДДС на 2026 год
 * Таблица план/факт по месяцам, редактирование плановых значений, экспорт в CSV
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const MONTH_LABELS = {
  '2026-01': 'Янв', '2026-02': 'Фев', '2026-03': 'Мар', '2026-04': 'Апр',
  '2026-05': 'Май', '2026-06': 'Июн', '2026-07': 'Июл', '2026-08': 'Авг',
  '2026-09': 'Сен', '2026-10': 'Окт', '2026-11': 'Ноя', '2026-12': 'Дек',
};

function formatNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function Finance2026() {
  const { user } = useAuth();
  const [tab, setTab] = useState('BDR');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const fn = tab === 'BDR' ? api.finance.bdr2026 : api.finance.bdds2026;
      const d = await fn();
      setData(d);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tab]);

  const handlePlanChange = async (categoryId, month, value) => {
    if (!canEdit || saving) return;
    const num = parseFloat(String(value).replace(/\s/g, '').replace(',', '.')) || 0;
    setSaving(true);
    try {
      await api.finance.updatePlan({
        type: tab,
        category_id: categoryId,
        month,
        planned_amount: num,
      });
      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        const cat = next.categories.find((c) => c.category_id === categoryId);
        if (cat) {
          cat.months[month] = { ...cat.months[month], planned_amount: num };
          cat.row_planned_total = Object.values(cat.months).reduce((s, m) => s + (m.planned_amount || 0), 0);
        }
        next.totals.planned[month] = next.categories.reduce(
          (s, c) => s + (c.months[month]?.planned_amount || 0),
          0
        );
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [];
    const header = ['Категория', ...data.months.map((m) => MONTH_LABELS[m] || m), 'Итого план', 'Итого факт'];
    rows.push(header.join(';'));
    for (const cat of data.categories) {
      const cells = [
        cat.category_name,
        ...data.months.map((m) => formatNum(cat.months[m]?.planned_amount)),
        formatNum(cat.row_planned_total),
        formatNum(cat.row_fact_total),
      ];
      rows.push(cells.join(';'));
    }
    const totalsRow = [
      'Итого',
      ...data.months.map((m) => formatNum(data.totals.planned[m])),
      formatNum(Object.values(data.totals.planned).reduce((a, b) => a + b, 0)),
      formatNum(Object.values(data.totals.fact).reduce((a, b) => a + b, 0)),
    ];
    rows.push(totalsRow.join(';'));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}_2026.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Финансы 2026</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3 disabled:opacity-50"
          >
            Экспорт CSV
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('BDR')}
          className={`px-4 py-2 rounded-lg ${tab === 'BDR' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'}`}
        >
          БДР 2026
        </button>
        <button
          type="button"
          onClick={() => setTab('BDDS')}
          className={`px-4 py-2 rounded-lg ${tab === 'BDDS' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'}`}
        >
          БДДС 2026
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="w-full bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25">
            <thead>
              <tr className="border-b border-white/20 dark:border-white/20">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 min-w-[160px]">
                  Категория
                </th>
                {data.months.map((m) => (
                  <th key={m} className="text-center px-2 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 min-w-[90px]">
                    {MONTH_LABELS[m] || m}
                  </th>
                ))}
                <th className="text-center px-2 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 min-w-[90px]">
                  Итого
                </th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat) => (
                <tr key={cat.category_id} className="border-b border-white/15 dark:border-white/15">
                  <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text font-medium">
                    {cat.category_name}
                  </td>
                  {data.months.map((m) => (
                    <td key={m} className="px-2 py-1">
                      <div className="flex flex-col gap-0.5">
                        {canEdit ? (
                          <input
                            key={`${cat.category_id}-${m}-${cat.months[m]?.planned_amount}`}
                            type="text"
                            defaultValue={cat.months[m]?.planned_amount ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value;
                              handlePlanChange(cat.category_id, m, v);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.target.blur();
                              }
                            }}
                            className="w-full px-2 py-1 text-sm rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                          />
                        ) : (
                          <span className="text-sm text-[#ECECEC]/90 dark:text-dark-text/80">
                            {formatNum(cat.months[m]?.planned_amount)}
                          </span>
                        )}
                        <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                          факт: {formatNum(cat.months[m]?.fact_amount)}
                        </span>
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center text-sm">
                    <span className="text-[#ECECEC]/90 dark:text-dark-text/80">{formatNum(cat.row_planned_total)}</span>
                    <br />
                    <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                      факт: {formatNum(cat.row_fact_total)}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-white/25 dark:border-white/25 bg-accent-2/50 dark:bg-dark-800 font-medium">
                <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">Итого</td>
                {data.months.map((m) => (
                  <td key={m} className="px-2 py-2 text-center text-sm text-[#ECECEC]/90 dark:text-dark-text/80">
                    {formatNum(data.totals.planned[m])}
                    <br />
                    <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                      факт: {formatNum(data.totals.fact[m])}
                    </span>
                  </td>
                ))}
                <td className="px-2 py-2 text-center text-sm">
                  {formatNum(Object.values(data.totals.planned).reduce((a, b) => a + b, 0))}
                  <br />
                  <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                    факт: {formatNum(Object.values(data.totals.fact).reduce((a, b) => a + b, 0))}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Нет данных</div>
      )}
    </div>
  );
}
