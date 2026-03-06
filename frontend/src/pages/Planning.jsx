/**
 * Планирование — пошаговый фильтр
 * Порядок: Цех → Модель → Дата (начало/конец) → Этаж
 * Таблица: Дата | План | Факт | Действия
 *
 * Автоподстановка дат: после выбора модели — текущая неделя или месяц.
 * Переключатель [Неделя | Месяц], режим сохраняется в localStorage.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { usePrintHeader } from '../context/PrintContext';
import { NeonCard } from '../components/ui';

const FLOOR_1_HINT = '1 этаж — финиш: ОТК, петля, пуговица, метка, упаковка';
const FLOOR_STORAGE_KEY = 'planning_last_floor';
const DATE_MODE_STORAGE_KEY = 'planning_date_mode';
const PLANNING_WORKSHOP_KEY = 'planning_workshop_id';
const PLANNING_ORDER_KEY = 'planning_order_id';
const PLANNING_FROM_KEY = 'planning_from';
const PLANNING_TO_KEY = 'planning_to';
const PLANNING_WEEKLY_OPEN_KEY = 'planning_weekly_open';

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
  const [searchParams] = useSearchParams();
  const urlInitDone = useRef(false);
  const skipResetFromUrl = useRef(false);

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

  // Расчёт по мощности
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [capacityWeek, setCapacityWeek] = useState('1000');
  const [applySuccess, setApplySuccess] = useState(false);

  // Недельное планирование (план на неделю, факт, перенос остатка)
  const [weeklyOpen, setWeeklyOpen] = useState(() => {
    try {
      return localStorage.getItem(PLANNING_WEEKLY_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [weeklyData, setWeeklyData] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyEditModal, setWeeklyEditModal] = useState(null);
  const [weeklySaving, setWeeklySaving] = useState(false);

  // Периоды планирования (месяцы) для переключателя
  const [periods, setPeriods] = useState([]);

  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager', 'technologist'].includes(user.role);
  const canApply = ['admin', 'manager', 'technologist'].includes(user.role);

  // Шаг 1: цехи
  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  // Инициализация из URL (переход из Отчётов) или из localStorage (после обновления страницы)
  useEffect(() => {
    if (workshops.length === 0) return;
    const wid = searchParams.get('workshop_id');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const fid = searchParams.get('floor_id') ?? '';
    const oid = searchParams.get('order_id') ?? '';
    if (wid && workshops.some((x) => String(x.id) === wid)) {
      // URL-параметры заданы — используем их
      if (!urlInitDone.current) {
        urlInitDone.current = true;
        skipResetFromUrl.current = true;
        setWorkshopId(wid);
        if (fromParam) setFrom(fromParam);
        if (toParam) setTo(toParam);
        if (fid) setFloorId(fid);
        if (oid) setOrderId(oid);
      }
    } else if (!urlInitDone.current) {
      // Нет URL-параметров — восстанавливаем из localStorage
      urlInitDone.current = true;
      try {
        const savedW = localStorage.getItem(PLANNING_WORKSHOP_KEY);
        const savedO = localStorage.getItem(PLANNING_ORDER_KEY);
        const savedFrom = localStorage.getItem(PLANNING_FROM_KEY);
        const savedTo = localStorage.getItem(PLANNING_TO_KEY);
        if (savedW && workshops.some((x) => String(x.id) === savedW)) {
          skipResetFromUrl.current = true;
          setWorkshopId(savedW);
          if (savedFrom) setFrom(savedFrom);
          if (savedTo) setTo(savedTo);
          if (savedO) setOrderId(savedO);
        }
      } catch (_) {}
    }
  }, [workshops, searchParams]);

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
      .then((modelsList) => {
        setModels(modelsList);
        setOrderId((prev) => {
          if (skipResetFromUrl.current) {
            const savedO = localStorage.getItem(PLANNING_ORDER_KEY);
            if (savedO && modelsList.some((m) => String(m.id) === savedO)) return savedO;
          }
          if (prev && !modelsList.some((m) => String(m.id) === prev)) return '';
          return prev;
        });
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
    if (!skipResetFromUrl.current) {
      setOrderId('');
      setFrom('');
      setTo('');
      setFloors([]);
      setFloorId('');
    } else {
      skipResetFromUrl.current = false;
    }
    setData(null);
    setCalcResult(null);
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

  // Сохранение фильтров в localStorage (цех, модель, даты, этаж) — чтобы не сбрасывались при переходах и обновлении
  useEffect(() => {
    try {
      if (workshopId) localStorage.setItem(PLANNING_WORKSHOP_KEY, workshopId);
      if (orderId) localStorage.setItem(PLANNING_ORDER_KEY, orderId);
      if (from) localStorage.setItem(PLANNING_FROM_KEY, from);
      if (to) localStorage.setItem(PLANNING_TO_KEY, to);
      if (floorId) localStorage.setItem(FLOOR_STORAGE_KEY, floorId);
    } catch (_) {}
  }, [workshopId, orderId, from, to, floorId]);

  // Сохранение состояния блока «План на неделю»
  useEffect(() => {
    try {
      localStorage.setItem(PLANNING_WEEKLY_OPEN_KEY, weeklyOpen ? 'true' : 'false');
    } catch (_) {}
  }, [weeklyOpen]);

  // Условие загрузки недельного планирования: цех + этаж (для 4-этажного) + месяц из периода
  const canLoadWeekly =
    workshopId &&
    from &&
    to &&
    (selectedWorkshop?.floors_count === 1 || (selectedWorkshop?.floors_count === 4 && floorId));
  const weeklyMonth = from ? from.slice(0, 7) : '';

  // Загрузка списка периодов (для переключателя месяцев)
  useEffect(() => {
    if (!workshopId) {
      setPeriods([]);
      return;
    }
    api.planning.periods().then(setPeriods).catch(() => setPeriods([]));
  }, [workshopId]);

  // Загрузка недельного планирования (по month или по period_id из выбранного периода)
  useEffect(() => {
    if (!canLoadWeekly || !weeklyMonth || !weeklyOpen) {
      setWeeklyData(null);
      return;
    }
    setWeeklyLoading(true);
    const params = { month: weeklyMonth, workshop_id: workshopId };
    if (selectedWorkshop?.floors_count === 4 && floorId) {
      params.floor_id = floorId;
    }
    api.planning
      .weekly(params)
      .then((data) => {
        setWeeklyData(data);
        // Добавить период из ответа в список, если его ещё нет (например, только что создан)
        if (data?.period?.id) {
          setPeriods((prev) => {
            if (prev.some((p) => p.id === data.period.id)) return prev;
            return [...prev, data.period].sort(
              (a, b) => (a.year - b.year) || (a.month - b.month)
            );
          });
        }
      })
      .catch(() => setWeeklyData(null))
      .finally(() => setWeeklyLoading(false));
  }, [canLoadWeekly, weeklyMonth, workshopId, floorId, selectedWorkshop?.floors_count, weeklyOpen]);

  // Шаг 4: этажи по цеху (только если floors_count > 1)
  useEffect(() => {
    if (!workshopId || !selectedWorkshop || selectedWorkshop.floors_count <= 1) {
      setFloors([]);
      if (!urlInitDone.current) setFloorId('');
      return;
    }
    setFloorsLoading(true);
    api.planning
      .floors(workshopId)
      .then((f) => {
        const list = f || [];
        setFloors(list);
        const fidFromUrl = searchParams.get('floor_id');
        const keepFromUrl = urlInitDone.current && fidFromUrl && list.some((x) => String(x.id) === fidFromUrl);
        if (keepFromUrl) {
          setFloorId(String(fidFromUrl));
        } else {
          const saved = localStorage.getItem(FLOOR_STORAGE_KEY);
          const defaultId = saved && list.some((x) => String(x.id) === saved) ? saved : (list[1]?.id ?? list[0]?.id ?? '');
          setFloorId(String(defaultId));
        }
      })
      .catch(() => setFloors([]))
      .finally(() => setFloorsLoading(false));
  }, [workshopId, selectedWorkshop, searchParams]);

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

  // Загрузка таблицы: дневные строки из единого API plan (production_plan_day + sewing_fact), заголовок из modelTable
  useEffect(() => {
    if (!canLoadTable) {
      setData(null);
      return;
    }
    setTableLoading(true);
    setErrorMsg('');
    const effectiveFloorId = selectedWorkshop?.floors_count === 4 && floorId ? Number(floorId) : 0;
    const planParams = { order_id: orderId, floor_id: effectiveFloorId, date_from: from, date_to: to };
    const tableParams = {
      workshop_id: workshopId,
      order_id: orderId,
      from,
      to,
    };
    if (selectedWorkshop?.floors_count > 1) tableParams.floor_id = floorId;

    Promise.all([
      api.planning.plan(planParams),
      api.planning.modelTable(tableParams),
    ])
      .then(([planRows, tableData]) => {
        const rows = (planRows || []).map((r) => ({
          date: r.date,
          planned_qty: r.planned_qty ?? 0,
          actual_qty: r.fact_qty ?? 0,
        }));
        const planned_sum = rows.reduce((s, r) => s + (r.planned_qty || 0), 0);
        const actual_sum = rows.reduce((s, r) => s + (r.actual_qty || 0), 0);
        setData({
          ...tableData,
          rows,
          totals: { planned_sum, actual_sum },
        });
      })
      .catch((err) => {
        setData(null);
        setErrorMsg(err.message || 'Ошибка загрузки данных');
      })
      .finally(() => setTableLoading(false));
  }, [canLoadTable, workshopId, orderId, from, to, floorId, selectedWorkshop?.floors_count]);

  // Сброс результата расчёта при смене фильтров
  useEffect(() => {
    setCalcResult(null);
  }, [orderId, from, to, floorId]);


  const handleCalcCapacity = async () => {
    if (!canLoadTable) return;
    // Для «Наш цех» (4 этажа) этаж обязателен — иначе бэкенд вернёт ошибку
    if (selectedWorkshop?.floors_count === 4) {
      const fid = Number(floorId);
      if (!floorId || fid < 1 || fid > 4) {
        setErrorMsg('Выберите этаж (1–4) в блоке «4. Этаж»');
        return;
      }
    }
    setCalcLoading(true);
    setErrorMsg('');
    setCalcResult(null);
    try {
      const params = {
        workshop_id: Number(workshopId),
        order_id: Number(orderId),
        from,
        to,
      };
      if (selectedWorkshop?.floors_count === 4 && floorId) {
        params.floor_id = Number(floorId);
      } else if (selectedWorkshop?.floors_count > 1 && floorId) {
        params.floor_id = Number(floorId);
      }
      const cap = parseInt(capacityWeek, 10);
      if (cap >= 1000 && cap <= 5000) {
        params.capacity_week = cap;
      }
      const result = await api.planning.calcCapacity(params);
      setCalcResult(result);
    } catch (err) {
      setErrorMsg(err.message === 'Мощность не задана' ? 'Мощность не задана. Введите мощность в неделю (1000–5000) или сохраните её.' : (err.message || 'Ошибка расчёта'));
    } finally {
      setCalcLoading(false);
    }
  };

  const handleApplyCapacity = async () => {
    if (!calcResult || calcResult.overload || !canApply) return;
    setApplyLoading(true);
    setErrorMsg('');
    try {
      await api.planning.applyCapacity({
        order_id: Number(orderId),
        workshop_id: Number(workshopId),
        floor_id: selectedWorkshop?.floors_count > 1 ? Number(floorId) : null,
        days: calcResult.days,
      });
      setCalcResult(null);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 3000);
      if (canLoadTable) {
        const effectiveFloorId = selectedWorkshop?.floors_count === 4 && floorId ? Number(floorId) : 0;
        Promise.all([
          api.planning.plan({ order_id: orderId, floor_id: effectiveFloorId, date_from: from, date_to: to }),
          api.planning.modelTable({ workshop_id: workshopId, order_id: orderId, from, to, ...(selectedWorkshop?.floors_count > 1 && { floor_id: floorId }) }),
        ]).then(([planRows, tableData]) => {
          const rows = (planRows || []).map((r) => ({ date: r.date, planned_qty: r.planned_qty ?? 0, actual_qty: r.fact_qty ?? 0 }));
          setData({
            ...tableData,
            rows,
            totals: { planned_sum: rows.reduce((s, r) => s + (r.planned_qty || 0), 0), actual_sum: rows.reduce((s, r) => s + (r.actual_qty || 0), 0) },
          });
        }).catch(() => setData(null));
      }
      if (canLoadWeekly && weeklyOpen) {
        const wp = { month: weeklyMonth, workshop_id: workshopId };
        if (selectedWorkshop?.floors_count === 4 && floorId) wp.floor_id = floorId;
        api.planning.weekly(wp).then(setWeeklyData).catch(() => setWeeklyData(null));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка применения плана');
    } finally {
      setApplyLoading(false);
    }
  };

  /** Сохранение ручного плана на неделю */
  const handleSaveWeeklyManual = async () => {
    if (!weeklyEditModal || !workshopId) return;
    setWeeklySaving(true);
    setErrorMsg('');
    try {
      await api.planning.weeklyManual({
        workshop_id: Number(workshopId),
        building_floor_id: selectedWorkshop?.floors_count === 4 ? Number(floorId) : null,
        week_start: weeklyEditModal.week_start,
        row_key: weeklyEditModal.order_id,
        planned_manual: weeklyEditModal.planned_manual,
      });
      setWeeklyEditModal(null);
      if (canLoadWeekly && weeklyOpen) {
        const params = { month: weeklyMonth, workshop_id: workshopId };
        if (selectedWorkshop?.floors_count === 4 && floorId) params.floor_id = floorId;
        api.planning.weekly(params).then(setWeeklyData).catch(() => setWeeklyData(null));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setWeeklySaving(false);
    }
  };

  const handleSaveDay = async () => {
    if (!editModal || !workshopId) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await api.planning.planDay({
        order_id: editModal.order_id,
        floor_id: selectedWorkshop?.floors_count === 4 && floorId ? Number(floorId) : null,
        date: editModal.date,
        planned_qty: editModal.planned_qty,
      });
      setEditModal(null);
      if (canLoadTable) {
        const effectiveFloorId = selectedWorkshop?.floors_count === 4 && floorId ? Number(floorId) : 0;
        Promise.all([
          api.planning.plan({ order_id: orderId, floor_id: effectiveFloorId, date_from: from, date_to: to }),
          api.planning.modelTable({ workshop_id: workshopId, order_id: orderId, from, to, ...(selectedWorkshop?.floors_count > 1 && { floor_id: floorId }) }),
        ]).then(([planRows, tableData]) => {
          const rows = (planRows || []).map((r) => ({ date: r.date, planned_qty: r.planned_qty ?? 0, actual_qty: r.fact_qty ?? 0 }));
          setData({
            ...tableData,
            rows,
            totals: {
              planned_sum: rows.reduce((s, r) => s + (r.planned_qty || 0), 0),
              actual_sum: rows.reduce((s, r) => s + (r.actual_qty || 0), 0),
            },
          });
        }).catch(() => setData(null));
      }
      if (canLoadWeekly && weeklyOpen) {
        const wp = { month: weeklyMonth, workshop_id: workshopId };
        if (selectedWorkshop?.floors_count === 4 && floorId) wp.floor_id = floorId;
        api.planning.weekly(wp).then(setWeeklyData).catch(() => setWeeklyData(null));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const showFloorStep = selectedWorkshop?.floors_count > 1;
  const floor1Selected = showFloorStep && Number(floorId) === 1;

  const printSubtitle = [workshopId && selectedWorkshop?.name && `Цех: ${selectedWorkshop.name}`, from && to && `Период: ${from} — ${to}`].filter(Boolean).join(' | ');
  usePrintHeader('Планирование', printSubtitle || '');

  const selectClass = (disabled) =>
    `px-4 py-2 rounded-btn border ${
      disabled
        ? 'bg-neon-surface2/70 border-white/20 cursor-not-allowed text-neon-muted'
        : 'bg-neon-surface2 border-neon-border text-neon-text focus:shadow-neon'
    }`;

  const inputClass = (disabled) =>
    `px-3 py-2 rounded-btn border ${
      disabled
        ? 'bg-neon-surface2/70 border-white/20 cursor-not-allowed'
        : 'bg-neon-surface2 border-neon-border focus:shadow-neon'
    } ${disabled ? 'text-neon-muted' : 'text-neon-text'}`;

  const fromDateRef = useRef(null);
  const toDateRef = useRef(null);
  const openDatePicker = (ref) => {
    if (!ref?.current || !orderId) return;
    ref.current.focus();
    ref.current.showPicker?.();
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Планирование</h1>
        <PrintButton />
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
            className={`sm:col-span-2 lg:col-span-1 lg:mr-2 transition-all duration-300 ${
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
                  ref={fromDateRef}
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={!orderId}
                  className="sr-only planning-date-input"
                  style={{ colorScheme: 'dark' }}
                  aria-label="Дата начала"
                />
                <button
                  type="button"
                  onClick={() => openDatePicker(fromDateRef)}
                  disabled={!orderId}
                  title={from ? `от ${from}` : 'Выберите дату начала'}
                  className={`p-2.5 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                    !orderId
                      ? 'bg-accent-2/70 border-white/20 cursor-not-allowed opacity-50'
                      : 'bg-accent-2/80 border-white/25 text-[#ECECEC] hover:text-white hover:bg-accent-2'
                  }`}
                  aria-label="Календарь — дата начала"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                <input
                  ref={toDateRef}
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={!orderId}
                  className="sr-only planning-date-input"
                  style={{ colorScheme: 'dark' }}
                  aria-label="Дата окончания"
                />
                <button
                  type="button"
                  onClick={() => openDatePicker(toDateRef)}
                  disabled={!orderId}
                  title={to ? `до ${to}` : 'Выберите дату окончания'}
                  className={`p-2.5 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                    !orderId
                      ? 'bg-accent-2/70 border-white/20 cursor-not-allowed opacity-50'
                      : 'bg-accent-2/80 border-white/25 text-[#ECECEC] hover:text-white hover:bg-accent-2'
                  }`}
                  aria-label="Календарь — дата окончания"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Шаг 4: Этаж (только для Наш цех) */}
          {showFloorStep && (
            <div className="max-w-[200px] lg:ml-4">
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

        {/* План на неделю: ручной план, факт, перенос остатка */}
        <div className="no-print mt-6">
          <button
            type="button"
            onClick={() => setWeeklyOpen(!weeklyOpen)}
            className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-card bg-neon-surface border border-neon-border hover:shadow-neon transition-colors"
          >
            <svg className={`w-5 h-5 transition-transform ${weeklyOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span className="font-medium text-[#ECECEC] dark:text-dark-text">План на неделю</span>
          </button>
          {weeklyOpen && (
            <div className="mt-2 p-4 rounded-card bg-neon-surface border border-neon-border">
              {canLoadWeekly && (
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <label className="text-sm text-[#ECECEC]/80">Месяц:</label>
                  <select
                    value={weeklyMonth || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__next__') {
                        const last = periods.length ? periods[periods.length - 1] : null;
                        if (last) {
                          const y = last.month === 12 ? last.year + 1 : last.year;
                          const m = last.month === 12 ? 1 : last.month + 1;
                          const start = `${y}-${String(m).padStart(2, '0')}-01`;
                          const end = new Date(y, m, 0);
                          const endStr = `${y}-${String(m).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
                          setFrom(start);
                          setTo(endStr);
                          setDateMode('month');
                        }
                        return;
                      }
                      const p = periods.find((x) => `${x.year}-${String(x.month).padStart(2, '0')}` === val);
                      if (p) {
                        setFrom(p.start_date);
                        setTo(p.end_date);
                        setDateMode('month');
                      }
                    }}
                    className="bg-neon-bg border border-neon-border rounded px-3 py-1.5 text-sm text-[#ECECEC] focus:ring-1 focus:ring-primary-400"
                  >
                    {weeklyMonth && !periods.some((p) => `${p.year}-${String(p.month).padStart(2, '0')}` === weeklyMonth) && (
                      <option value={weeklyMonth}>
                        {new Date(weeklyMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                      </option>
                    )}
                    {periods.map((p) => {
                      const val = `${p.year}-${String(p.month).padStart(2, '0')}`;
                      const label = new Date(p.year, p.month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
                      return (
                        <option key={p.id} value={val}>
                          {label} {p.status === 'CLOSED' ? '(закрыт)' : ''}
                        </option>
                      );
                    })}
                    {periods.length > 0 && (() => {
                      const last = periods[periods.length - 1];
                      const y = last.month === 12 ? last.year + 1 : last.year;
                      const m = last.month === 12 ? 1 : last.month + 1;
                      const nextVal = `${y}-${String(m).padStart(2, '0')}`;
                      if (nextVal === weeklyMonth) return null;
                      const nextLabel = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
                      return (
                        <option key="next" value="__next__">
                          + {nextLabel} (новый)
                        </option>
                      );
                    })()}
                  </select>
                  {weeklyData?.period?.status === 'CLOSED' && (
                    <span className="text-sm text-amber-400">Период закрыт — только просмотр</span>
                  )}
                </div>
              )}
              {!canLoadWeekly ? (
                <p className="text-sm text-[#ECECEC]/60">Выберите цех, этаж и период (для месяца)</p>
              ) : weeklyLoading ? (
                <p className="text-sm text-[#ECECEC]/80">Загрузка...</p>
              ) : !weeklyData ? (
                <p className="text-sm text-[#ECECEC]/60">Нет данных</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left px-2 py-2 font-medium text-neon-muted border-r border-white/20">Заказчик / Модель</th>
                        {weeklyData.weeks?.map((w) => (
                          <th key={w.week_start} className="text-center px-2 py-2 font-medium text-neon-muted whitespace-nowrap border-r border-white/20">
                            {w.week_start} — {w.week_end}
                          </th>
                        ))}
                        <th className="text-right px-2 py-2 font-medium text-neon-muted">Итого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyData.rows?.map((row) => (
                        <React.Fragment key={row.customer_name}>
                          {row.orders?.map((ord) => (
                            <tr key={ord.order_id} className="border-b border-white/10 hover:bg-white/5">
                              <td className="px-2 py-2 text-[#ECECEC] border-r border-white/20">
                                <span className="text-[#ECECEC]/70">{row.customer_name}</span> — {ord.order_title}
                              </td>
                              {weeklyData.weeks?.map((w) => {
                                const item = ord.items?.find((i) => i.week_start === w.week_start);
                                if (!item) return <td key={w.week_start} className="px-2 py-2 text-right border-r border-white/20">—</td>;
                                return (
                                  <td key={w.week_start} className="px-2 py-2 text-right border-r border-white/20">
                                    <div className="space-y-0.5">
                                      <div title={`План: ${item.planned_total}, Факт: ${item.fact_qty}`}>
                                        {item.planned_total} / {item.fact_qty}
                                      </div>
                                      {canEdit && weeklyData.period?.status !== 'CLOSED' && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setWeeklyEditModal({
                                              order_id: ord.order_id,
                                              order_title: ord.order_title,
                                              week_start: w.week_start,
                                              week_end: w.week_end,
                                              planned_manual: item.planned_manual,
                                            })
                                          }
                                          className="text-xs text-primary-400 hover:underline"
                                        >
                                          Изменить план
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2 text-right font-medium">
                                {ord.month_plan} / {ord.month_fact}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                      <tr className="border-t-2 border-white/20 font-bold bg-accent-2/30">
                        <td className="px-2 py-3 text-neon-text border-r border-white/20">Мощность / Загрузка</td>
                        {weeklyData.week_totals?.map((wt) => (
                          <td key={wt.week_start} className="px-2 py-3 text-center text-neon-text border-r border-white/20" title={`Мощность: ${wt.capacity_week || 'не задана'}, Загрузка: ${wt.load_week}`}>
                            {wt.capacity_week > 0 ? wt.capacity_week : '—'} / {wt.load_week}
                            {wt.capacity_week > 0 && (
                              <span className="block text-xs font-normal text-[#ECECEC]/70">{wt.utilization}%</span>
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-3 text-right text-neon-text">{weeklyData.totals?.load_month ?? 0}</td>
                      </tr>
                      <tr className="border-t border-white/20 font-bold">
                        <td className="px-2 py-2 text-neon-text border-r border-white/20">Итого по месяцу</td>
                        {weeklyData.weeks?.map((w) => (
                          <td key={w.week_start} className="px-2 py-2 border-r border-white/20" />
                        ))}
                        <td className="px-2 py-2 text-right text-neon-text">
                          {weeklyData.totals?.month_plan ?? 0} / {weeklyData.totals?.month_fact ?? 0}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Расчёт по мощности */}
        {canLoadTable && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm text-[#ECECEC]/80 mb-1">Мощность в неделю (1000–5000 ед)</label>
              <input
                type="number"
                min="1000"
                max="5000"
                value={capacityWeek}
                onChange={(e) => setCapacityWeek(e.target.value)}
                placeholder="1000–5000"
                className="px-3 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] w-48"
              />
            </div>
            <button
              type="button"
              onClick={handleCalcCapacity}
              disabled={calcLoading}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {calcLoading ? 'Расчёт...' : 'Рассчитать автоматически'}
            </button>
            {canApply && applySuccess && orderId && (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-green-400">План применён</span>
                <Link
                  to={`/orders/${orderId}`}
                  className="text-primary-400 hover:text-primary-300 underline"
                >
                  Перейти к заказу
                </Link>
              </span>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Информационный блок после расчёта */}
      {calcResult && (
        <div className="no-print mb-6 space-y-4">
          <div className="bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 p-4">
            <h3 className="text-sm font-semibold text-[#ECECEC] dark:text-dark-text mb-3">Расчёт по мощности</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-[#ECECEC]/60">Общее количество заказа</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.total_quantity} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Уже выполнено (факт)</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.actual_total} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Остаток (к распределению)</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.remaining} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Дневная мощность этажа</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.daily_capacity} ед/день</p>
              </div>
              {calcResult.capacity_week && (
                <div>
                  <span className="text-[#ECECEC]/60">Мощность в неделю (задана)</span>
                  <p className="font-medium text-[#ECECEC]">{calcResult.capacity_week} ед/неделю</p>
                </div>
              )}
              <div>
                <span className="text-[#ECECEC]/60">Количество дней</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.working_days}</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">Общая мощность периода</span>
                <p className="font-medium text-[#ECECEC]">{calcResult.total_capacity} ед</p>
              </div>
              <div>
                <span className="text-[#ECECEC]/60">% загрузки</span>
                <p className={`font-medium ${calcResult.overload ? 'text-red-400' : 'text-[#ECECEC]'}`}>
                  {calcResult.percent}%
                </p>
              </div>
            </div>

            {calcResult.overload && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500 text-red-400 text-sm">
                Не хватает мощности. Остаток {calcResult.remainder_after ?? calcResult.remaining} ед не распределён.
                Увеличьте период или мощность.
              </div>
            )}

            {!calcResult.overload && calcResult.days?.length > 0 && (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[300px]">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left px-4 py-2 text-sm font-medium text-[#ECECEC]/90">Дата</th>
                        <th className="text-right px-4 py-2 text-sm font-medium text-[#ECECEC]/90">Предложенный план (ед)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcResult.days.map((d) => (
                        <tr key={d.date} className="border-b border-white/10">
                          <td className="px-4 py-2 text-[#ECECEC]/90 whitespace-nowrap">{d.date}</td>
                          <td className="px-4 py-2 text-right text-[#ECECEC]/90">{d.planned_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canApply && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleApplyCapacity}
                      disabled={applyLoading}
                      className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {applyLoading ? 'Применение...' : 'Применить план'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{errorMsg}</div>
      )}

      {/* Пустое состояние */}
      {!workshopId && (
        <NeonCard className="p-12 text-center text-neon-muted transition-block">
          Выберите цех
        </NeonCard>
      )}

      {/* Таблица */}
      {workshopId && (
        <NeonCard className="print-area overflow-hidden overflow-x-auto transition-block p-0">
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
                    <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Дата</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-neon-muted">План</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-neon-muted">Факт</th>
                    {canEdit && <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Действия</th>}
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
                    <td className="px-4 py-3 text-neon-text">Итого</td>
                    <td className="px-4 py-3 text-right text-neon-text">{data.totals?.planned_sum ?? 0}</td>
                    <td className="px-4 py-3 text-right text-neon-text">{data.totals?.actual_sum ?? 0}</td>
                    {canEdit && <td className="px-4 py-3" />}
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </NeonCard>
      )}

      {/* Модалка редактирования плана на неделю */}
      {weeklyEditModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden" onClick={() => setWeeklyEditModal(null)}>
          <div
            className="bg-accent-3 dark:bg-dark-900 rounded-xl p-6 max-w-md w-full border border-white/25 dark:border-white/25"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
              План на неделю — {weeklyEditModal.order_title}
            </h3>
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">
              {weeklyEditModal.week_start} — {weeklyEditModal.week_end}
            </p>
            <div>
              <label className="block text-sm text-[#ECECEC]/90 mb-1">План (ручной ввод)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={weeklyEditModal.planned_manual}
                onChange={(e) =>
                  setWeeklyEditModal({
                    ...weeklyEditModal,
                    planned_manual: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={() => setWeeklyEditModal(null)}
                className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveWeeklyManual}
                disabled={weeklySaving}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {weeklySaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Модалка редактирования */}
      {editModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden" onClick={() => setEditModal(null)}>
          <div
            className="bg-accent-3 dark:bg-dark-900 rounded-xl p-6 max-w-md w-full border border-white/25 dark:border-white/25"
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
                <label className="block text-sm text-[#ECECEC]/90 mb-1">Факт (только просмотр; ввод — в Задачах по этажам)</label>
                <input
                  type="number"
                  min="0"
                  value={editModal.actual_qty}
                  readOnly
                  className="w-full px-4 py-2 rounded-lg bg-accent-2/50 dark:bg-dark-800/50 border border-white/20 text-[#ECECEC]/80 dark:text-dark-text/80 cursor-not-allowed"
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
        </div>,
        document.body
      )}
    </div>
  );
}


