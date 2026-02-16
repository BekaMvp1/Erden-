/**
 * Планирование — пошаговый фильтр
 * Порядок: Цех → Модель → Дата (начало/конец) → Этаж
 * Таблица: Дата | План | Факт | Действия
 *
 * Автоподстановка дат: после выбора модели — текущая неделя или месяц.
 * Переключатель [Неделя | Месяц], режим сохраняется в localStorage.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

const FLOOR_1_HINT = '1 этаж — финиш: ОТК, петля, пуговица, метка, упаковка';
const FLOOR_STORAGE_KEY = 'planning_last_floor';
const DATE_MODE_STORAGE_KEY = 'planning_date_mode';

/** Форматирование даты в YYYY-MM-DD */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Понедельник текущей недели для даты */
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatDate(d);
}

/** Воскресенье текущей недели для даты */
function getSundayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return formatDate(d);
}

/** Первое число текущего месяца */
function getFirstDayOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  return formatDate(d);
}

/** Последнее число текущего месяца */
function getLastDayOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return formatDate(d);
}

/** Диапазон дат по режиму (неделя или месяц) */
function getDateRangeForMode(mode, refDate = new Date()) {
  if (mode === 'month') {
    return {
      from: getFirstDayOfMonth(refDate),
      to: getLastDayOfMonth(refDate),
    };
  }
  return {
    from: getMondayOfWeek(refDate),
    to: getSundayOfWeek(refDate),
  };
}

export default function Planning() {
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [orderId, setOrderId] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Режим периода: неделя или месяц. Сохраняется в localStorage.
  const [dateMode, setDateMode] = useState(() => {
    try {
      const saved = localStorage.getItem(DATE_MODE_STORAGE_KEY);
      return saved === 'month' ? 'month' : 'week';
    } catch {
      return 'week';
    }
  });

  // Флаг для лёгкой fade-анимации при автоподстановке дат
  const [datesAutoFilled, setDatesAutoFilled] = useState(false);

  const [floors, setFloors] = useState([]);
  const [floorsLoading, setFloorsLoading] = useState(false);
  const [floorId, setFloorId] = useState('');

  const [data, setData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager', 'technologist'].includes(user.role);

  // Шаг 1: цехи
  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  // Шаг 2: модели по цеху
  useEffect(() => {
    if (!workshopId) {
      setModels([]);
      setOrderId('');
      setSelectedWorkshop(null);
      return;
    }
    const w = workshops.find((x) => String(x.id) === String(workshopId));
    setSelectedWorkshop(w || null);
    setModelsLoading(true);
    api.orders
      .byWorkshop(workshopId)
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
    setOrderId('');
    setFrom('');
    setTo('');
    setFloors([]);
    setFloorId('');
    setData(null);
  }, [workshopId, workshops]);

  // Автоподстановка дат после выбора модели: если даты пустые — текущая неделя/месяц
  useEffect(() => {
    if (!orderId) return;
    if (from !== '' || to !== '') return; // Даты уже выбраны вручную — не перезаписывать
    const { from: f, to: t } = getDateRangeForMode(dateMode);
    setFrom(f);
    setTo(t);
    setDatesAutoFilled(true);
  }, [orderId, dateMode]);

  // Сброс анимации автоподстановки через 500 мс
  useEffect(() => {
    if (!datesAutoFilled) return;
    const t = setTimeout(() => setDatesAutoFilled(false), 500);
    return () => clearTimeout(t);
  }, [datesAutoFilled]);

  // Сохранение режима в localStorage при смене
  useEffect(() => {
    try {
      localStorage.setItem(DATE_MODE_STORAGE_KEY, dateMode);
    } catch (_) {}
  }, [dateMode]);

  // Шаг 4: этажи по цеху (только если floors_count > 1)
  useEffect(() => {
    if (!workshopId || !selectedWorkshop || selectedWorkshop.floors_count <= 1) {
      setFloors([]);
      setFloorId('');
      return;
    }
    setFloorsLoading(true);
    api.planning
      .floors(workshopId)
      .then((f) => {
        const list = f || [];
        setFloors(list);
        const saved = localStorage.getItem(FLOOR_STORAGE_KEY);
        const defaultId = saved && list.some((x) => String(x.id) === saved) ? saved : (list[1]?.id ?? list[0]?.id ?? '');
        setFloorId(String(defaultId));
      })
      .catch(() => setFloors([]))
      .finally(() => setFloorsLoading(false));
  }, [workshopId, selectedWorkshop]);

  const handleFloorChange = (val) => {
    setFloorId(val);
    localStorage.setItem(FLOOR_STORAGE_KEY, val);
  };

  /** Смена режима периода (неделя/месяц): пересчёт from/to и перезагрузка таблицы */
  const handleDateModeChange = useCallback((mode) => {
    setDateMode(mode);
    const { from: f, to: t } = getDateRangeForMode(mode);
    setFrom(f);
    setTo(t);
    setDatesAutoFilled(true);
  }, []);

  // Проверка: можно ли загрузить таблицу
  const canLoadTable =
    workshopId &&
    orderId &&
    from &&
    to &&
    (selectedWorkshop?.floors_count === 1 || (selectedWorkshop?.floors_count > 1 && floorId));

  // Загрузка таблицы
  useEffect(() => {
    if (!canLoadTable) {
      setData(null);
      return;
    }
    setTableLoading(true);
    setErrorMsg('');
    const params = {
      workshop_id: workshopId,
      order_id: orderId,
      from,
      to,
    };
    if (selectedWorkshop?.floors_count > 1) {
      params.floor_id = floorId;
    }
    api.planning
      .modelTable(params)
      .then(setData)
      .catch((err) => {
        setData(null);
        setErrorMsg(err.message || 'Ошибка загрузки данных');
      })
      .finally(() => setTableLoading(false));
  }, [canLoadTable, workshopId, orderId, from, to, floorId, selectedWorkshop?.floors_count]);

  const handleSaveDay = async () => {
    if (!editModal || !workshopId) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await api.planning.updateDay({
        order_id: editModal.order_id,
        workshop_id: Number(workshopId),
        date: editModal.date,
        floor_id: selectedWorkshop?.floors_count > 1 ? Number(floorId) : null,
        planned_qty: editModal.planned_qty,
        actual_qty: editModal.actual_qty,
      });
      setEditModal(null);
      if (canLoadTable) {
        const params = { workshop_id: workshopId, order_id: orderId, from, to };
        if (selectedWorkshop?.floors_count > 1) params.floor_id = floorId;
        api.planning.modelTable(params).then(setData).catch(() => setData(null));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const showFloorStep = selectedWorkshop?.floors_count > 1;
  const floor1Selected = showFloorStep && Number(floorId) === 1;

  const selectClass = (disabled) =>
    `px-4 py-2 rounded-lg border text-[#ECECEC] dark:text-dark-text ${
      disabled
        ? 'bg-accent-2/40 dark:bg-dark-800/50 border-white/15 cursor-not-allowed opacity-60'
        : 'bg-accent-2/80 dark:bg-dark-800 border-white/25 dark:border-white/25'
    }`;

  const inputClass = (disabled) =>
    `px-3 py-2 rounded-lg border ${
      disabled
        ? 'bg-accent-2/40 dark:bg-dark-800/50 border-white/15 cursor-not-allowed opacity-60'
        : 'bg-accent-2/80 dark:bg-dark-800 border-white/25 dark:border-white/25'
    } text-[#ECECEC] dark:text-dark-text`;

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Планирование</h1>
        {data && <PrintButton />}
      </div>

      {/* Пошаговый фильтр — сетка для ровного расположения */}
      <div className="no-print mb-6">
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${showFloorStep ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {/* Шаг 1: Цех */}
          <div>
            <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">1. Цех</label>
            <select
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className={`${selectClass(false)} w-full`}
            >
              <option value="">Выберите цех</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Шаг 2: Модель */}
          <div>
            <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">2. Модель</label>
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={!workshopId}
              className={`${selectClass(!workshopId)} w-full`}
            >
              <option value="">
                {!workshopId ? 'Сначала выберите цех' : modelsLoading ? 'Загрузка...' : 'Выберите модель'}
              </option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.client_name} — {m.title}
                </option>
              ))}
            </select>
          </div>

          {/* Шаг 3: Период и даты */}
          <div
            className={`sm:col-span-2 lg:col-span-1 transition-all duration-300 ${
              datesAutoFilled ? 'ring-2 ring-primary-500/30 rounded-lg ring-offset-2 ring-offset-transparent p-1 -m-1' : ''
            }`}
          >
            <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">3. Период</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-white/25 dark:border-white/25 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleDateModeChange('week')}
                  disabled={!orderId}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    dateMode === 'week'
                      ? 'bg-primary-600 text-white'
                      : 'bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 hover:bg-accent-2 dark:hover:bg-dark-700 disabled:opacity-50'
                  }`}
                >
                  Неделя
                </button>
                <button
                  type="button"
                  onClick={() => handleDateModeChange('month')}
                  disabled={!orderId}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-l border-white/25 ${
                    dateMode === 'month'
                      ? 'bg-primary-600 text-white'
                      : 'bg-accent-2/80 dark:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 hover:bg-accent-2 dark:hover:bg-dark-700 disabled:opacity-50'
                  }`}
                >
                  Месяц
                </button>
              </div>
              <div className="flex gap-2 flex-1 min-w-0">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={!orderId}
                  placeholder="от"
                  className={`${inputClass(!orderId)} flex-1 min-w-0`}
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={!orderId}
                  placeholder="до"
                  className={`${inputClass(!orderId)} flex-1 min-w-0`}
                />
              </div>
            </div>
          </div>

          {/* Шаг 4: Этаж (только для Наш цех) */}
          {showFloorStep && (
            <div>
              <label className="block text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 mb-1">4. Этаж</label>
              <select
                value={floorId}
                onChange={(e) => handleFloorChange(e.target.value)}
                disabled={!from || !to}
                className={`${selectClass(!from || !to)} w-full`}
              >
                <option value="">
                  {!from || !to ? 'Сначала выберите даты' : floorsLoading ? 'Загрузка...' : 'Выберите этаж'}
                </option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 1 ? `1 (Финиш)` : f.name}
                </option>
              ))}
            </select>
            {(!from || !to) && (
              <p className="text-sm text-[#ECECEC]/60 dark:text-dark-text/60 mt-1">Сначала выберите даты</p>
            )}
          </div>
        )}
        </div>

        {!orderId && (
          <p className="text-sm text-[#ECECEC]/60 dark:text-dark-text/60 mt-2">Сначала выберите модель</p>
        )}

        {floor1Selected && (
          <div className="mt-4 px-4 py-2 rounded-lg bg-primary-600/20 text-primary-200 dark:text-primary-300 text-sm">
            {FLOOR_1_HINT}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{errorMsg}</div>
      )}

      {/* Пустое состояние */}
      {!workshopId && (
        <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80 transition-block">
          Выберите цех
        </div>
      )}

      {/* Таблица */}
      {workshopId && (
        <div className="print-area bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden overflow-x-auto transition-block">
          {!canLoadTable ? (
            <div className="p-12 text-center text-[#ECECEC]/70 dark:text-dark-text/70">
              {!orderId
                ? 'Выберите модель'
                : !from || !to
                  ? 'Выберите даты начала и окончания'
                  : showFloorStep && !floorId
                    ? 'Выберите этаж'
                    : 'Заполните все фильтры'}
            </div>
          ) : tableLoading ? (
            <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
          ) : !data?.rows?.length ? (
            <div className="p-12 text-center text-[#ECECEC]/80 dark:text-dark-text/80">
              Нет данных за выбранный период
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-white/20 dark:border-white/20">
                <p className="text-sm text-[#ECECEC]/90 dark:text-dark-text/80">
                  {data.order?.client_name} — {data.order?.title}
                  {data.floor && ` • ${data.floor.name}`}
                </p>
              </div>
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="bg-accent-2/80 dark:bg-dark-800 border-b border-white/25">
                    <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дата</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">План</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Факт</th>
                    {canEdit && <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const isOver = (row.actual_qty || 0) > (row.planned_qty || 0);
                    const isUnder = (row.actual_qty || 0) < (row.planned_qty || 0) && (row.planned_qty || 0) > 0;
                    const isOk = (row.actual_qty || 0) >= (row.planned_qty || 0) && (row.planned_qty || 0) > 0;
                    const rowClass = isOver ? 'bg-red-500/10' : isOk ? 'bg-green-500/10' : isUnder ? 'bg-amber-500/10' : '';
                    return (
                      <tr key={row.date} className={`border-b border-white/10 dark:border-white/10 ${rowClass}`}>
                        <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text">{row.date}</td>
                        <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{row.planned_qty}</td>
                        <td className="px-4 py-2 text-right text-[#ECECEC]/90 dark:text-dark-text/80">{row.actual_qty}</td>
                        {canEdit && (
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEditModal({
                                  order_id: data.order.id,
                                  order_title: data.order.title,
                                  date: row.date,
                                  planned_qty: row.planned_qty,
                                  actual_qty: row.actual_qty,
                                })
                              }
                              className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700"
                            >
                              Редактировать
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="bg-accent-2/50 dark:bg-dark-800 border-t-2 border-white/25 font-bold">
                    <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">Итого</td>
                    <td className="px-4 py-3 text-right text-[#ECECEC] dark:text-dark-text">{data.totals?.planned_sum ?? 0}</td>
                    <td className="px-4 py-3 text-right text-[#ECECEC] dark:text-dark-text">{data.totals?.actual_sum ?? 0}</td>
                    {canEdit && <td className="px-4 py-3" />}
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Модалка редактирования */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditModal(null)}>
          <div
            className="bg-accent-3 dark:bg-dark-900 rounded-xl p-6 max-w-md w-full border border-white/25 dark:border-white/25 animate-page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              Редактировать — {editModal.order_title}
            </h3>
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">{editModal.date}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#ECECEC]/90 mb-1">План</label>
                <input
                  type="number"
                  min="0"
                  value={editModal.planned_qty}
                  onChange={(e) => setEditModal({ ...editModal, planned_qty: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/90 mb-1">Факт</label>
                <input
                  type="number"
                  min="0"
                  value={editModal.actual_qty}
                  onChange={(e) => setEditModal({ ...editModal, actual_qty: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveDay}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
