/**
 * Задачи по этажам — очередь пошива.
 * Единственная точка ввода факта (actual_qty); план только для просмотра.
 * Кнопка «Завершить пошив» создаёт AUTO-партию и переносит заказ в ОТК.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { NeonCard, NeonSelect } from '../components/ui';

/** Понедельник текущей недели (YYYY-MM-DD) */
function getWeekStart(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  return x.toISOString().slice(0, 10);
}

/** Воскресенье текущей недели */
function getWeekEnd(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? 0 : 7);
  x.setDate(diff);
  return x.toISOString().slice(0, 10);
}

const FLOOR_OPTIONS = [
  { key: 'all', label: 'Все этажи' },
  { key: '1', label: 'Этаж 1' },
  { key: '2', label: 'Этаж 2' },
  { key: '3', label: 'Этаж 3' },
  { key: '4', label: 'Этаж 4' },
];

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

export default function FloorTasks() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order_id') || '';

  const [floorId, setFloorId] = useState('all');
  const [status, setStatus] = useState('in_progress');
  const [period, setPeriod] = useState('week');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [tasks, setTasks] = useState([]);
  const [periodRange, setPeriodRange] = useState({ date_from: '', date_to: '' });
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [factEdit, setFactEdit] = useState({});
  const [savingRowId, setSavingRowId] = useState(null);

  const loadTasks = useCallback(() => {
    const { date_from, date_to } = getPeriodRange(period);
    setLoading(true);
    setError('');
    const params = {
      date_from,
      date_to,
      status,
      floor_id: floorId === 'all' ? undefined : floorId,
      q: debouncedQ || undefined,
      order_id: orderIdParam ? Number(orderIdParam) : undefined,
    };
    api.sewing
      .tasks(params)
      .then((res) => {
        setTasks(res.tasks || []);
        if (res.period) setPeriodRange(res.period);
      })
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [orderIdParam, period, status, floorId, debouncedQ]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Группировка по заказу и этажу (одна кнопка «Завершить пошив → ОТК» на группу). Только производственные этажи 1–4.
  const PRODUCTION_FLOORS = [1, 2, 3, 4];
  const groups = React.useMemo(() => {
    const byKey = {};
    tasks.forEach((t) => {
      const fid = t.floor_id != null ? t.floor_id : null;
      if (fid != null && !PRODUCTION_FLOORS.includes(Number(fid))) return; // ОТК/Финиш не этаж для партии
      const key = `${t.order_id}-${fid ?? 'n'}`;
      if (!byKey[key]) {
        byKey[key] = { key, order_id: t.order_id, floor_id: fid, floor_name: t.floor_name || '—', order_tz_model: t.order_tz_model || t.order_title || `#${t.order_id}`, tasks: [] };
      }
      byKey[key].tasks.push(t);
    });
    return Object.values(byKey).map((g) => ({
      ...g,
      totalFact: g.tasks.reduce((s, t) => s + (Number(t.actual_qty) || 0), 0),
    }));
  }, [tasks]);

  // Статус «пошив завершён» по группам (для одной группы при фильтре по заказу — один запрос)
  const [completedByKey, setCompletedByKey] = useState({});
  useEffect(() => {
    if (!tasks.length) {
      setCompletedByKey({});
      return;
    }
    const uniq = [];
    const seen = new Set();
    tasks.forEach((t) => {
      const fid = t.floor_id != null ? t.floor_id : null;
      if (fid != null && !PRODUCTION_FLOORS.includes(Number(fid))) return;
      const k = `${t.order_id}-${fid ?? 'n'}`;
      if (seen.has(k)) return;
      seen.add(k);
      uniq.push({ order_id: t.order_id, floor_id: fid });
    });
    uniq.forEach(({ order_id, floor_id }) => {
      const key = `${order_id}-${floor_id ?? 'n'}`;
      api.sewing
        .completeStatus({ order_id, floor_id: floor_id ?? undefined })
        .then((res) => setCompletedByKey((prev) => ({ ...prev, [key]: !!res.completed })))
        .catch(() => setCompletedByKey((prev) => ({ ...prev, [key]: false })));
    });
  }, [tasks]);

  const handleCompleteSewing = async (orderId, floorId) => {
    const totalFact = (groups.find((g) => g.order_id === orderId && (g.floor_id === floorId || (g.floor_id == null && floorId == null)))?.totalFact) ?? 0;
    if (totalFact <= 0) {
      setError('Введите факт пошива по датам и нажмите «Сохранить факт» перед завершением.');
      return;
    }
    setCompleting(true);
    setError('');
    try {
      const res = await api.sewing.complete({
        order_id: Number(orderId),
        floor_id: floorId != null && floorId !== '' ? floorId : undefined,
        date_from: periodRange.date_from || undefined,
        date_to: periodRange.date_to || undefined,
      });
      setCompletedByKey((prev) => ({ ...prev, [`${orderId}-${floorId ?? 'n'}`]: true }));
      setSuccessMsg('Пошив завершён. Партия передана в ОТК.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadTasks();
      navigate(res.batch_id ? `/qc?batch_id=${res.batch_id}` : '/qc');
    } catch (err) {
      setError(err.message || 'Ошибка завершения пошива');
      loadTasks();
    } finally {
      setCompleting(false);
    }
  };

  const handleSaveFact = async (task, newActualQty) => {
    const num = Math.max(0, parseInt(newActualQty, 10) || 0);
    setSavingRowId(task.id);
    setError('');
    try {
      await api.planning.updateDay({
        order_id: task.order_id,
        workshop_id: task.workshop_id,
        date: task.date,
        floor_id: task.floor_id || null,
        planned_qty: task.planned_qty ?? 0,
        actual_qty: num,
      });
      setFactEdit((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      loadTasks();
      setSuccessMsg('Факт сохранён');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSavingRowId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <NeonCard className="overflow-hidden">
        <div className="p-4 border-b border-white/20 dark:border-white/20">
          <h1 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-3">Задачи по этажам</h1>
          {orderIdParam && (
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-3">
              Фильтр: заказ #{orderIdParam}
              <Link to="/floor-tasks" className="ml-2 text-primary-400 hover:underline">Показать все</Link>
            </p>
          )}

          {/* Фильтры */}
          <div className="flex flex-wrap items-center gap-3">
            <NeonSelect
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              className="min-w-[140px]"
            >
              {FLOOR_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </NeonSelect>
            <NeonSelect
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="min-w-[140px]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </NeonSelect>
            <NeonSelect
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="min-w-[160px]"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </NeonSelect>
            <input
              type="text"
              placeholder="Поиск по заказу / модели"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px] text-sm"
            />
            <Link
              to={orderIdParam && tasks.length && tasks[0].floor_id != null ? `/qc?order_id=${orderIdParam}&floor_id=${tasks[0].floor_id}` : '/qc'}
              className="text-sm px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2 dark:hover:bg-dark-700 border border-white/20"
            >
              Открыть ОТК
            </Link>
          </div>
        </div>

        {error && <div className="mx-4 mt-2 text-sm text-red-400">{error}</div>}
        {successMsg && <div className="mx-4 mt-2 text-sm text-green-400">{successMsg}</div>}

        {loading ? (
          <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : !tasks.length ? (
          <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">
            Нет задач по выбранным фильтрам
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Этаж</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дата</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">План</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Факт</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && tasks.length > 0
                  ? tasks.map((task) => {
                      const val = factEdit[task.id] !== undefined ? factEdit[task.id] : (task.actual_qty ?? '');
                      const isSaving = savingRowId === task.id;
                      return (
                        <tr key={task.id} className="border-b border-white/10 dark:border-white/10">
                          <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">
                            <span className="font-medium">{task.order_tz_model || task.order_title || `#${task.order_id}`}</span>
                          </td>
                          <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{task.floor_name || '—'}</td>
                          <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{task.date}</td>
                          <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{task.planned_qty}</td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={val}
                              onChange={(e) => setFactEdit((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              className="w-16 px-2 py-1 text-right rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveFact(task, factEdit[task.id] !== undefined ? factEdit[task.id] : task.actual_qty)}
                                disabled={isSaving}
                                className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                              >
                                {isSaving ? 'Сохранение...' : 'Сохранить факт'}
                              </button>
                              <Link to={`/orders/${task.order_id}`} className="text-xs px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2 dark:hover:bg-dark-700 border border-white/20">
                                Открыть заказ
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  : groups.map((group) => (
                  <React.Fragment key={group.key}>
                    {/* Строка-заголовок группы: заказ, этаж, итого факт, кнопка «Завершить пошив → ОТК» */}
                    <tr className="bg-accent-2/40 dark:bg-dark-800/80 border-b border-white/15">
                      <td colSpan={6} className="px-4 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[#ECECEC] dark:text-dark-text">
                            {group.order_tz_model} — {group.floor_name} · Итого факт: {group.totalFact}
                          </span>
                          {group.totalFact > 0 && !completedByKey[group.key] && (
                            <button
                              type="button"
                              onClick={() => handleCompleteSewing(group.order_id, group.floor_id)}
                              disabled={completing}
                              className="px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
                            >
                              {completing ? 'Завершение...' : 'Завершить пошив → ОТК'}
                            </button>
                          )}
                          {completedByKey[group.key] && (
                            <span className="text-xs text-green-400">Пошив завершён, партия в ОТК</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {group.tasks.map((task) => {
                      const val = factEdit[task.id] !== undefined ? factEdit[task.id] : (task.actual_qty ?? '');
                      const isSaving = savingRowId === task.id;
                      return (
                        <tr key={task.id} className="border-b border-white/10 dark:border-white/10">
                          <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">
                            <span className="font-medium">{task.order_tz_model || task.order_title || `#${task.order_id}`}</span>
                          </td>
                          <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{task.floor_name || '—'}</td>
                          <td className="px-4 py-2 text-[#ECECEC]/90 dark:text-dark-text/80">{task.date}</td>
                          <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{task.planned_qty}</td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={val}
                              onChange={(e) => setFactEdit((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              className="w-16 px-2 py-1 text-right rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveFact(task, factEdit[task.id] !== undefined ? factEdit[task.id] : task.actual_qty)}
                                disabled={isSaving}
                                className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                              >
                                {isSaving ? 'Сохранение...' : 'Сохранить факт'}
                              </button>
                              <Link
                                to={`/orders/${task.order_id}`}
                                className="text-xs px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2 dark:hover:bg-dark-700 border border-white/20"
                              >
                                Открыть заказ
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Ссылки в шапке при одном заказе (если открыли с order_id) */}
        {orderIdParam && tasks.length > 0 && (
          <div className="p-4 border-t border-white/20 flex gap-2">
            <Link
              to={`/planning?order_id=${orderIdParam}`}
              className="text-sm px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2"
            >
              Планирование
            </Link>
            <Link
              to={`/orders/${orderIdParam}`}
              className="text-sm px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2"
            >
              Карточка заказа
            </Link>
          </div>
        )}
      </NeonCard>

    </div>
  );
}
