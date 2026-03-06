/**
 * Пошив — единый список по статусу (board API), ввод факта, завершение → ОТК.
 * Статус «В работе» / «Завершено» из sewing_order_floors.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { NeonCard, NeonSelect } from '../components/ui';

const SEWING_STATUS_KEY = 'sewing_status';
const SEWING_PERIOD_KEY = 'sewing_period';
const SEWING_Q_KEY = 'sewing_q';
const SEWING_ORDER_ID_KEY = 'sewing_order_id';

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

/** Строки таблицы только по датам из plan_rows; факт подставляется из fact_rows (0 если нет). */
function mergePlanFact(planRows, factRows) {
  const byDate = {};
  const dateStr = (d) => (d == null ? '' : typeof d === 'string' ? d.slice(0, 10) : String(d).slice(0, 10));
  (planRows || []).forEach((r) => {
    const date = dateStr(r.date);
    if (!date) return;
    byDate[date] = { date, plan_qty: r.plan_qty ?? 0, fact_qty: 0 };
  });
  (factRows || []).forEach((r) => {
    const date = dateStr(r.date);
    if (!date || !byDate[date]) return;
    byDate[date].fact_qty = r.fact_qty ?? 0;
  });
  return Object.values(byDate).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function getStored(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v !== null && v !== '' ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function Sewing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order_id') || '';

  const [status, setStatus] = useState(() => getStored(SEWING_STATUS_KEY, 'in_progress'));
  const [period, setPeriod] = useState(() => getStored(SEWING_PERIOD_KEY, 'week'));
  const [q, setQ] = useState(() => getStored(SEWING_Q_KEY, ''));
  const [debouncedQ, setDebouncedQ] = useState(() => getStored(SEWING_Q_KEY, ''));
  const [boardData, setBoardData] = useState({ floors: [], period: {} });
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [factEdit, setFactEdit] = useState({});
  const [savingAllKey, setSavingAllKey] = useState(null);
  const savingKey = savingAllKey;
  const [filterOrderInput, setFilterOrderInput] = useState(() => orderIdParam || getStored(SEWING_ORDER_ID_KEY, ''));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (orderIdParam) setFilterOrderInput(orderIdParam);
    else setFilterOrderInput(getStored(SEWING_ORDER_ID_KEY, ''));
  }, [orderIdParam]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SEWING_STATUS_KEY, status);
      sessionStorage.setItem(SEWING_PERIOD_KEY, period);
      sessionStorage.setItem(SEWING_Q_KEY, q);
    } catch (_) {}
  }, [status, period, q]);

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

  /** Заполнить факт как план (только локально в форме); сохранять — кнопкой «Сохранить факты». */
  const handleFillAsPlan = (item, rows) => {
    const updates = {};
    rows.forEach((row) => {
      const editKey = `${item.order_id}-${item.floor_id}-${row.date}`;
      const planQty = Number(row.plan_qty) || 0;
      updates[editKey] = planQty === 0 ? '' : String(planQty);
    });
    setFactEdit((prev) => ({ ...prev, ...updates }));
    setSuccessMsg('Факт заполнен по плану. Нажмите «Сохранить факты».');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  /** Сохранить факты по всем датам карточки одним запросом (bulk). Пустые значения уходят как 0. */
  const handleSaveFacts = async (item, rows, floorIdFromCard) => {
    const order_id = item?.order_id != null && item?.order_id !== '' ? Number(item.order_id) : null;
    const floor_id = (item?.floor_id != null && item?.floor_id !== '' ? Number(item.floor_id) : null) ?? (floorIdFromCard != null ? Number(floorIdFromCard) : null);
    if (!order_id || !floor_id) {
      setError('Не выбран заказ или этаж. Работайте из карточки заказа на этой странице.');
      return;
    }
    const bulkKey = `${order_id}-${floor_id}`;
    setSavingAllKey(bulkKey);
    setError('');
    try {
      // Пустые значения в форме отправляем как 0 (number) — API не меняем
      const facts = rows.map((row) => {
        const editKey = `${order_id}-${floor_id}-${row.date}`;
        const raw = factEdit[editKey] !== undefined ? factEdit[editKey] : (row.fact_qty ?? 0);
        const fact_qty = Math.max(0, parseInt(String(raw), 10) || 0);
        return { date: row.date, fact_qty };
      });
      await api.sewing.saveFactBulk({
        order_id: Number(order_id),
        floor_id: Number(floor_id),
        facts,
      });
      setFactEdit((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          delete next[`${order_id}-${floor_id}-${row.date}`];
        });
        return next;
      });
      await loadBoard();
      setSuccessMsg('Факты сохранены');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      const msg = err.message || 'Ошибка сохранения';
      setError(err.received != null ? `${msg} (получено: ${JSON.stringify(err.received)})` : msg);
    } finally {
      setSavingAllKey(null);
    }
  };

  const handleCompleteSewing = async (item, floorIdFromCard) => {
    const order_id = item?.order_id != null && item?.order_id !== '' ? Number(item.order_id) : null;
    const floor_id = (item?.floor_id != null && item?.floor_id !== '' ? Number(item.floor_id) : null) ?? (floorIdFromCard != null ? Number(floorIdFromCard) : null);
    if (!order_id || !floor_id) {
      setError('Не выбран заказ или этаж. Работайте из карточки заказа на этой странице.');
      return;
    }
    const rows = mergePlanFact(item.plan_rows, item.fact_rows);
    const plan_sum = rows.reduce((s, r) => s + (Number(r.plan_qty) || 0), 0);
    const localFactSum = rows.reduce((s, r) => {
      const editKey = `${order_id}-${floor_id}-${r.date}`;
      const raw = factEdit[editKey] !== undefined ? factEdit[editKey] : (r.fact_qty ?? 0);
      return s + (Math.max(0, parseInt(String(raw), 10) || 0));
    }, 0);
    if (localFactSum < plan_sum) {
      setError('Факт меньше плана. Заполните факт по датам и нажмите «Сохранить факты».');
      return;
    }
    if (localFactSum <= 0) {
      setError('Заполните факт по датам и нажмите «Сохранить факты» перед завершением.');
      return;
    }
    setCompleting(true);
    setError('');
    try {
      // Загружаем все даты плана по заказу и этажу (бэкенд считает план/факт по всем датам)
      const { dates: allDates } = await api.sewing.planDates({ order_id, floor_id });
      const facts = (allDates || []).map((d) => {
        const editKey = `${order_id}-${floor_id}-${d.date}`;
        const raw = factEdit[editKey] !== undefined ? factEdit[editKey] : (d.fact_qty ?? 0);
        const fact_qty = Math.max(0, parseInt(String(raw), 10) || 0);
        return { date: d.date, fact_qty };
      });
      const totalPlan = (allDates || []).reduce((s, d) => s + (Number(d.planned_qty) || 0), 0);
      const totalFact = facts.reduce((s, f) => s + (Number(f.fact_qty) || 0), 0);
      if (totalPlan <= 0) {
        setError('Нет плана пошива по этому заказу и этажу. Добавьте план в Планировании.');
        setCompleting(false);
        return;
      }
      if (totalFact < totalPlan) {
        setError(`Факт (${totalFact}) меньше полного плана (${totalPlan}). Заполните факт по всем датам плана и нажмите «Сохранить факты».`);
        setCompleting(false);
        return;
      }
      await api.sewing.saveFactBulk({
        order_id: Number(order_id),
        floor_id: Number(floor_id),
        facts,
      });
      const { date_from, date_to } = getPeriodRange(period);
      const res = await api.sewing.complete({
        order_id: Number(order_id),
        floor_id: Number(floor_id),
        date_from,
        date_to,
      });
      setSuccessMsg('✓ Завершено. Партия отправлена в ОТК.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadBoard();
      const batchId = res.batch_id;
      if (batchId) {
        navigate(`/qc?batch_id=${batchId}`);
      } else {
        navigate(`/qc?order_id=${order_id}&floor_id=${floor_id}`);
      }
    } catch (err) {
      const msg = err.error || err.message || 'Ошибка завершения пошива';
      setError(err.received != null ? `${msg} (получено: ${JSON.stringify(err.received)})` : msg);
      loadBoard();
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-semibold text-[#ECECEC] dark:text-dark-text mb-2">Пошив</h1>
      <p className="text-sm text-[#ECECEC]/70 dark:text-dark-text/70 mb-4">
        Введите факт по датам → «Сохранить факты» → «Завершить → ОТК». Каждая карточка — заказ и этаж.
      </p>
      {orderIdParam && (
        <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-3">
          Фильтр: заказ #{orderIdParam}
          <button
            type="button"
            onClick={() => {
              try { sessionStorage.setItem(SEWING_ORDER_ID_KEY, ''); } catch (_) {}
              setFilterOrderInput('');
              setSearchParams({});
            }}
            className="ml-2 text-primary-400 hover:underline"
          >
            Показать все
          </button>
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
        <span className="text-[#ECECEC]/60 dark:text-dark-text/60 text-sm shrink-0">Заказ №</span>
        <input
          type="number"
          min={1}
          placeholder="32"
          value={filterOrderInput}
          onChange={(e) => setFilterOrderInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const next = filterOrderInput ? `?order_id=${filterOrderInput}` : '';
            try { sessionStorage.setItem(SEWING_ORDER_ID_KEY, filterOrderInput || ''); } catch (_) {}
            setSearchParams(next ? { order_id: filterOrderInput } : {});
          }}
          className="w-20 shrink-0 px-2 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
        />
        <button
          type="button"
          onClick={() => {
            const next = filterOrderInput ? `?order_id=${filterOrderInput}` : '';
            try { sessionStorage.setItem(SEWING_ORDER_ID_KEY, filterOrderInput || ''); } catch (_) {}
            setSearchParams(next ? { order_id: filterOrderInput } : {});
          }}
          className="shrink-0 text-sm px-2 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2 border border-white/20"
        >
          Показать заказ
        </button>
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

      {error && <div className="mb-3 text-base text-red-400">{error}</div>}
      {successMsg && <div className="mb-3 text-base text-green-400">{successMsg}</div>}

      {loading ? (
        <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : (
        <div className="flex flex-col gap-4">
          {boardData.floors.map(({ floor_id, items }) => (
            <NeonCard key={floor_id} className="overflow-hidden">
              <h2 className="text-base font-semibold text-[#ECECEC] dark:text-dark-text px-4 py-3 border-b border-white/15">
                {floor_id} ЭТАЖ
              </h2>
              <div className="overflow-auto min-h-[80px]">
                {!items || items.length === 0 ? (
                  <p className="p-4 text-base text-[#ECECEC]/60 dark:text-dark-text/60">Нет задач</p>
                ) : (
                  <div className="divide-y divide-white/10">
                    {items.map((item) => {
                      const key = `${item.order_id}-${item.floor_id}`;
                      const isDone = item.status === 'DONE';
                      const rows = mergePlanFact(item.plan_rows, item.fact_rows);
                      const plan_sum = rows.reduce((s, r) => s + (Number(r.plan_qty) || 0), 0);
                      const localFactSum = rows.reduce((s, r) => {
                        const editKey = `${item.order_id}-${item.floor_id}-${r.date}`;
                        const v = factEdit[editKey] !== undefined ? factEdit[editKey] : (r.fact_qty ?? 0);
                        return s + (Math.max(0, parseInt(v, 10) || 0));
                      }, 0);
                      const canComplete = !isDone && localFactSum >= plan_sum && plan_sum > 0;
                      const isSaving = savingKey === key;
                      return (
                        <div key={key} className="p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-medium text-[#ECECEC] dark:text-dark-text">
                                  {item.order_title}
                                  {isDone && <span className="ml-2 text-green-400" title="Завершено">✓ Завершено</span>}
                                </span>
                                {!isDone && rows.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleFillAsPlan(item, rows)}
                                    className="text-xs text-[#ECECEC]/60 dark:text-dark-text/60 hover:text-primary-400 hover:underline"
                                  >
                                    Заполнить как план
                                  </button>
                                )}
                              </div>
                              <div className="text-sm text-[#ECECEC]/70 dark:text-dark-text/70">{item.client_name}</div>
                              <div className="text-sm text-[#ECECEC]/50 dark:text-dark-text/50 mt-0.5">
                                Заказ #{item.order_id} · Этаж {item.floor_id}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                              {!isDone && rows.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveFacts(item, rows, floor_id)}
                                  disabled={isSaving}
                                  className="text-sm px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                                >
                                  {isSaving ? '...' : 'Сохранить факты'}
                                </button>
                              )}
                              {isDone ? (
                                <Link
                                  to={item.done_batch_id ? `/qc?batch_id=${item.done_batch_id}` : `/qc?order_id=${item.order_id}&floor_id=${item.floor_id}`}
                                  className="text-sm px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                                >
                                  Открыть ОТК
                                </Link>
                              ) : (
                                <div className="flex flex-col">
                                  <button
                                    type="button"
                                    onClick={() => handleCompleteSewing(item, floor_id)}
                                    disabled={completing || !canComplete}
                                    title={plan_sum === 0 ? 'Нет плана' : (canComplete ? '' : 'Факт должен быть не меньше плана')}
                                    className="text-sm px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {completing ? '...' : 'Завершить → ОТК'}
                                  </button>
                                  <span className="text-xs text-[#ECECEC]/50 dark:text-dark-text/50 mt-1">
                                    Факт по датам: {localFactSum} / {plan_sum}
                                  </span>
                                </div>
                              )}
                              <Link
                                to={`/orders/${item.order_id}`}
                                className="text-xs px-2 py-1.5 rounded border border-white/20 text-[#ECECEC]/80 dark:text-dark-text/80 hover:bg-white/5 hover:underline"
                              >
                                Открыть заказ
                              </Link>
                            </div>
                          </div>
                          {!isDone && (item.plan_rows || []).length === 0 && (
                            <div className="py-2">
                              <p className="text-sm text-amber-400/90 mb-2">
                                Нет плана пошива в выбранном периоде. Добавьте план на странице «Планирование» по заказу и этажу.
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <Link to={`/planning?order_id=${item.order_id}`} className="text-xs px-2 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Открыть планирование</Link>
                                <Link to={`/cutting?order_id=${item.order_id}`} className="text-xs px-2 py-1 rounded bg-accent-2/80 text-[#ECECEC] hover:bg-accent-2">Открыть раскрой</Link>
                                <Link to={`/orders/${item.order_id}`} className="text-xs px-2 py-1 rounded bg-accent-2/80 text-[#ECECEC] hover:bg-accent-2">Открыть заказ</Link>
                              </div>
                            </div>
                          )}
                          {!isDone && rows.length > 0 && (
                            <table className="w-full text-base">
                              <thead>
                                <tr className="text-left text-[#ECECEC]/70 dark:text-dark-text/70 border-b border-white/10">
                                  <th className="py-3 pr-4 w-32">Дата</th>
                                  <th className="py-3 text-right w-20">План</th>
                                  <th className="py-3 text-right w-24">Факт</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => {
                                  const editKey = `${item.order_id}-${item.floor_id}-${row.date}`;
                                  const raw = factEdit[editKey] !== undefined ? factEdit[editKey] : (row.fact_qty ?? 0);
                                  const numVal = Math.max(0, parseInt(String(raw), 10) || 0);
                                  const displayVal = numVal === 0 ? '' : String(numVal);
                                  return (
                                    <tr key={row.date} className="border-b border-white/5">
                                      <td className="py-3 pr-4 text-[#ECECEC]/90 dark:text-dark-text/90">{row.date}</td>
                                      <td className="py-3 text-right text-[#ECECEC]/90 dark:text-dark-text/90 w-20">{row.plan_qty}</td>
                                      <td className="py-3 text-right w-24">
                                        <input
                                          type="number"
                                          min={0}
                                          placeholder="0"
                                          value={displayVal}
                                          onFocus={(e) => {
                                            const v = e.target.value;
                                            if (v === '' || v === '0') setFactEdit((prev) => ({ ...prev, [editKey]: '' }));
                                          }}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setFactEdit((prev) => ({ ...prev, [editKey]: v }));
                                          }}
                                          onBlur={() => {
                                            // Пустое поле = 0; при сохранении отправится как 0
                                          }}
                                          className="w-full min-w-[4rem] max-w-[6rem] mx-auto px-2 py-1.5 text-right rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-base"
                                        />
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
