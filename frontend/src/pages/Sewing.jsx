/**
 * Пошив — единый список по статусу (board API), ввод факта, завершение → ОТК.
 * Статус «В работе» / «Завершено» из sewing_order_floors.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { NeonCard, NeonSelect } from '../components/ui';

function getWeekStart(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  return x.toISOString().slice(0, 10);
}

function getWeekEnd(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? 0 : 7);
  x.setDate(diff);
  return x.toISOString().slice(0, 10);
}

const STATUS_OPTIONS = [
  { key: 'in_progress', label: 'В работе' },
  { key: 'all', label: 'Все' },
  { key: 'done', label: 'Завершено' },
];

const PERIOD_OPTIONS = [
  { key: 'week', label: 'Текущая неделя' },
  { key: 'today', label: 'Сегодня' },
  { key: '7days', label: '7 дней' },
];

const SEWING_FLOORS = [2, 3, 4];

function getPeriodRange(periodKey) {
  const today = new Date().toISOString().slice(0, 10);
  if (periodKey === 'today') return { date_from: today, date_to: today };
  if (periodKey === '7days') {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return { date_from: from.toISOString().slice(0, 10), date_to: today };
  }
  return { date_from: getWeekStart(), date_to: getWeekEnd() };
}

/** Объединить plan_rows и fact_rows по дате в один массив { date, plan_qty, fact_qty } */
function mergePlanFact(planRows, factRows) {
  const byDate = {};
  (planRows || []).forEach((r) => {
    byDate[r.date] = { date: r.date, plan_qty: r.plan_qty ?? 0, fact_qty: 0 };
  });
  (factRows || []).forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, plan_qty: 0, fact_qty: 0 };
    byDate[r.date].fact_qty = r.fact_qty ?? 0;
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

export default function Sewing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order_id') || '';

  const [status, setStatus] = useState('in_progress');
  const [period, setPeriod] = useState('week');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [boardData, setBoardData] = useState({ floors: [], period: {} });
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [factEdit, setFactEdit] = useState({});
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadBoard = useCallback(() => {
    const { date_from, date_to } = getPeriodRange(period);
    setLoading(true);
    setError('');
    api.sewing
      .board({
        date_from,
        date_to,
        status,
        q: debouncedQ || undefined,
        order_id: orderIdParam ? Number(orderIdParam) : undefined,
      })
      .then((res) => {
        setBoardData({ floors: res.floors || [], period: res.period || {} });
      })
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [orderIdParam, period, status, debouncedQ]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const periodRange = boardData.period;

  const handleSaveFact = async (item, date, newActualQty, plannedQty) => {
    const num = Math.max(0, parseInt(newActualQty, 10) || 0);
    const key = `${item.order_id}-${item.floor_id}-${date}`;
    setSavingKey(key);
    setError('');
    try {
      await api.planning.updateDay({
        order_id: item.order_id,
        workshop_id: item.workshop_id,
        date,
        floor_id: item.floor_id,
        planned_qty: plannedQty ?? 0,
        actual_qty: num,
      });
      setFactEdit((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      loadBoard();
      setSuccessMsg('Факт сохранён');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSavingKey(null);
    }
  };

  const handleCompleteSewing = async (item) => {
    const { order_id, floor_id, totals } = item;
    if ((totals?.fact_sum ?? 0) < (totals?.plan_sum ?? 0)) {
      setError('Факт меньше плана. Введите факт по датам и нажмите «Сохранить факт».');
      return;
    }
    if ((totals?.fact_sum ?? 0) <= 0) {
      setError('Введите факт по датам и нажмите «Сохранить факт» перед завершением.');
      return;
    }
    setCompleting(true);
    setError('');
    try {
      const res = await api.sewing.complete({
        order_id: Number(order_id),
        floor_id,
        date_from: periodRange.date_from || undefined,
        date_to: periodRange.date_to || undefined,
      });
      setSuccessMsg('Партия отправлена в ОТК.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadBoard();
      const batchId = res.batch_id;
      if (batchId) {
        navigate(`/qc?batch_id=${batchId}`);
      } else {
        navigate(`/qc?order_id=${order_id}&floor_id=${floor_id}`);
      }
    } catch (err) {
      setError(err.message || 'Ошибка завершения пошива');
      loadBoard();
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <h1 className="text-xl font-semibold text-[#ECECEC] dark:text-dark-text mb-4">Пошив</h1>
      <p className="text-sm text-[#ECECEC]/70 dark:text-dark-text/70 mb-3">
        Статус «В работе» / «Завершено» — единый. Введите факт по датам, нажмите «Завершить пошив → ОТК» — партия появится в ОТК.
      </p>
      {orderIdParam && (
        <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-3">
          Фильтр: заказ #{orderIdParam}
          <Link to="/sewing" className="ml-2 text-primary-400 hover:underline">Показать все</Link>
        </p>
      )}

      <div className="flex flex-row flex-wrap items-center gap-3 mb-4">
        <NeonSelect value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto min-w-[160px] max-w-[200px] shrink-0">
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </NeonSelect>
        <input
          type="text"
          placeholder="Поиск по заказу / модели"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-auto min-w-[180px] max-w-[240px] shrink-0 px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
        />
        <NeonSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[120px] max-w-[160px] shrink-0">
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </NeonSelect>
        <Link
          to="/qc"
          className="shrink-0 text-sm px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2 dark:hover:bg-dark-700 border border-white/20"
        >
          Открыть ОТК
        </Link>
      </div>

      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      {successMsg && <div className="mb-3 text-sm text-green-400">{successMsg}</div>}

      {loading ? (
        <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : (
        <div className="flex flex-col gap-4">
          {boardData.floors.map(({ floor_id, items }) => (
            <NeonCard key={floor_id} className="overflow-hidden">
              <h2 className="text-sm font-semibold text-[#ECECEC] dark:text-dark-text px-4 py-3 border-b border-white/15">
                {floor_id} ЭТАЖ
              </h2>
              <div className="overflow-auto min-h-[80px]">
                {!items || items.length === 0 ? (
                  <p className="p-4 text-sm text-[#ECECEC]/60 dark:text-dark-text/60">Нет задач</p>
                ) : (
                  <div className="divide-y divide-white/10">
                    {items.map((item) => {
                      const key = `${item.order_id}-${item.floor_id}`;
                      const isDone = item.status === 'DONE';
                      const rows = mergePlanFact(item.plan_rows, item.fact_rows);
                      const canComplete = !isDone && (item.totals?.fact_sum ?? 0) >= (item.totals?.plan_sum ?? 0) && (item.totals?.plan_sum ?? 0) > 0;
                      return (
                        <div key={key} className="p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div>
                              <div className="text-sm font-medium text-[#ECECEC] dark:text-dark-text">
                                {item.order_title}
                                {isDone && <span className="ml-2 text-green-400" title="Завершено">✅</span>}
                              </div>
                              <div className="text-xs text-[#ECECEC]/70 dark:text-dark-text/70">{item.client_name}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isDone ? (
                                <Link
                                  to={item.done_batch_id ? `/qc?batch_id=${item.done_batch_id}` : '/qc'}
                                  className="text-xs px-2 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                                >
                                  Открыть ОТК
                                </Link>
                              ) : canComplete ? (
                                <button
                                  type="button"
                                  onClick={() => handleCompleteSewing(item)}
                                  disabled={completing}
                                  className="text-xs px-2 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                                >
                                  {completing ? '...' : 'Завершить пошив → ОТК'}
                                </button>
                              ) : null}
                              <Link
                                to={`/orders/${item.order_id}`}
                                className="text-xs px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text border border-white/20 hover:bg-accent-2"
                              >
                                Открыть заказ
                              </Link>
                            </div>
                          </div>
                          {!isDone && rows.length > 0 && (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-[#ECECEC]/70 dark:text-dark-text/70 border-b border-white/10">
                                  <th className="py-1 pr-2">Дата</th>
                                  <th className="py-1 text-right w-14">План</th>
                                  <th className="py-1 text-right w-16">Факт</th>
                                  <th className="py-1 w-24">Действия</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => {
                                  const editKey = `${item.order_id}-${item.floor_id}-${row.date}`;
                                  const val = factEdit[editKey] !== undefined ? factEdit[editKey] : (row.fact_qty ?? '');
                                  const isSaving = savingKey === editKey;
                                  return (
                                    <tr key={row.date} className="border-b border-white/5">
                                      <td className="py-1.5 pr-2 text-[#ECECEC]/90 dark:text-dark-text/90">{row.date}</td>
                                      <td className="py-1.5 text-right text-[#ECECEC]/90 dark:text-dark-text/90">{row.plan_qty}</td>
                                      <td className="py-1.5 text-right">
                                        <input
                                          type="number"
                                          min="0"
                                          value={val}
                                          onChange={(e) => setFactEdit((prev) => ({ ...prev, [editKey]: e.target.value }))}
                                          className="w-14 px-1 py-0.5 text-right rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-xs"
                                        />
                                      </td>
                                      <td className="py-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleSaveFact(item, row.date, factEdit[editKey] !== undefined ? factEdit[editKey] : row.fact_qty, row.plan_qty)}
                                          disabled={isSaving}
                                          className="text-xs px-2 py-0.5 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                                        >
                                          {isSaving ? '...' : 'Сохранить'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                          {isDone && (
                            <p className="text-xs text-[#ECECEC]/60 dark:text-dark-text/60">План/факт: {item.totals?.plan_sum ?? 0} / {item.totals?.fact_sum ?? 0}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </NeonCard>
          ))}
        </div>
      )}

      {orderIdParam && boardData.floors.some((f) => f.items?.length > 0) && (
        <div className="mt-4 flex gap-2">
          <Link
            to={`/planning?order_id=${orderIdParam}`}
            className="text-sm px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text"
          >
            Планирование
          </Link>
          <Link
            to={`/orders/${orderIdParam}`}
            className="text-sm px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text"
          >
            Карточка заказа
          </Link>
        </div>
      )}
    </div>
  );
}
